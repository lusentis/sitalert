import { sql, gte, and, or, isNull } from "drizzle-orm";
import { events } from "../schema";
import type { HttpClient, PoolClient } from "../client";

type DbClient = HttpClient | PoolClient;

export interface EventStats {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<number, number>;
  lastEventAt: string | null;
}

export async function getStats24h(db: DbClient): Promise<EventStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const activeCondition = and(
    // Use createdAt so newly ingested historical events (e.g. WHO outbreaks) are counted
    gte(events.createdAt, since),
    or(isNull(events.expiresAt), gte(events.expiresAt, new Date())),
  );

  const [categoryRows, severityRows, totalRow] = await Promise.all([
    db
      .select({
        category: events.category,
        count: sql<number>`count(*)::int`,
      })
      .from(events)
      .where(activeCondition)
      .groupBy(events.category),

    db
      .select({
        severity: events.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(events)
      .where(activeCondition)
      .groupBy(events.severity),

    db
      .select({
        total: sql<number>`count(*)::int`,
        lastEventAt: sql<string | null>`max(${events.timestamp})::text`,
      })
      .from(events)
      .where(activeCondition),
  ]);

  const byCategory: Record<string, number> = {};
  for (const row of categoryRows) {
    byCategory[row.category] = row.count;
  }

  const bySeverity: Record<number, number> = {};
  for (const row of severityRows) {
    bySeverity[row.severity] = row.count;
  }

  return {
    total: totalRow[0]?.total ?? 0,
    byCategory,
    bySeverity,
    lastEventAt: totalRow[0]?.lastEventAt ?? null,
  };
}
