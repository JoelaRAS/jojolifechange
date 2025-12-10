import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";
import { upload } from "../../middleware/upload";

const metricsRouter = Router();

metricsRouter.use(requireAuth);

const metricEntrySchema = z.object({
  date: z.coerce.date().optional(),
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
  waist: z.number().positive().optional(),
  hips: z.number().positive().optional(),
  chest: z.number().positive().optional(),
  leftArm: z.number().positive().optional(),
  rightArm: z.number().positive().optional(),
  leftThigh: z.number().positive().optional(),
  rightThigh: z.number().positive().optional(),
  notes: z.string().optional()
});

const entriesQuerySchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional()
});

const photoSchema = z.object({
  side: z.string().optional(),
  date: z.coerce.date().optional()
});

metricsRouter.post("/entries", async (req, res) => {
  const userId = req.userId!;
  const parsed = metricEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const entry = await prisma.metricEntry.create({
    data: {
      userId,
      ...parsed.data
    }
  });

  return res.status(201).json(entry);
});

metricsRouter.get("/entries", async (req, res) => {
  const userId = req.userId!;
  const parsed = entriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { start, end } = parsed.data;
  const entries = await prisma.metricEntry.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end
      }
    },
    orderBy: { date: "asc" }
  });

  return res.json(entries);
});

metricsRouter.get("/summary", async (req, res) => {
  const userId = req.userId!;
  const latest = await prisma.metricEntry.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 2
  });

  const [current, previous] = latest;
  const bmi = current?.weight && current?.height ? Number((current.weight / Math.pow(current.height / 100, 2)).toFixed(2)) : null;
  const deltaWeight = current?.weight && previous?.weight ? current.weight - previous.weight : null;

  const photos = await prisma.progressPhoto.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 6
  });

  return res.json({
    current,
    previous,
    bmi,
    deltaWeight,
    photos
  });
});

metricsRouter.post("/photos", upload.single("photo"), async (req, res) => {
  const userId = req.userId!;
  const parsed = photoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (!req.file) {
    return res.status(400).json({ message: "Photo is required" });
  }

  const photo = await prisma.progressPhoto.create({
    data: {
      userId,
      url: `/uploads/${req.file.filename}`,
      side: parsed.data.side,
      date: parsed.data.date ?? new Date()
    }
  });

  return res.status(201).json(photo);
});

metricsRouter.get("/photos", async (req, res) => {
  const userId = req.userId!;
  const photos = await prisma.progressPhoto.findMany({
    where: { userId },
    orderBy: { date: "desc" }
  });
  return res.json(photos);
});

metricsRouter.get("/compare", async (req, res) => {
  const userId = req.userId!;
  const schema = z.object({
    from: z.coerce.date(),
    to: z.coerce.date()
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { from, to } = parsed.data;
  const [fromEntry, toEntry] = await Promise.all([
    prisma.metricEntry.findFirst({ where: { userId, date: { lte: from } }, orderBy: { date: "desc" } }),
    prisma.metricEntry.findFirst({ where: { userId, date: { lte: to } }, orderBy: { date: "desc" } })
  ]);

  return res.json({ from: fromEntry, to: toEntry });
});

metricsRouter.patch("/entries/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = metricEntrySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const entry = await prisma.metricEntry.findFirst({ where: { id, userId } });
  if (!entry) {
    return res.status(404).json({ message: "Entry not found" });
  }

  const updated = await prisma.metricEntry.update({
    where: { id },
    data: parsed.data
  });

  return res.json(updated);
});

metricsRouter.delete("/entries/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const entry = await prisma.metricEntry.findFirst({ where: { id, userId } });
  if (!entry) {
    return res.status(404).json({ message: "Entry not found" });
  }

  await prisma.metricEntry.delete({ where: { id } });
  return res.status(204).send();
});

metricsRouter.delete("/photos/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const photo = await prisma.progressPhoto.findFirst({ where: { id, userId } });
  if (!photo) {
    return res.status(404).json({ message: "Photo not found" });
  }

  await prisma.progressPhoto.delete({ where: { id } });
  return res.status(204).send();
});

export { metricsRouter };
