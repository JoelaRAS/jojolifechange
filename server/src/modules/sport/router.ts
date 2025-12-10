import { Router } from "express";
import { z } from "zod";
import { google } from "googleapis";
import type { fitness_v1 } from "googleapis";
import { DateTime } from "luxon";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";
import { env } from "../../config/env";

const sportRouter = Router();

const defaultTemplates = [
  {
    name: "Upper 1",
    description: "Séance haut du corps 1 (Lucas Gouiffes)",
    focus: "upper",
    exercises: [
      { name: "Développé couché", sets: 3, repsMin: 8, repsMax: 15, restSeconds: 150 },
      { name: "Tirage horizontal", sets: 3, repsMin: 8, repsMax: 15, restSeconds: 150 },
      { name: "Élévations latérales", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { name: "Flexion biceps", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { name: "Crunch poulie", sets: 3, repsMin: 15, repsMax: 15, restSeconds: 60 }
    ]
  },
  {
    name: "Lower 1",
    description: "Séance bas du corps 1 (Lucas Gouiffes)",
    focus: "lower",
    exercises: [
      { name: "Squat", sets: 3, repsMin: 8, repsMax: 15, restSeconds: 150 },
      { name: "Fentes", sets: 3, repsMin: 8, repsMax: 15, restSeconds: 120 },
      { name: "Leg curl", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { name: "Mollets debout", sets: 3, repsMin: 20, repsMax: 20, restSeconds: 60 },
      { name: "Enroulement bassin", sets: 3, repsMin: 20, repsMax: 20, restSeconds: 60 }
    ]
  },
  {
    name: "Upper 2",
    description: "Séance haut du corps 2 (Lucas Gouiffes)",
    focus: "upper",
    exercises: [
      { name: "Développé incliné", sets: 3, repsMin: 8, repsMax: 15, restSeconds: 150 },
      { name: "Tractions assistées", sets: 3, repsMin: 8, repsMax: 15, restSeconds: 150 },
      { name: "Élévations frontales", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { name: "Extension triceps", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { name: "Gainage planche", sets: 3, repsMin: 45, repsMax: 60, restSeconds: 60 }
    ]
  },
  {
    name: "Lower 2",
    description: "Séance bas du corps 2 (Lucas Gouiffes)",
    focus: "lower",
    exercises: [
      { name: "Soulevé de terre jambes tendues", sets: 3, repsMin: 8, repsMax: 12, restSeconds: 150 },
      { name: "Presse à cuisses", sets: 3, repsMin: 10, repsMax: 15, restSeconds: 120 },
      { name: "Leg extension", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90 },
      { name: "Mollets assis", sets: 3, repsMin: 20, repsMax: 20, restSeconds: 60 },
      { name: "Planche latérale", sets: 3, repsMin: 45, repsMax: 60, restSeconds: 60 }
    ]
  }
];

const GOOGLE_FIT_PROVIDER = "google-fit";
const GOOGLE_FIT_SCOPES = ["https://www.googleapis.com/auth/fitness.activity.read"];
const DEFAULT_STEP_GOAL = 10000;

const resolveFitnessRedirectUri = () => {
  const baseUrl = env.appBaseUrl.endsWith("/") ? env.appBaseUrl.slice(0, -1) : env.appBaseUrl;
  return `${baseUrl}/api/sport/steps/oauth/callback`;
};

const ensureGoogleConfig = () => {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new Error("Google Fit integration is not configured.");
  }
};

const createFitnessOAuthClient = () => {
  ensureGoogleConfig();
  return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, resolveFitnessRedirectUri());
};

const upsertFitnessCredential = async (params: {
  userId: string;
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string | null;
    token_type?: string | null;
    expiry_date?: number | null;
  };
}) => {
  const { userId, tokens } = params;
  const existing = await prisma.calendarCredential.findUnique({
    where: { userId_provider: { userId, provider: GOOGLE_FIT_PROVIDER } }
  });

  const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) {
    throw new Error("Missing refresh token from Google Fit response. Please reconnect.");
  }

  const data = {
    provider: GOOGLE_FIT_PROVIDER,
    accessToken: tokens.access_token ?? existing?.accessToken ?? "",
    refreshToken,
    scope: tokens.scope ?? existing?.scope ?? null,
    tokenType: tokens.token_type ?? existing?.tokenType ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.expiryDate ?? null
  };

  await prisma.calendarCredential.upsert({
    where: { userId_provider: { userId, provider: GOOGLE_FIT_PROVIDER } },
    update: data,
    create: {
      userId,
      ...data
    }
  });
};

const getAuthorizedFitnessClient = async (userId: string) => {
  const credential = await prisma.calendarCredential.findUnique({
    where: { userId_provider: { userId, provider: GOOGLE_FIT_PROVIDER } }
  });
  if (!credential) {
    return null;
  }

  const oauth2Client = createFitnessOAuthClient();
  oauth2Client.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    scope: credential.scope ?? undefined,
    token_type: credential.tokenType ?? undefined,
    expiry_date: credential.expiryDate ? credential.expiryDate.getTime() : undefined
  });

  oauth2Client.on("tokens", async (tokens) => {
    await upsertFitnessCredential({
      userId,
      tokens: {
        access_token: tokens.access_token ?? undefined,
        refresh_token: tokens.refresh_token ?? undefined,
        scope: tokens.scope ?? undefined,
        token_type: tokens.token_type ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined
      }
    });
  });

  return oauth2Client;
};

