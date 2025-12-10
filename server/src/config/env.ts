import "dotenv/config";

const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "PORT", "UPLOAD_DIR"] as const;

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  uploadDir: process.env.UPLOAD_DIR!,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000"
};
