import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://build:build@127.0.0.1:5432/m1cro_build_only";

const client = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