const fetchDailySteps = async (userId: string, start: Date, end: Date) => {
  const steps = await prisma.dailyStep.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end
      }
    },
    orderBy: { date: "asc" }
  });

  return steps.map((item) => ({
    id: item.id,
    date: item.date.toISOString().split("T")[0],
    steps: item.steps,
    source: item.source
  }));
};

sportRouter.get("/steps/oauth/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter.");
  }

  let userId: string;
  try {
    const parsed = JSON.parse(state) as { userId: string };
    userId = parsed.userId;
    if (!userId) throw new Error("Invalid state payload.");
  } catch (error) {
    console.error("[Sport] Invalid Google Fit state parameter", error);
    return res.status(400).send("Invalid state parameter.");
  }

  try {
    const oauth2Client = createFitnessOAuthClient();
    const response = await oauth2Client.getToken(code);
    await upsertFitnessCredential({
      userId,
      tokens: {
        access_token: response.tokens.access_token,
        refresh_token: response.tokens.refresh_token,
        scope: response.tokens.scope,
        token_type: response.tokens.token_type,
        expiry_date: response.tokens.expiry_date
      }
    });
  } catch (error) {
    console.error("[Sport] Failed to store Google Fit token", error);
    return res.status(500).send("Unable to connect Google Fit.");
  }

  const redirectUrl = `${env.appBaseUrl.replace(/\/$/, "")}/sport?fit=1`;
  return res.redirect(redirectUrl);
});

sportRouter.use(requireAuth);

const ensureTemplates = async () => {
  const existing = await prisma.workoutTemplate.findMany({ include: { exercises: true } });
  if (existing.length) {
    return existing;
  }

  const templates = await Promise.all(
    defaultTemplates.map((template) =>
      prisma.workoutTemplate.create({
        data: {
          name: template.name,
          description: template.description,
          focus: template.focus,
          exercises: {
            create: template.exercises.map((exercise, index) => ({
              name: exercise.name,
              sets: exercise.sets,
              repsMin: exercise.repsMin,
              repsMax: exercise.repsMax,
              restSeconds: exercise.restSeconds,
              ordering: index
            }))
          }
        },
        include: { exercises: true }
      })
    )
  );

  return templates;
};

const sessionSchema = z.object({
  templateId: z.string().uuid(),
  date: z.coerce.date().optional(),
  notes: z.string().optional(),
  sets: z
    .array(
      z.object({
        exercise: z.string().min(1),
        setNumber: z.number().int().positive(),
        weight: z.number().nonnegative().optional(),
        reps: z.number().int().nonnegative().optional(),
        rpe: z.number().min(0).max(10).optional()
      })
    )
    .min(1)
});

const sessionsQuerySchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional()
});

const sessionUpdateSchema = sessionSchema.partial();

const stepGoalSchema = z.object({
  target: z.number().int().positive().max(200000)
});

const stepsSyncSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional()
});

const dailyStepsQuerySchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  days: z.coerce.number().int().positive().max(365).optional()
});

sportRouter.get("/templates", async (_req, res) => {
  const templates = await ensureTemplates();
  return res.json(templates);
});

