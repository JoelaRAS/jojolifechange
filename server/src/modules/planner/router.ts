import { Router } from "express";
import { google } from "googleapis";
import { sign, verify } from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../services/prisma";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { DateTime } from "luxon";

const plannerRouter = Router();

const PROVIDER = "google";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const DEFAULT_TIMEZONE = "Europe/Paris";

const resolveRedirectUri = () => {
  if (env.googleRedirectUri) {
    return env.googleRedirectUri;
  }
  const normalizedBase = env.appBaseUrl.endsWith("/") ? env.appBaseUrl.slice(0, -1) : env.appBaseUrl;
  return `${normalizedBase}/api/planner/oauth/callback`;
};

const ensureGoogleConfig = () => {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new Error("Google Calendar integration is not configured.");
  }
};

const createOAuthClient = () => {
  ensureGoogleConfig();
  const redirectUri = resolveRedirectUri();
  return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, redirectUri);
};

const createStateToken = (userId: string) =>
  sign({ userId }, env.jwtSecret, {
    expiresIn: "10m"
  });

const parseStateToken = (token: string): string | null => {
  try {
    const payload = verify(token, env.jwtSecret) as { userId: string };
    return payload.userId;
  } catch (error) {
    return null;
  }
};

const upsertCredential = async (params: {
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
    where: { userId_provider: { userId, provider: PROVIDER } }
  });

  const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) {
    throw new Error("Missing refresh token from Google response. Please reconnect your calendar.");
  }

  const data = {
    provider: PROVIDER,
    accessToken: tokens.access_token ?? existing?.accessToken ?? "",
    refreshToken,
    scope: tokens.scope ?? existing?.scope ?? null,
    tokenType: tokens.token_type ?? existing?.tokenType ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.expiryDate ?? null
  };

  await prisma.calendarCredential.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    update: data,
    create: {
      userId,
      ...data
    }
  });
};

const getAuthorizedCalendar = async (userId: string) => {
  const credential = await prisma.calendarCredential.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } }
  });
  if (!credential) {
    return null;
  }
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    scope: credential.scope ?? undefined,
    token_type: credential.tokenType ?? undefined,
    expiry_date: credential.expiryDate ? credential.expiryDate.getTime() : undefined
  });

  oauth2Client.on("tokens", async (tokens) => {
    await upsertCredential({
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

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  return { calendar, credential };
};

plannerRouter.get("/status", requireAuth, async (req, res) => {
  const credential = await prisma.calendarCredential.findUnique({
    where: { userId_provider: { userId: req.userId!, provider: PROVIDER } }
  });

  return res.json({
    connected: Boolean(credential)
  });
});

plannerRouter.get("/events", requireAuth, async (req, res) => {
  const client = await getAuthorizedCalendar(req.userId!);
  if (!client) {
    return res.status(400).json({ message: "Aucun calendrier connecté. Veuillez connecter Google Calendar." });
  }

  try {
    const result = await client.calendar.events.list({
      calendarId: "primary",
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date().toISOString()
    });

    const events = (result.data.items ?? []).map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
      htmlLink: event.htmlLink ?? null
    }));

    return res.json({ events });
  } catch (error) {
    console.error("[Planner] Failed to fetch events", error);
    return res.status(500).json({ message: "Impossible de récupérer les événements Google Calendar." });
  }
});

plannerRouter.get("/oauth/url", requireAuth, async (req, res) => {
  try {
    ensureGoogleConfig();
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }

  const oauth2Client = createOAuthClient();
  const state = createStateToken(req.userId!);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });

  return res.json({ url: authUrl });
});

plannerRouter.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter.");
  }

  const userId = parseStateToken(state);
  if (!userId) {
    return res.status(400).send("Invalid state parameter.");
  }

  let tokens;
  try {
    const oauth2Client = createOAuthClient();
    const response = await oauth2Client.getToken(code);
    tokens = response.tokens;
  } catch (error) {
    console.error("[Planner] Failed to exchange token", error);
    return res.status(500).send("Unable to retrieve access token from Google.");
  }

  try {
    await upsertCredential({
      userId,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date
      }
    });
  } catch (error) {
    console.error("[Planner] Failed to store tokens", error);
    return res.status(500).send("Unable to store Google credentials.");
  }

  const redirectUrl = `${env.appBaseUrl.replace(/\/$/, "")}/planner?connected=1`;
  return res.redirect(redirectUrl);
});

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().min(5).max(1440),
  timezone: z.string().optional(),
  calendarId: z.string().optional()
});

plannerRouter.post("/events", requireAuth, async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }

  const { title, description, date, startTime, durationMinutes, timezone, calendarId } = parsed.data;

  const client = await getAuthorizedCalendar(req.userId!);
  if (!client) {
    return res.status(400).json({ message: "Aucun calendrier connecté. Veuillez connecter Google Calendar." });
  }

  const zone = timezone ?? DEFAULT_TIMEZONE;
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone });
  if (!start.isValid) {
    return res.status(400).json({ message: "Date ou heure invalide." });
  }
  const end = start.plus({ minutes: durationMinutes });

  const formatForGoogle = (dt: DateTime) =>
    dt.setZone(zone, { keepLocalTime: true }).toISO({ suppressMilliseconds: true, includeOffset: true }) ?? dt.toISO();

  const eventBody = {
    summary: title,
    description,
    start: {
      dateTime: formatForGoogle(start),
      timeZone: zone
    },
    end: {
      dateTime: formatForGoogle(end),
      timeZone: zone
    }
  };

  const targetCalendarId = calendarId ?? "primary";

  try {
    const response = await client.calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: eventBody
    });

    return res.status(201).json({
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
      status: response.data.status
    });
  } catch (error) {
    console.error("[Planner] Failed to create event", error);
    return res.status(500).json({ message: "Impossible de créer l'événement sur Google Calendar." });
  }
});

export { plannerRouter };
