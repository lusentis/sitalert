/**
 * List active situations from the database.
 *
 * Usage: cd apps/collector && pnpm tsx scripts/list-situations.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

async function main() {
  const sits = await sql`
    SELECT s.id, s.title, s.category, s.severity, s.country_codes, s.status,
           COUNT(e.id)::int as event_count
    FROM situations s
    LEFT JOIN events e ON e.situation_id = s.id
    WHERE s.status = 'active'
    GROUP BY s.id
    ORDER BY s.category, s.title
  `;
  for (const s of sits) {
    const cc = (s.country_codes ?? []).join(",");
    console.log(
      `${s.id.slice(0, 8)} | ${String(s.category).padEnd(14)} | sev ${s.severity} | ${cc.padEnd(8)} | ${s.event_count}ev | ${s.title}`,
    );
  }
  console.log(`\nTotal: ${sits.length} active situations`);
}

main().catch(console.error);
