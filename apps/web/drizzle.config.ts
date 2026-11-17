import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://build:build@127.0.0.1:5432/m1cro_build_only",
  },
  strict: true,
  verbose: true,
});
