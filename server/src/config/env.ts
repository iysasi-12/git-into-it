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
  AIVANA_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  PORT: z.coerce.number().int().positive().default(3001),
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
  port: raw.PORT,
};
