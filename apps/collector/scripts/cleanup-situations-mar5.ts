/**
 * One-time cleanup: merge Iran conflict spillovers + resolve generic single-event situations.
 *
 * Usage: cd apps/collector && tsx scripts/cleanup-situations-mar5.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

const IRAN_CONFLICT_ID = "5c96f16f-e5ce-4508-8ede-73aed80acf05";

// Situations whose events should be merged into the Iran conflict
const MERGE_INTO_IRAN = [
  "ff667a43-ed15-4449-a0e7-664eae29a657", // Turkmenistan Conflict
  "bbeec602-43f0-44fb-92a4-1790c0ac278c", // Iran Infrastructure
  "e63c234c-2b48-49b8-a754-ecc9452fbfb4", // Iran Transport
  "a9b8e189-a93c-4446-bec5-af1c4d0308d2", // Azerbaijan Infrastructure
  "13007d7c-a780-4c9b-96c1-d201213968b5", // Oman Transport
  "7ec96d57-5bba-4046-b3fe-709b2f334745", // UAE Infrastructure
  "cac955bf-ea3a-4833-9a22-14faa010cabd", // Iraq Infrastructure
];

async function main() {
  // 1. Merge Iran spillovers
  console.log("=== Merging Iran conflict spillovers ===");
  for (const sid of MERGE_INTO_IRAN) {
    const events = await sql`
      UPDATE events SET situation_id = ${IRAN_CONFLICT_ID}, updated_at = NOW()
      WHERE situation_id = ${sid}
      RETURNING id, title
    `;
    console.log(`  Moved ${events.length} events from ${sid.slice(0, 8)}`);
    for (const e of events) {
      console.log(`    - ${e.title}`);
    }

    // Resolve the now-empty situation
    await sql`
      UPDATE situations SET status = 'resolved', updated_at = NOW()
      WHERE id = ${sid}
    `;
    console.log(`  Resolved situation ${sid.slice(0, 8)}`);
  }

  // Update Iran conflict event count and country codes
  const [countRow] = await sql`
    SELECT COUNT(*)::int as count FROM events WHERE situation_id = ${IRAN_CONFLICT_ID}
  `;
  await sql`
    UPDATE situations SET
      event_count = ${countRow.count},
      country_codes = (
        SELECT array_agg(DISTINCT code) FROM (
          SELECT unnest(country_codes) as code FROM events WHERE situation_id = ${IRAN_CONFLICT_ID}
        ) sub WHERE code IS NOT NULL
      ),
      updated_at = NOW()
    WHERE id = ${IRAN_CONFLICT_ID}
  `;
  console.log(`  Iran conflict now has ${countRow.count} events`);

  // 2. Resolve generic single-event sev 1-2 situations
  console.log("\n=== Resolving generic single-event situations (sev 1-2) ===");
  const genericSituations = await sql`
    SELECT s.id, s.title, s.severity, s.category, COUNT(e.id)::int as ec
    FROM situations s
    LEFT JOIN events e ON e.situation_id = s.id
    WHERE s.status = 'active'
      AND s.severity <= 2
      AND s.external_id IS NULL
    GROUP BY s.id
    HAVING COUNT(e.id) <= 1
    ORDER BY s.title
  `;

  for (const s of genericSituations) {
    // Detach events (make standalone)
    await sql`
      UPDATE events SET situation_id = NULL, updated_at = NOW()
      WHERE situation_id = ${s.id}
    `;
    // Resolve the situation
    await sql`
      UPDATE situations SET status = 'resolved', updated_at = NOW()
      WHERE id = ${s.id}
    `;
    console.log(`  Resolved: sev${s.severity} | ${s.ec}ev | ${s.title}`);
  }

  // Final count
  const [remaining] = await sql`
    SELECT COUNT(*)::int as count FROM situations WHERE status = 'active'
  `;
  console.log(`\nDone. ${remaining.count} active situations remain.`);
}

main().catch(console.error);
