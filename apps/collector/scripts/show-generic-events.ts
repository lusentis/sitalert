import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

async function main() {
  const generic = await sql`
    SELECT s.id as sit_id, s.title as sit_title, e.title as event_title, e.country_codes
    FROM situations s
    JOIN events e ON e.situation_id = s.id
    WHERE s.status = 'active'
    AND s.title ~ '^[A-Z][a-z]+ [A-Z][a-z ]+$'
    ORDER BY s.title, e.timestamp DESC
  `;
  let sit = "";
  for (const r of generic) {
    if (r.sit_title !== sit) {
      sit = r.sit_title as string;
      console.log(`\n${(r.sit_id as string).slice(0, 8)} | ${sit}`);
    }
    console.log(`  -> ${r.event_title}`);
  }
}

main().catch(console.error);
