import express from "express";
import compression from "compression";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const API_TARGET = process.env.API_TARGET ?? "http://backend:4000";

const app = express();

app.use(
  "/api",
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    proxyTimeout: 10000,
    logLevel: process.env.NODE_ENV === "production" ? "warn" : "debug"
  })
);

app.use(
  "/uploads",
  createProxyMiddleware({
    target: API_TARGET.replace(/\/api$/, ""),
    changeOrigin: true,
    logLevel: process.env.NODE_ENV === "production" ? "warn" : "debug"
  })
);

app.use(compression());

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath, { index: false }));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[LifeOS] frontend server listening on port ${PORT}, proxying API to ${API_TARGET}`);
});
