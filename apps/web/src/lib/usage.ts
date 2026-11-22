import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { usageRecords } from "@/db/schema";
import { buildInferenceUsageRows, type InferenceUsageInput } from "@/lib/usage-contract";

export async function recordInferenceUsage(input: InferenceUsageInput): Promise<void> {
  const rows = buildInferenceUsageRows(input);
  await db.insert(usageRecords).values(rows).onConflictDoNothing();
}

export interface MonthlyUsageSummary {
  periodStart: string;
  periodEnd: string;
  metrics: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
  };
}

export async function getMonthlyUsageSummary(ownerId: string, now = new Date()): Promise<MonthlyUsageSummary> {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const rows = await db
    .select({
      metric: usageRecords.metric,
      quantity: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int`,
    })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.ownerId, ownerId),
      gte(usageRecords.createdAt, periodStart),
      lt(usageRecords.createdAt, periodEnd),
    ))
    .groupBy(usageRecords.metric);

  const totals = new Map(rows.map(row => [row.metric, Number(row.quantity)]));
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    metrics: {
      requests: totals.get("inference.requests") ?? 0,
      inputTokens: totals.get("inference.input_tokens") ?? 0,
      outputTokens: totals.get("inference.output_tokens") ?? 0,
    },
  };
}
