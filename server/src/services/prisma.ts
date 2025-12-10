import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: env.databaseUrl
      }
    }
  });

if (env.nodeEnv !== "production") {
  global.prisma = prisma;
}
