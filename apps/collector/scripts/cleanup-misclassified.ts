import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, eq, and } from "drizzle-orm";
import { events, situations } from "@travelrisk/db/schema";
import "dotenv/config";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

interface Change {
  type: "reclassify" | "delete" | "orphan" | "resolve";
  table: string;
  title: string;
  details: string;
}

async function orphanAndResolve(titleMatch: string, changes: Change[]) {
  // Orphan events linked to the situation
  const sits = await db
    .select({ id: situations.id, title: situations.title })
    .from(situations)
    .where(
      and(
        sql`${situations.title} ILIKE ${"%" + titleMatch + "%"}`,
        eq(situations.status, "active"),
      ),
    );

  for (const sit of sits) {
    await db
      .update(events)
      .set({ situationId: null, updatedAt: new Date() })
      .where(eq(events.situationId, sit.id));

    await db
      .update(situations)
      .set({ status: "resolved" as const, updatedAt: new Date() })
      .where(eq(situations.id, sit.id));

    changes.push({
      type: "orphan",
      table: "situations",
      title: sit.title,
      details: "orphaned events + resolved situation",
    });
  }
}

async function main() {
  const changes: Change[] = [];

  // --- Round 1: Reclassify events ---
  const reclassifications = [
    { titleMatch: "Bihar could appoint BJP Chief Minister", category: "civil_unrest", severity: 1 },
    { titleMatch: "Bihar may form BJP-led government", category: "civil_unrest", severity: 1 },
    { titleMatch: "Delhi Ring Metro inaugurated", category: "transport", severity: 1 },
    { titleMatch: "Japan: Flexible renewal policy", category: "transport", severity: 1 },
    { titleMatch: "Japan introduces flexible visa renewal", category: "transport", severity: 1 },
    // Round 2
    { titleMatch: "US-Venezuela diplomatic ties restored after Maduro arrest", category: "civil_unrest", severity: 2 },
    { titleMatch: "Cartel violence raises security concerns ahead of World Cup", category: "civil_unrest", severity: 1 },
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

  // --- Round 1: Delete irrelevant events ---
  const deletions = [
    "London forex market",
    "Yen slides",
    "Indonesia to ban social media for minors",
    "Isegahama stablemaster",
    "sumo tournament",
    // Round 2: events that should never have passed classifier
    "Berlin International Film Festival",
    "Dingo attack on K'Gari",
    "Seoul drink-spiking murder",
    "Seven countries skip Milan-Cortina Paralympics",
    "Death of Russian opposition leader Navalny",
    "Delhi records season's hottest day",
    "Extreme UV radiation risk in Bengaluru",
    "Belgian authorities seize suspected shadow fleet tanker",
  ];

  for (const titleMatch of deletions) {
    // First orphan from any situation
    const matchedEvents = await db
      .select({ id: events.id, situationId: events.situationId })
      .from(events)
      .where(sql`${events.title} ILIKE ${"%" + titleMatch + "%"}`);

    // Delete the events
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

    // Resolve any situations that now have 0 events
    for (const evt of matchedEvents) {
      if (evt.situationId) {
        const [remaining] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(events)
          .where(eq(events.situationId, evt.situationId));

        if ((remaining?.count ?? 0) === 0) {
          await db
            .update(situations)
            .set({ status: "resolved" as const, updatedAt: new Date() })
            .where(eq(situations.id, evt.situationId));

          changes.push({
            type: "resolve",
            table: "situations",
            title: `situation ${evt.situationId}`,
            details: "resolved (no remaining events after cleanup)",
          });
        }
      }
    }
  }

  // --- Round 1: Reclassify situations ---
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

  // --- Round 1: Resolve generic "Country Category" pattern situations ---
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

  // --- Round 2: Dissolve generic-titled situations (orphan events, resolve situation) ---
  const genericSituations = [
    "Cambodia Health Epidemic",
    "Cuba Health Epidemics",
    "Ethiopia Health Epidemic",
    "Israel Health Epidemic",
    "Cuba Infrastructure",
    "United States Volcanoes",
    "Central East Pacific Rise Earthquakes",
  ];

  for (const title of genericSituations) {
    await orphanAndResolve(title, changes);
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
