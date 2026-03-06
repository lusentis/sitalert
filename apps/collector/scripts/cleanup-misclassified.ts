import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, eq, and } from "drizzle-orm";
import { events, situations } from "@travelrisk/db/schema";
import "dotenv/config";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

interface Change {
  type: "reclassify" | "delete" | "resolve";
  table: string;
  title: string;
  details: string;
}

async function main() {
  const changes: Change[] = [];

  // --- Reclassify events ---
  const reclassifications = [
    { titleMatch: "Bihar could appoint BJP Chief Minister", category: "civil_unrest", severity: 1 },
    { titleMatch: "Bihar may form BJP-led government", category: "civil_unrest", severity: 1 },
    { titleMatch: "Delhi Ring Metro inaugurated", category: "transport", severity: 1 },
    { titleMatch: "Japan: Flexible renewal policy", category: "transport", severity: 1 },
    { titleMatch: "Japan introduces flexible visa renewal", category: "transport", severity: 1 },
  ];

  for (const { titleMatch, category, severity } of reclassifications) {
    const result = await db
      .update(events)
      .set({ category, severity, updatedAt: new Date() })
      .where(sql`${events.title} ILIKE ${"%" + titleMatch + "%"}`)
      .returning({ id: events.id, title: events.title });

    for (const row of result) {
      changes.push({
        type: "reclassify",
        table: "events",
        title: row.title,
        details: `→ ${category} sev ${severity}`,
      });
    }
  }

  // --- Delete irrelevant events ---
  const deletions = [
    "London forex market",
    "Yen slides",
    "Indonesia to ban social media for minors",
    "Isegahama stablemaster",
    "sumo tournament",
  ];

  for (const titleMatch of deletions) {
    const result = await db
      .delete(events)
      .where(sql`${events.title} ILIKE ${"%" + titleMatch + "%"}`)
      .returning({ id: events.id, title: events.title });

    for (const row of result) {
      changes.push({
        type: "delete",
        table: "events",
        title: row.title,
        details: "deleted (not travel-relevant)",
      });
    }
  }

  // --- Resolve stale situations ---
  const situationReclassifications = [
    { titleMatch: "Bihar", category: "civil_unrest", severity: 1 },
  ];

  for (const { titleMatch, category, severity } of situationReclassifications) {
    const result = await db
      .update(situations)
      .set({ category, severity, updatedAt: new Date() })
      .where(
        and(
          sql`${situations.title} ILIKE ${"%" + titleMatch + "%"}`,
          eq(situations.status, "active"),
        ),
      )
      .returning({ id: situations.id, title: situations.title });

    for (const row of result) {
      changes.push({
        type: "reclassify",
        table: "situations",
        title: row.title,
        details: `→ ${category} sev ${severity}`,
      });
    }
  }

  // Resolve "Country Category" pattern situations that are still active
  // e.g., "Sweden Infrastructure", "India Infrastructure"
  const genericPatterns = await db
    .update(situations)
    .set({ status: "resolved" as const, updatedAt: new Date() })
    .where(
      and(
        eq(situations.status, "active"),
        sql`${situations.title} ~ '^[A-Z][a-z]+ (Infrastructure|Transport)$'`,
      ),
    )
    .returning({ id: situations.id, title: situations.title });

  for (const row of genericPatterns) {
    changes.push({
      type: "resolve",
      table: "situations",
      title: row.title,
      details: "resolved (generic pattern)",
    });
  }

  // --- Report ---
  console.log(`\n=== Cleanup Summary: ${changes.length} changes ===\n`);
  for (const change of changes) {
    console.log(`[${change.type}] ${change.table}: "${change.title}" — ${change.details}`);
  }

  if (changes.length === 0) {
    console.log("No matching records found. Database may already be clean.");
  }
}

main().catch(console.error);
