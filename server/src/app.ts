import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/router";
import { nutritionRouter } from "./modules/nutrition/router";
import { ingredientsRouter } from "./modules/nutrition/ingredients";
import { sportRouter } from "./modules/sport/router";
import { exercisesRouter } from "./modules/sport/exercises";
import { metricsRouter } from "./modules/metrics/router";
import { financeRouter } from "./modules/finance/router";
import { socialRouter } from "./modules/social/router";
import { projectsRouter } from "./modules/projects/router";
import { dashboardRouter } from "./modules/dashboard/router";
import { plannerRouter } from "./modules/planner/router";

const app = express();

const uploadsPath = path.resolve(env.uploadDir);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use(
  cors({
    origin: "*"
  })
);
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadsPath));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const mount = (basePath: string, router: express.Router) => {
  app.use(`/api${basePath}`, router);
  app.use(basePath, router);
};

mount("/auth", authRouter);
mount("/nutrition", nutritionRouter);
mount("/nutrition/ingredients", ingredientsRouter);
mount("/sport", sportRouter);
mount("/sport/exercises", exercisesRouter);
mount("/metrics", metricsRouter);
mount("/finance", financeRouter);
mount("/social", socialRouter);
mount("/projects", projectsRouter);
mount("/dashboard", dashboardRouter);
mount("/planner", plannerRouter);

// Not found handler
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

export { app };
