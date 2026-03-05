/**
 * One-time cleanup: merge spillover situations into parent conflicts,
 * resolve empty situations, and rename generic ones.
 *
 * Usage: cd apps/collector && pnpm tsx scripts/cleanup-generic-situations.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

// Iran conflict parent situations
const IRAN_CONFLICT_PREFIX = "5c96f16f"; // USA-Israel military campaign against Iran
const IRAN_GULF_PREFIX = "070a9878"; // Iran conflict: Gulf state attacks

// Situations that are clearly Iran conflict spillover (by short ID prefix)
const IRAN_SPILLOVER_PREFIXES = [
  "a9b8e189", // Azerbaijan Infrastructure — drone crashes at Nakhchivan airport
  "bbeec602", // Iran Infrastructure — TV HQ hit, social network warnings
  "e63c234c", // Iran Transport — tanker hit in Gulf
  "cac955bf", // Iraq Infrastructure — blackout amid cyberattacks
  "71417d1c", // Malaysia Transport — flight disruptions from Gulf closures
  "13007d7c", // Oman Transport — Strait of Hormuz shipping, tanker attacks
  "ff667a43", // Turkmenistan Conflict — regional instability spillover
];

// Situations to merge into the Gulf spillover situation
const GULF_SPILLOVER_PREFIXES = [
  "b24de042", // Qatar Transport — border crossing info (travel advisory)
];

async function main() {
  // Get full IDs
  const [iranConflict] = await sql`SELECT id FROM situations WHERE id::text LIKE ${IRAN_CONFLICT_PREFIX + "%"}`;
  const [iranGulf] = await sql`SELECT id FROM situations WHERE id::text LIKE ${IRAN_GULF_PREFIX + "%"}`;

  if (!iranConflict || !iranGulf) {
    console.error("Could not find Iran conflict situations");
    return;
  }

  // Merge Iran spillover situations
  console.log("\nMerging Iran conflict spillovers:");
  for (const prefix of IRAN_SPILLOVER_PREFIXES) {
    const [sit] = await sql`SELECT id, title FROM situations WHERE id::text LIKE ${prefix + "%"} AND status = 'active'`;
    if (!sit) continue;
    await sql`UPDATE events SET situation_id = ${iranConflict.id} WHERE situation_id = ${sit.id}`;
    await sql`UPDATE situations SET status = 'resolved' WHERE id = ${sit.id}`;
    console.log(`  ${prefix} | ${sit.title} -> merged into Iran conflict`);
  }

  // Merge Gulf spillover situations
  console.log("\nMerging Gulf spillovers:");
  for (const prefix of GULF_SPILLOVER_PREFIXES) {
    const [sit] = await sql`SELECT id, title FROM situations WHERE id::text LIKE ${prefix + "%"} AND status = 'active'`;
    if (!sit) continue;
    await sql`UPDATE events SET situation_id = ${iranGulf.id} WHERE situation_id = ${sit.id}`;
    await sql`UPDATE situations SET status = 'resolved' WHERE id = ${sit.id}`;
    console.log(`  ${prefix} | ${sit.title} -> merged into Gulf spillover`);
  }

  // Summary
  const remaining = await sql`
    SELECT COUNT(*)::int as count FROM situations WHERE status = 'active'
  `;
  console.log(`\nDone. ${remaining[0].count} active situations remaining.`);
}

main().catch(console.error);
