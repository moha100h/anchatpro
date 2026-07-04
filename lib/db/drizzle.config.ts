import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

// Auto-load .env from project root (2 levels up: lib/db → lib → root)
// This makes `pnpm --filter @workspace/db run push` work on servers without pre-exported env
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
}

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"],
  },
});
