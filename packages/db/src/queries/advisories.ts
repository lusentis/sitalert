import { advisories, type Advisory } from "../schema";
import type { HttpClient, PoolClient } from "../client";

type DbClient = HttpClient | PoolClient;

export async function upsertAdvisory(
  db: DbClient,
  data: {
    countryCode: string;
    level: number;
    title: string;
    summary: string;
    sourceUrl: string;
    sourceName: string;
    updatedAt: Date;
  },
): Promise<void> {
  await db
    .insert(advisories)
    .values(data)
    .onConflictDoUpdate({
      target: advisories.countryCode,
      set: {
        level: data.level,
        title: data.title,
        summary: data.summary,
        sourceUrl: data.sourceUrl,
        sourceName: data.sourceName,
        updatedAt: data.updatedAt,
      },
    });
}

export async function queryAllAdvisories(
  db: DbClient,
): Promise<Advisory[]> {
  return db.select().from(advisories);
}
