import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { getDataset } from "./data/dataRepository.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { api } from "./routes/api.js";

// Production serves the built client from the same process. Dev uses the Vite proxy instead.
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const serveClient = process.env.NODE_ENV === "production";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));
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
  console.log(`Dataset: ${ds.venues.length} venues, ${ds.hotels.length} hotels | Aivana mode: ${env.aivanaMock ? "MOCK" : "LIVE"}`);
});