sportRouter.post("/sessions", async (req, res) => {
  const userId = req.userId!;
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { templateId, date, notes, sets } = parsed.data;
  const template = await prisma.workoutTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    return res.status(404).json({ message: "Template not found" });
  }

  const session = await prisma.workoutSession.create({
    data: {
      userId,
      templateId,
      date: date ?? new Date(),
      notes,
      sets: {
        create: sets.map((set) => ({
          exercise: set.exercise,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          volume:
            set.weight !== undefined && set.reps !== undefined
              ? Math.round(set.weight * set.reps * 100) / 100
              : null
        }))
      }
    },
    include: {
      sets: true,
      template: {
        include: { exercises: true }
      }
    }
  });

  return res.status(201).json(session);
});

sportRouter.get("/sessions", async (req, res) => {
  const userId = req.userId!;
  const parsed = sessionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { start, end } = parsed.data;
  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end
      }
    },
    include: {
      sets: true,
      template: true
    },
    orderBy: { date: "desc" }
  });

  return res.json(sessions);
});

sportRouter.get("/sessions/latest", async (req, res) => {
  const userId = req.userId!;
  const session = await prisma.workoutSession.findFirst({
    where: { userId },
    include: {
      sets: true,
      template: true
    },
    orderBy: { date: "desc" }
  });

  return res.json(session);
});

sportRouter.get("/progress", async (req, res) => {
  const userId = req.userId!;
  const exercise = typeof req.query.exercise === "string" ? req.query.exercise : undefined;
  if (!exercise) {
    return res.status(400).json({ message: "exercise query parameter is required" });
  }

  const sets = await prisma.workoutSet.findMany({
    where: {
      session: {
        userId
      },
      exercise: {
        equals: exercise,
        mode: "insensitive"
      }
    },
    include: {
      session: true
    },
    orderBy: [{ session: { date: "asc" } }, { setNumber: "asc" }]
  });

  const dataset = sets.map((set) => ({
    date: set.session.date,
    setNumber: set.setNumber,
    weight: set.weight,
    reps: set.reps,
    volume: set.volume,
    rpe: set.rpe
  }));

  return res.json(dataset);
});

sportRouter.get("/overview", async (req, res) => {
  const userId = req.userId!;
  const lastSessions = await prisma.workoutSession.findMany({
    where: { userId },
    include: { sets: true, template: true },
    orderBy: { date: "desc" },
    take: 10
  });

  const totalVolumeByExercise = new Map<string, number>();
  lastSessions.forEach((session) => {
    session.sets.forEach((set) => {
      if (!set.volume) return;
      const key = set.exercise.toLowerCase();
      totalVolumeByExercise.set(key, (totalVolumeByExercise.get(key) ?? 0) + set.volume);
    });
  });

  const perTemplate = new Map<string, number>();
  lastSessions.forEach((session) => {
    const key = session.template?.name ?? "Autre";
    const sessionVolume = session.sets.reduce((acc, set) => acc + (set.volume ?? 0), 0);
    perTemplate.set(key, (perTemplate.get(key) ?? 0) + sessionVolume);
  });

  return res.json({
    sessions: lastSessions,
    volumeByExercise: Array.from(totalVolumeByExercise.entries()).map(([name, volume]) => ({
      name,
      volume
    })),
    volumeByTemplate: Array.from(perTemplate.entries()).map(([template, volume]) => ({
      template,
      volume
    }))
  });
});

sportRouter.put("/sessions/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = sessionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const existing = await prisma.workoutSession.findFirst({
    where: { id, userId },
    include: { sets: true }
  });
  if (!existing) {
    return res.status(404).json({ message: "Session not found" });
  }

  const { templateId, date, notes, sets } = parsed.data;
  const data: Record<string, unknown> = {};
  if (templateId) {
    const template = await prisma.workoutTemplate.findFirst({ where: { id: templateId } });
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    data.templateId = templateId;
  }
  if (date) data.date = date;
  if (typeof notes === "string") data.notes = notes;

  if (sets) {
    data.sets = {
      deleteMany: {},
      create: sets.map((set) => ({
        exercise: set.exercise,
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        volume:
          set.weight !== undefined && set.reps !== undefined
            ? Math.round(set.weight * set.reps * 100) / 100
            : null
      }))
    };
  }

  const updated = await prisma.workoutSession.update({
    where: { id },
    data,
    include: { sets: true, template: true }
  });

  return res.json(updated);
});

sportRouter.delete("/sessions/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const existing = await prisma.workoutSession.findFirst({ where: { id, userId } });
  if (!existing) {
    return res.status(404).json({ message: "Session not found" });
  }

  await prisma.workoutSession.delete({ where: { id } });
  return res.status(204).send();
});

