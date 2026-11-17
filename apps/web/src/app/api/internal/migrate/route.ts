import { timingSafeEqual } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== "preview") return false;
  if (process.env.VERCEL_GIT_COMMIT_REF !== "ops/neon-migration-runner") return false;
  const expected = process.env.M1CRO_MIGRATION_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function inspectDatabase() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 15 });
  try {
    const identity = await client`select current_database() as database, current_schema() as schema`;
    const tables = await client`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
    const migrationTable = await client`select to_regclass('public.__drizzle_migrations') as name`;
    let appliedMigrations: number | null = null;
    if (migrationTable[0]?.name) {
      const rows = await client`select count(*)::int as count from public.__drizzle_migrations`;
      appliedMigrations = rows[0].count;
    }
    return { identity: identity[0], tables: tables.map((row) => row.table_name), migrationTable: Boolean(migrationTable[0]?.name), appliedMigrations };
  } finally {
    await client.end();
  }
}

async function executeAction(action: unknown) {
  if (action === "inspect") {
    try {
      return NextResponse.json(await inspectDatabase());
    } catch {
      return NextResponse.json({ error: "Database inspection failed" }, { status: 500 });
    }
  }
  if (action === "migrate") {
    try {
      await migrate(db, { migrationsFolder: "drizzle" });
      return NextResponse.json({ ok: true, database: await inspectDatabase() });
    } catch {
      return NextResponse.json({ error: "Migration failed; inspect deployment logs before retrying" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return executeAction(request.nextUrl.searchParams.get("action"));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  return executeAction(body.action);
}
