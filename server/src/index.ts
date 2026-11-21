import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { getDataset } from "./data/dataRepository.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { api } from "./routes/api.js";

// Production serves the built client from the same process. Dev uses the Vite proxy instead.
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const serveClient = process.env.NODE_ENV === "production";

const app = express();
// Caddy (same machine) sets X-Forwarded-For, so req.ip is the real client for the rate limit.
app.set("trust proxy", "loopback");
// Production is same-origin. Without CORS, other websites can't call the API from a visitor's browser.
if (!serveClient) app.use(cors());
app.use(express.json({ limit: "100kb" }));
// Live Aivana costs quota per call; on a public URL, cap it per IP. Mock mode is free, so no limit.
if (!env.aivanaMock && env.aiRateLimit > 0) {
  app.use(["/api/parse", "/api/whatif", "/api/recommend", "/api/memo"], rateLimit({ limit: env.aiRateLimit, windowMs: 10 * 60_000 }));
}
app.use("/api", api);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown API route." } });
});
if (serveClient) {
  if (!existsSync(resolve(CLIENT_DIST, "index.html"))) {
    console.error(`NODE_ENV=production but ${CLIENT_DIST} has no build. Run \`npm run build\` first.`);
    process.exit(1);
  }
  app.use(express.static(CLIENT_DIST));
  // SPA fallback: any non-/api GET returns the app shell.
  app.get("*", (_req, res) => res.sendFile(resolve(CLIENT_DIST, "index.html")));
}
app.use(errorHandler);

const ds = getDataset(); // fail fast if data files are missing/invalid
app.listen(env.port, () => {
  console.log(`${serveClient ? "App" : "API"} listening on http://localhost:${env.port}`);
  console.log(`Dataset: ${ds.venues.length} venues, ${ds.hotels.length} hotels | Aivana mode: ${env.aivanaMock ? "MOCK" : `LIVE (limit ${env.aiRateLimit || "off"} AI requests/IP/10 min)`}`);
});
