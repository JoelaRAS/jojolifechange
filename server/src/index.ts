import { env } from "./config/env";
import { app } from "./app";
import { prisma } from "./services/prisma";

const start = async () => {
  try {
    await prisma.$connect();
    app.listen(env.port, () => {
      console.log(`LifeOS backend running on port ${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

void start();
