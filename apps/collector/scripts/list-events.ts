/**
 * List events and situations from the database.
 *
 * Usage: cd apps/collector && pnpm tsx scripts/list-events.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

const mode = process.argv[2] || "all";

async function main() {
  if (mode === "domestic") {
    // Show only non-war, non-disaster events for relevance review
    const events = await sql`
      SELECT e.id, e.title, e.category, e.severity, e.location_name,
             s.title as situation_title
      FROM events e
      LEFT JOIN situations s ON e.situation_id = s.id
      WHERE e.category NOT IN ('natural_disaster', 'health_epidemic', 'weather_extreme')
      ORDER BY e.category, e.timestamp DESC
    `;
    console.log(`\n=== NON-DISASTER EVENTS (${events.length}) ===\n`);
    let cat = "";
    for (const e of events) {
      if (e.category !== cat) { cat = e.category; console.log(`\n--- ${cat.toUpperCase()} ---`); }
      console.log(`  ${e.id.slice(0,8)} | ${e.title}`);
    }
    return;
  }

  // Default: list all events with situation assignments
  const events = await sql`
    SELECT e.id, e.title, e.category, e.severity, e.location_name,
           array_to_string(e.country_codes, ', ') as countries,
           e.situation_id, s.title as situation_title,
           e.timestamp::date
    FROM events e
    LEFT JOIN situations s ON e.situation_id = s.id
    ORDER BY e.category, e.country_codes, e.timestamp DESC
  `;
  console.log("\n=== EVENTS ===");
  console.log(`Total: ${events.length}\n`);

  let currentCategory = "";
  for (const e of events) {
    if (e.category !== currentCategory) {
      currentCategory = e.category;
      console.log(`\n--- ${currentCategory.toUpperCase()} ---`);
    }
    const sit = e.situation_title ? ` -> [${e.situation_title}]` : " -> [UNASSIGNED]";
    console.log(`  ${e.timestamp} | ${e.countries || "?"} | ${e.title}${sit}`);
  }

  const unassigned = events.filter(e => !e.situation_id);
  console.log(`\n\n=== UNASSIGNED EVENTS: ${unassigned.length} / ${events.length} ===`);
}

main().catch(console.error);
