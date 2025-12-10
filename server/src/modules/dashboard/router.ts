import { Router } from "express";
import { addDays, startOfDay, subDays } from "date-fns";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";

const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/overview", async (req, res) => {
  const userId = req.userId!;
  const today = startOfDay(new Date());
  const fourteenDaysAgo = subDays(today, 13);
  const sixMonthsAgo = subDays(today, 30 * 6);

  const [metricEntries, weekLogs, transactions, projects, contacts, sessions] = await Promise.all([
    prisma.metricEntry.findMany({
      where: { userId, date: { gte: fourteenDaysAgo, lte: addDays(today, 1) } },
      orderBy: { date: "asc" }
    }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: fourteenDaysAgo, lte: addDays(today, 1) } },
      orderBy: { date: "asc" }
    }),
    prisma.financeTransaction.findMany({
      where: { userId, occurredAt: { gte: sixMonthsAgo, lte: addDays(today, 1) } }
    }),
    prisma.project.findMany({ where: { userId }, include: { tasks: true } }),
    prisma.contact.findMany({ where: { userId } }),
    prisma.workoutSession.findMany({
      where: { userId, date: { gte: fourteenDaysAgo, lte: addDays(today, 1) } },
      include: { sets: true }
    })
  ]);

  const latestMetric = metricEntries[metricEntries.length - 1] ?? null;
  const weight = latestMetric?.weight ?? null;
  const metricByDate = new Map(
    metricEntries.map((entry) => [entry.date.toISOString().split("T")[0], entry])
  );

  const caloriesByDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  weekLogs.forEach((log) => {
    const key = log.date.toISOString().split("T")[0];
    const current = caloriesByDate.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    current.calories += log.calories;
    current.protein += log.protein;
    current.carbs += log.carbs;
    current.fat += log.fat;
    caloriesByDate.set(key, current);
  });

  const caloriesAverage = caloriesByDate.size
    ? [...caloriesByDate.values()].reduce((acc, day) => acc + day.calories, 0) / caloriesByDate.size
    : 0;

  const caloriesVsWeight = Array.from({ length: 14 }).map((_, index) => {
    const date = addDays(fourteenDaysAgo, index);
    const iso = date.toISOString().split("T")[0];
    const calories = caloriesByDate.get(iso)?.calories ?? 0;
    const weightForDay = metricByDate.get(iso)?.weight ?? null;
    return {
      date: iso,
      calories,
      weight: weightForDay
    };
  });

  const monthGroups = new Map<string, { expenses: number; savings: number }>();
  transactions.forEach((tx) => {
    const monthKey = `${tx.occurredAt.getUTCFullYear()}-${String(tx.occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = monthGroups.get(monthKey) ?? { expenses: 0, savings: 0 };
    if (tx.type === "EXPENSE") bucket.expenses += tx.amount;
    if (tx.type === "SAVINGS") bucket.savings += tx.amount;
    monthGroups.set(monthKey, bucket);
  });

  const financeChart = Array.from(monthGroups.entries())
    .map(([month, totals]) => ({ month, ...totals }))
    .sort((a, b) => (a.month > b.month ? 1 : -1))
    .slice(-6);

  const activityMap = new Map<string, { workouts: number; wellbeing: number }>();
  sessions.forEach((session) => {
    const key = session.date.toISOString().split("T")[0];
    const bucket = activityMap.get(key) ?? { workouts: 0, wellbeing: 0 };
    bucket.workouts += 1;
    const avgRpe = session.sets.reduce((acc, set) => acc + (set.rpe ?? 0), 0) / (session.sets.length || 1);
    bucket.wellbeing += avgRpe;
    activityMap.set(key, bucket);
  });

  const activityChart = Array.from({ length: 14 }).map((_, index) => {
    const date = addDays(fourteenDaysAgo, index);
    const iso = date.toISOString().split("T")[0];
    const bucket = activityMap.get(iso);
    return {
      date: iso,
      workouts: bucket?.workouts ?? 0,
      wellbeing: bucket ? Number((bucket.wellbeing / bucket.workouts).toFixed(1)) : 0
    };
  });

  const totalExpenses = transactions.filter((tx) => tx.type === "EXPENSE").reduce((acc, tx) => acc + tx.amount, 0);
  const totalSavings = transactions.filter((tx) => tx.type === "SAVINGS").reduce((acc, tx) => acc + tx.amount, 0);

  const projectProgress = projects.length
    ? projects.reduce((acc, project) => {
        const total = project.tasks.length;
        const completed = project.tasks.filter((task) => task.status === "DONE").length;
        const progress = total === 0 ? 0 : completed / total;
        return acc + progress;
      }, 0) /
      projects.length *
      100
    : 0;

  const contactsToReach = contacts.filter((contact) => {
    if (!contact.frequencyDays) return false;
    const last = contact.lastContact ?? new Date(0);
    const next = new Date(last);
    next.setDate(last.getDate() + contact.frequencyDays);
    return next < today;
  }).length;

  const highlights = buildHighlights({
    weight,
    caloriesAverage,
    totalExpenses,
    totalSavings,
    projectProgress,
    contactsToReach
  });

  return res.json({
    metrics: {
      weight,
      caloriesAverage,
      spending: totalExpenses,
      savings: totalSavings,
      projectProgress,
      contactsToReach
    },
    charts: {
      caloriesVsWeight,
      finance: financeChart,
      activity: activityChart
    },
    highlights
  });
});

const buildHighlights = (data: {
  weight: number | null;
  caloriesAverage: number;
  totalExpenses: number;
  totalSavings: number;
  projectProgress: number;
  contactsToReach: number;
}) => {
  const items = [] as Array<{ id: string; title: string; description: string; link: string }>;

  if (data.weight && data.caloriesAverage) {
    items.push({
      id: "nutrition-focus",
      title: "Optimisez votre nutrition",
      description: `Votre poids actuel est de ${data.weight.toFixed(1)} kg pour ${Math.round(data.caloriesAverage)} kcal/j. Ajustez votre plan pour rester aligné avec vos objectifs.`,
      link: "/nutrition"
    });
  }

  if (data.totalExpenses > data.totalSavings) {
    items.push({
      id: "finance-review",
      title: "Surveillez vos dépenses",
      description: "Vos dépenses récentes dépassent votre épargne. Analysez vos catégories pour identifier des leviers de réduction.",
      link: "/finance"
    });
  }

  if (data.projectProgress < 60) {
    items.push({
      id: "project-push",
      title: "Boostez l'avancement de vos projets",
      description: `Progression moyenne actuelle ${Math.round(data.projectProgress)} %. Structurez vos tâches en priorisant les plus impactantes.`,
      link: "/projects"
    });
  }

  if (data.contactsToReach > 0) {
    items.push({
      id: "social-checkin",
      title: "Entretenez votre réseau",
      description: `${data.contactsToReach} contacts attendent un signe cette semaine. Programmez vos relances.`,
      link: "/social"
    });
  }

  if (!items.length) {
    items.push({
      id: "all-good",
      title: "Continuez sur cette lancée !",
      description: "Tous vos indicateurs sont dans le vert. Passez en revue votre dashboard pour planifier la semaine prochaine.",
      link: "/dashboard"
    });
  }

  return items;
};

export { dashboardRouter };
