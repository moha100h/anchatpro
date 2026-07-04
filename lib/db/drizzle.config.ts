import { defineConfig } from "drizzle-kit";
import path from "path";
import dotenv from "dotenv";

// Explicitly load the repo-root .env. `drizzle-kit push` is normally invoked
// via `pnpm --filter @workspace/db run push`, which runs with CWD set to
// this package's directory (lib/db), NOT the repo root — so a bare
// `dotenv.config()` (or any implicit auto-loading) would silently miss the
// root .env file and DATABASE_URL would appear unset even though it exists.
dotenv.config({ path: path.join(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
