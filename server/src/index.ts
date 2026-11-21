import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { getDataset } from "./data/dataRepository.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { api } from "./routes/api.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use("/api", api);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown API route." } });
});
app.use(errorHandler);

const ds = getDataset(); // fail fast if data files are missing/invalid
app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
  console.log(`Dataset: ${ds.venues.length} venues, ${ds.hotels.length} hotels | Aivana mode: ${env.aivanaMock ? "MOCK" : "LIVE"}`);
});
