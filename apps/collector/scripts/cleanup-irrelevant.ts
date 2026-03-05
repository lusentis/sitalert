/**
 * One-time cleanup: delete events that are not travel-relevant.
 * These are isolated local incidents with no area-wide impact.
 *
 * Usage: cd apps/collector && pnpm tsx scripts/cleanup-irrelevant.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

// Events to delete — isolated local incidents irrelevant to travelers
const DELETE_IDS = [
  // Local crime — single incidents, no area-wide impact
  "eef94a75-e177-4f26-a67b-9812b863a63e", // Milano stabbing: four minors detained for attempted murder
  "5eacfe91-cc4d-4173-a9ea-8c74ede1823a", // TelePordenone owner murdered; suspect in police custody

  // Domestic accident — no travel implication
  "7dc4a941-271b-41b8-b1ec-c66cfffc31ff", // Gas cylinder explodes in house in Oristanese region; two dead
  "067c01ea-ddc6-48d4-a1f3-9e72eecb430d", // Potenza football field damaged by minister Nordio's helicopter

  // Court ruling — no immediate safety impact
  "f7670614-66bf-4d67-ba25-6ef89691aa1a", // Greece: Conviction of Golden Dawn members confirmed

  // Ceremony/memorial — no disruption
  "edcad11b-0906-4825-88e4-079d472498d5", // Iran: Tasnim reports vigils and commemorations
];

async function main() {
  console.log(`Deleting ${DELETE_IDS.length} irrelevant events...\n`);

  // First show what we're deleting
  const events = await sql`
    SELECT id, title, category, situation_id FROM events WHERE id = ANY(${DELETE_IDS}::uuid[])
  `;
  for (const e of events) {
    console.log(`  DELETE: [${e.category}] ${e.title}`);
  }

  // Delete the events
  await sql`DELETE FROM events WHERE id = ANY(${DELETE_IDS}::uuid[])`;
  console.log(`\nDeleted ${events.length} events.`);

  // Recount affected situations and resolve empty ones
  const affectedSitIds = [...new Set(events.map(e => e.situation_id).filter(Boolean))];
  for (const sitId of affectedSitIds) {
    const [count] = await sql`SELECT count(*)::int as c FROM events WHERE situation_id = ${sitId}`;
    if (count.c === 0) {
      await sql`UPDATE situations SET status = 'resolved', updated_at = NOW() WHERE id = ${sitId}`;
      console.log(`Resolved empty situation ${sitId}`);
    } else {
      await sql`UPDATE situations SET event_count = ${count.c}, updated_at = NOW() WHERE id = ${sitId}`;
      console.log(`Recounted situation ${sitId}: ${count.c} events remaining`);
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
