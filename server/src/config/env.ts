import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from server/ or repo root (Node >= 20.12 built-in, no dotenv needed).
for (const p of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")]) {
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const EnvSchema = z.object({
  AIVANA_API_KEY: z.string().optional(),
  AIVANA_BASE_URL: z.string().url().default("https://api.aivana.ai/v1"),
  AIVANA_MOCK: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Live latency 2026-11-21: parse ~8 s, what-if 8-20 s. 20 s caused fallbacks; 30 s ran the demo clean.
  AIVANA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  // Recommend (34-43 s) and memo (26-32 s) live; recommend runs in the background, so it can wait longer.
  AIVANA_SLOW_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  PORT: z.coerce.number().int().positive().default(3001),
  // Live mode only: AI requests (parse, what-if, recommend, memo) per IP per 10 minutes. 0 = off.
  // One demo run is ~15 calls; judges on shared Wi-Fi share an IP, so keep it generous.
  AI_RATE_LIMIT: z.coerce.number().int().nonnegative().default(60),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
// No key => force mock mode so the app still runs end-to-end.
const mock = raw.AIVANA_MOCK || !raw.AIVANA_API_KEY;
if (!raw.AIVANA_MOCK && !raw.AIVANA_API_KEY) {
  console.warn("AIVANA_API_KEY not set — running Aivana in MOCK mode.");
}

export const env = {
  aivanaApiKey: raw.AIVANA_API_KEY ?? "",
  aivanaBaseUrl: raw.AIVANA_BASE_URL.replace(/\/$/, ""),
  aivanaMock: mock,
  aivanaTimeoutMs: raw.AIVANA_TIMEOUT_MS,
  aivanaSlowTimeoutMs: raw.AIVANA_SLOW_TIMEOUT_MS,
  port: raw.PORT,
  aiRateLimit: raw.AI_RATE_LIMIT,
};
