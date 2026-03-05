/**
 * One-time cleanup: delete non-events, recategorize travel guides, fix misgeocoded entries.
 *
 * Usage: cd apps/collector && pnpm tsx scripts/cleanup-non-events.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

// 1. Delete analysis/editorial/diplomatic/duplicate entries
const DELETE_IDS = [
  // Analysis / Editorial
  "b2a29c0f-0757-4ba5-83df-92f0e784550e", // Iran–US conflict: Are Patriot missiles enough to support Ukraine?
  "07f939e1-ebe9-400f-8795-935c2056d7f4", // Missile incident in Turkey involving Iran; NATO Article 5 not triggered
  "40630be7-c795-4fd6-8b1d-eb500ad2b85c", // Middle East crisis discussed in high-level government meeting
  "aa61c4a7-79bd-482d-872e-40bd75d9fc9c", // Houthi Leader Claims Arab Currents Align...
  "eafa4b9e-9494-4f4c-bda6-c66b100e703f", // Spain praised for opposing alleged human rights violations
  "40627f10-1b02-45b7-947e-53eca00b58f0", // Missile shortage limits F-16 intercept operations

  // Diplomatic statements / policy (no travel impact)
  "97c389e1-55a1-4834-80df-8f6ec947688f", // De-escalation channels opened with Iran
  "f34e3bde-f71e-494c-9055-216fdee794f0", // IDF: No evidence that simultaneous fire was coordinated
  "41f184fb-8d23-459d-9705-b6975991baf6", // Iran: Bilateral base-use agreements reaffirmed
  "cbc8e74d-0ec1-44ec-aa16-3cb1ca60f7ca", // White House rules out deployment of ground troops
  "a536a9e7-7632-4543-bde5-5192733dd472", // Italy not at war; no requests to use Italian bases
  "ece3a695-3dc5-4ef7-837a-15f436afce2f", // Italy: Not at war; cautious stance (dup, mislocated to UAE)
  "c66d2150-6b3a-4f46-b562-087f4dc3e5ad", // Iran denies attack on Turkey
  "eeaf07ab-ef4e-4b30-ab09-1c002142e44f", // Iran denies missile launch toward Turkey (dup)
  "d60b05d0-2b97-4d82-87f9-2e3ed0206e71", // Spain denies reports of militarily cooperating
  "b090ae36-725d-4e55-8d6d-a022b3789eea", // Iran says attack ongoing; blames US and Israel (geocoded to Washington DC)
];

// 2. Recategorize travel guides as transport
const RECATEGORIZE_IDS = [
  "396d296e-d2a6-4eb5-8200-b001f9eee4f8", // Kuwait–Saudi Arabia land border crossing
  "629d593a-e0d4-44d7-9c50-af26a11986d2", // Oman–UAE land border crossing at Hatta
  "8276a8cf-42f6-4983-95ac-0f1bb5c77770", // UAE–Oman border crossing
  "e09b2e5a-8932-4ca3-9bcc-0e1d8cc38097", // Iran–Azerbaijan land border crossing
  "776b3a82-b788-4d2e-a0d2-e618419cfecf", // Bahrain–Saudi Arabia land border crossing
  "60b3271c-3be8-4552-93dc-6405abc6fa3f", // Qatar–Saudi Arabia border crossing
  "3c0c175a-dc80-4356-9967-31183645ff7f", // Qatar–Saudi Arabia land border open
  "2b236eac-b47f-4709-8568-b73a3a780934", // Saudi Arabia border crossings with Bahrain, Kuwait and Qatar
];

// 3. Fix misgeocoded entries — these need new coordinates
const GEOCODE_FIXES: {id: string; title: string; lat: number; lng: number; locationName: string; countryCodes: string[]}[] = [
  {
    id: "bcef598d-704a-44ae-921e-3f3c9b9149e6",
    title: "Allies accuse government of insufficient defense against Iranian missile threat in Gulf and Cyprus",
    lat: 25.0, lng: 51.5, locationName: "Persian Gulf", countryCodes: [],
  },
  {
    id: "552c17bb-77b9-417b-804b-fa09be4f8ca6",
    title: "Gulf air defense assistance planned by multiple countries",
    lat: 25.0, lng: 51.5, locationName: "Persian Gulf", countryCodes: [],
  },
  {
    id: "afc424be-8c5c-4ba6-9fa9-6a702a6a4bf9",
    title: "Middle East conflict: updated death toll by country",
    lat: 33.0, lng: 44.0, locationName: "Middle East", countryCodes: [],
  },
  {
    id: "7a8c1254-1c08-4b22-93b0-9fc70f1b0d5b",
    title: "Pentagon to deploy advanced anti-drone systems to the Middle East",
    lat: 33.0, lng: 44.0, locationName: "Middle East", countryCodes: [],
  },
  {
    id: "6cd5a061-be3a-4a04-af2f-6c3e88f9b95d",
    title: "Plans to deploy air defense systems in the Middle East",
    lat: 33.0, lng: 44.0, locationName: "Middle East", countryCodes: [],
  },
  {
    id: "64332dcc-250c-49d0-840e-6b48c786bc11",
    title: "Temporary authorization of US aircraft presence at French bases in the Middle East",
    lat: 33.0, lng: 44.0, locationName: "Middle East", countryCodes: [],
  },
  {
    id: "3b6b363b-ba9a-4eef-8060-3574b282679e",
    title: "Air attacks ongoing in Karaj and Damavand, Iran",
    lat: 35.83, lng: 51.01, locationName: "Karaj, Iran", countryCodes: ["IR"],
  },
];

async function main() {
  // Deletions
  const deleted = await sql`DELETE FROM events WHERE id = ANY(${DELETE_IDS}) RETURNING id, title`;
  console.log(`Deleted ${deleted.length} non-event entries:`);
  for (const r of deleted) console.log(`  - ${r.title}`);

  // Recategorize
  const recategorized = await sql`
    UPDATE events SET category = 'transport'
    WHERE id = ANY(${RECATEGORIZE_IDS})
    RETURNING id, title, category
  `;
  console.log(`\nRecategorized ${recategorized.length} travel guides to transport:`);
  for (const r of recategorized) console.log(`  - ${r.title}`);

  // Geocode fixes
  let fixed = 0;
  for (const fix of GEOCODE_FIXES) {
    const result = await sql`
      UPDATE events
      SET location = ST_SetSRID(ST_MakePoint(${fix.lng}, ${fix.lat}), 4326)::geography,
          location_name = ${fix.locationName},
          country_codes = ${fix.countryCodes.length > 0 ? fix.countryCodes : null}
      WHERE id = ${fix.id}
      RETURNING id
    `;
    if (result.length > 0) {
      console.log(`  Fixed geocode: "${fix.title}" → ${fix.locationName} (${fix.lat}, ${fix.lng})`);
      fixed++;
    }
  }
  console.log(`\nFixed ${fixed} misgeocoded entries`);
}

main().catch(console.error);
