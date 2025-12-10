import { Router } from "express";
import { ProjectStatus, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";

const projectsRouter = Router();

projectsRouter.use(requireAuth);

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional()
});

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  dueDate: z.coerce.date().optional()
});

projectsRouter.get("/projects", async (req, res) => {
  const userId = req.userId!;
  const projects = await prisma.project.findMany({
    where: { userId },
    include: {
      tasks: {
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(projects);
});

projectsRouter.post("/projects", async (req, res) => {
  const userId = req.userId!;
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const project = await prisma.project.create({
    data: {
      userId,
      ...parsed.data
    }
  });

  return res.status(201).json(project);
});

projectsRouter.put("/projects/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: parsed.data
  });

  return res.json(updated);
});

projectsRouter.post("/projects/:id/tasks", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const task = await prisma.task.create({
    data: {
      projectId: id,
      ...parsed.data
    }
  });

  return res.status(201).json(task);
});

projectsRouter.patch("/tasks/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const task = await prisma.task.findFirst({
    where: {
      id,
      project: {
        userId
      }
    }
  });
  if (!task) {
    return res.status(404).json({ message: "Task not found" });
  }

  const parsed = taskSchema.partial().extend({ completedAt: z.coerce.date().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const updated = await prisma.task.update({
    where: { id },
    data: parsed.data
  });

  return res.json(updated);
});

projectsRouter.get("/summary", async (req, res) => {
  const userId = req.userId!;
  const projects = await prisma.project.findMany({
    where: { userId },
    include: {
      tasks: true
    }
  });

  const summary = projects.map((project) => {
    const total = project.tasks.length;
    const completed = project.tasks.filter((task) => task.status === "DONE").length;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      progress
    };
  });

  return res.json(summary);
});

projectsRouter.delete("/projects/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  await prisma.project.delete({ where: { id } });
  return res.status(204).send();
});

projectsRouter.delete("/tasks/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const task = await prisma.task.findFirst({
    where: {
      id,
      project: {
        userId
      }
    }
  });
  if (!task) {
    return res.status(404).json({ message: "Task not found" });
  }

  await prisma.task.delete({ where: { id } });
  return res.status(204).send();
});

export { projectsRouter };