sportRouter.get("/steps/status", async (req, res) => {
  const userId = req.userId!;
  const [credential, goal, lastEntry] = await Promise.all([
    prisma.calendarCredential.findUnique({
      where: { userId_provider: { userId, provider: GOOGLE_FIT_PROVIDER } }
    }),
    prisma.stepGoal.findFirst({ where: { userId } }),
    prisma.dailyStep.findFirst({ where: { userId }, orderBy: { date: "desc" } })
  ]);

  return res.json({
    connected: Boolean(credential),
    target: goal?.target ?? DEFAULT_STEP_GOAL,
    hasCustomTarget: Boolean(goal),
    lastSyncedAt: lastEntry ? lastEntry.updatedAt.toISOString() : null
  });
});

sportRouter.get("/steps/oauth/url", async (req, res) => {
  try {
    ensureGoogleConfig();
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }

  const oauth2Client = createFitnessOAuthClient();
  const state = JSON.stringify({ userId: req.userId! });
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_FIT_SCOPES,
    state
  });
  return res.json({ url });
});

sportRouter.put("/steps/goal", async (req, res) => {
  const userId = req.userId!;
  const parsed = stepGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const goal = await prisma.stepGoal.upsert({
    where: { userId },
    update: { target: parsed.data.target },
    create: {
      userId,
      target: parsed.data.target
    }
  });

  return res.json({ target: goal.target, updatedAt: goal.updatedAt.toISOString() });
});

sportRouter.get("/steps/daily", async (req, res) => {
  const userId = req.userId!;
  const parsed = dailyStepsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const now = DateTime.now();
  const end = parsed.data.end ? DateTime.fromJSDate(parsed.data.end).endOf("day") : now.endOf("day");
  let start: DateTime;
  if (parsed.data.start) {
    start = DateTime.fromJSDate(parsed.data.start).startOf("day");
  } else {
    const days = parsed.data.days ?? 30;
    start = end.minus({ days: days - 1 }).startOf("day");
  }

  const data = await fetchDailySteps(userId, start.toJSDate(), end.toJSDate());
  return res.json({ data });
});

sportRouter.post("/steps/sync", async (req, res) => {
  const userId = req.userId!;
  const parsed = stepsSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const oauth2Client = await getAuthorizedFitnessClient(userId);
  if (!oauth2Client) {
    return res.status(400).json({ message: "Aucun compte Google Fit connecté." });
  }

  const endDateTime = parsed.data.end ? DateTime.fromJSDate(parsed.data.end).endOf("day") : DateTime.now().endOf("day");
  const startDateTime = parsed.data.start
    ? DateTime.fromJSDate(parsed.data.start).startOf("day")
    : endDateTime.minus({ days: 29 }).startOf("day");

  const fitness = google.fitness({ version: "v1", auth: oauth2Client });

  try {
    const request: fitness_v1.Params$Resource$Users$Dataset$Aggregate = {
      userId: "me",
      requestBody: {
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: String(24 * 60 * 60 * 1000) },
        startTimeMillis: startDateTime.toMillis().toString(),
        endTimeMillis: endDateTime.toMillis().toString()
      }
    };

    const { data } = await fitness.users.dataset.aggregate(request);

    const buckets = data.bucket ?? [];
    for (const bucket of buckets) {
      const startMillis = bucket.startTimeMillis ? Number(bucket.startTimeMillis) : undefined;
      if (!startMillis) continue;

      const day = DateTime.fromMillis(startMillis).startOf("day");
      let steps = 0;

      for (const dataset of bucket.dataset ?? []) {
        for (const point of dataset.point ?? []) {
          for (const value of point.value ?? []) {
            if (value.intVal !== undefined && value.intVal !== null) {
              steps += value.intVal;
            } else if (value.fpVal !== undefined && value.fpVal !== null) {
              steps += Math.round(value.fpVal);
            }
          }
        }
      }

      await prisma.dailyStep.upsert({
        where: {
          userId_date: {
            userId,
            date: day.toJSDate()
          }
        },
        update: {
          steps,
          source: "google_fit"
        },
        create: {
          userId,
          date: day.toJSDate(),
          steps,
          source: "google_fit"
        }
      });
    }
  } catch (error) {
    console.error("[Sport] Failed to sync Google Fit steps", error);
    return res.status(500).json({ message: "Impossible de récupérer les données Google Fit." });
  }

  const data = await fetchDailySteps(userId, startDateTime.toJSDate(), endDateTime.toJSDate());
  return res.json({ data });
});

export { sportRouter };
