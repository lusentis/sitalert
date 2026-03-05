/**
 * One-time reorganization of situations around the USA/Israel-Iran conflict.
 *
 * Creates proper situation clusters and reassigns events.
 *
 * Usage: cd apps/collector && pnpm tsx scripts/reorganize-situations.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL required");
const sql = neon(DATABASE_URL);

// --- Step 1: Create new well-structured situations ---

interface NewSituation {
  title: string;
  summary: string;
  category: string;
  severity: number;
  countryCodes: string[];
  // lat/lng for the situation pin on the map
  lat: number;
  lng: number;
}

const CORE_WAR: NewSituation = {
  title: "USA-Israel military campaign against Iran",
  summary:
    "Large-scale US and Israeli air and missile strikes against Iranian military infrastructure, " +
    "with Iranian retaliatory missile and drone attacks on Israel. Includes strikes on Tehran, " +
    "Isfahan, Karaj, Qom, and Iranian retaliation against Israeli cities.",
  category: "conflict",
  severity: 5,
  countryCodes: ["US", "IL", "IR"],
  lat: 32.08, // Tehran
  lng: 51.42,
};

const GULF_SPILLOVER: NewSituation = {
  title: "Iran conflict: Gulf state attacks and Strait of Hormuz disruption",
  summary:
    "Spillover attacks on Gulf states including missile strikes on Bahrain, UAE, Saudi Arabia, " +
    "and Qatar. IRGC closure of Strait of Hormuz disrupts global shipping.",
  category: "conflict",
  severity: 5,
  countryCodes: ["BH", "AE", "SA", "QA", "OM", "KW"],
  lat: 26.0,
  lng: 51.5, // Persian Gulf
};

const IRAN_AZERBAIJAN: NewSituation = {
  title: "Iranian drone and missile incidents on Azerbaijan territory",
  summary:
    "Iranian drones and missiles striking Azerbaijani territory, particularly Nakhchivan, " +
    "as spillover from the broader Iran conflict. Azerbaijan closes airspace and repositions defenses.",
  category: "conflict",
  severity: 4,
  countryCodes: ["AZ", "IR"],
  lat: 39.2,
  lng: 45.4, // Nakhchivan
};

const NATO_RESPONSE: NewSituation = {
  title: "NATO and allied military response to Iran conflict",
  summary:
    "European and NATO member states deploy naval and air defense assets in response to the Iran war. " +
    "Includes Cyprus naval reinforcements, Italy/France/Spain/UK/Netherlands military posture changes, " +
    "and US base access agreements.",
  category: "conflict",
  severity: 4,
  countryCodes: ["CY", "IT", "FR", "ES", "NL", "GB", "CA"],
  lat: 35.0,
  lng: 33.0, // Eastern Mediterranean
};

// --- Step 2: Map old situations to new ones ---

// Old situation IDs to absorb into new situations
// (events get reassigned, old situations get resolved)

// "Insurgencies in Iran with spillover to Iraq and Turkey" (severity 5, 38 events)
const IRAN_INSURGENCY_1 = "18025bd9-cdb2-4311-b037-4b8472b9e41b";
// "Insurgencies in Iran with spillover to Iraq and Turkey" (severity 4, 10 events) — DUPLICATE
const IRAN_INSURGENCY_2 = "0d35235e-8cf8-465f-8747-0e6d2a884942";
// "Arab-Israeli conflict with regional spillover" (33 events)
const ARAB_ISRAELI = "80094561-bbf1-42a9-a683-e9c96c850df9";

// Gulf situations to merge into GULF_SPILLOVER
const BAHRAIN_CONFLICT = "566d991c-315d-4e4f-91e9-28555dccf670";
const QATAR_CONFLICT = "668be92f-0d84-417e-998c-76faf48dd022";
const OMAN_CONFLICT = "c504eedd-b0a5-427f-bf33-485e68ce13d4";
const YEMENI_WAR = "a34fe7b1-e93c-4579-ba7a-23e299a293ec";

// Azerbaijan situations to merge into IRAN_AZERBAIJAN
const NAGORNO_KARABAKH = "69847923-c70e-4107-818a-dbad2d99c59a";

// NATO/allied response situations — these can be fully absorbed
const CYPRUS_CONFLICT = "c7b26158-17d9-444d-a987-9f9dd681d2de";
const FRANCE_CONFLICT = "8f2fa205-c634-4577-ace3-a66b3d9e3b8a";
const NETHERLANDS_CONFLICT = "feb6ca50-63d5-44b2-a379-13cfe5abc1ac";
const UK_CONFLICT = "b2d8e86c-159f-4111-93ac-d7443f14df13";
const CANADA_CONFLICT = "90d9ea1e-ebbb-41cf-b5e1-341e798995f6";

// Mixed situations — only move Iran-related events, leave domestic ones
const ITALY_CONFLICT = "4ab6ba14-3e96-483e-9eb5-ba9c7ed43bee";
const SPAIN_CONFLICT = "bb9a8fb7-8801-483c-a68f-50c1d4f05b5a";
const US_CONFLICT = "2309ccc0-3f2f-4c4b-9a17-0a5b5c624827";

// Iran terrorism — attacks in Tabriz, Qom, Bandar Abbas are part of the core war
const IRAN_TERRORISM = "00e2cbc0-ddbc-48b6-b85a-0dcfc5fd0359";
// Saudi terrorism — Riyadh explosions are Gulf spillover
const SAUDI_TERRORISM = "63ad5f25-284a-44a1-81ba-f739142a5ec9";

// Iraqi conflict — Iran missiles on Kurdistan, US CRAM in Erbil are part of the core war
const IRAQI_CONFLICT = "fcc22d51-b899-456b-9e08-b3c51db84107";
// Erbil explosions — same
const ERBIL_SITUATION = "596cce2b-f003-4ffe-8b61-1f6914fbf642";

// Misassigned events to fix
const PNG_SITUATION = "7b27b850-c20c-4553-9971-015e6367b150"; // has a Gulf event misassigned
const SRI_LANKA_CONFLICT = "da92d7d9-9cc1-4354-9abe-6bca9bb972d1"; // Iranian frigate sinking

async function main() {
  console.log("=== Reorganizing situations ===\n");

  // Step 1: Create new situations
  console.log("Creating new situations...");

  const [coreWarRow] = await sql`
    INSERT INTO situations (title, summary, category, severity, country_codes, location, first_seen, last_updated, status)
    VALUES (
      ${CORE_WAR.title}, ${CORE_WAR.summary}, ${CORE_WAR.category}, ${CORE_WAR.severity},
      ${CORE_WAR.countryCodes}::text[],
      ST_SetSRID(ST_MakePoint(${CORE_WAR.lng}, ${CORE_WAR.lat}), 4326)::geography,
      NOW(), NOW(), 'active'
    )
    RETURNING id
  `;
  console.log(`  Core war: ${coreWarRow.id}`);

  const [gulfRow] = await sql`
    INSERT INTO situations (title, summary, category, severity, country_codes, location, first_seen, last_updated, status)
    VALUES (
      ${GULF_SPILLOVER.title}, ${GULF_SPILLOVER.summary}, ${GULF_SPILLOVER.category}, ${GULF_SPILLOVER.severity},
      ${GULF_SPILLOVER.countryCodes}::text[],
      ST_SetSRID(ST_MakePoint(${GULF_SPILLOVER.lng}, ${GULF_SPILLOVER.lat}), 4326)::geography,
      NOW(), NOW(), 'active'
    )
    RETURNING id
  `;
  console.log(`  Gulf spillover: ${gulfRow.id}`);

  const [azRow] = await sql`
    INSERT INTO situations (title, summary, category, severity, country_codes, location, first_seen, last_updated, status)
    VALUES (
      ${IRAN_AZERBAIJAN.title}, ${IRAN_AZERBAIJAN.summary}, ${IRAN_AZERBAIJAN.category}, ${IRAN_AZERBAIJAN.severity},
      ${IRAN_AZERBAIJAN.countryCodes}::text[],
      ST_SetSRID(ST_MakePoint(${IRAN_AZERBAIJAN.lng}, ${IRAN_AZERBAIJAN.lat}), 4326)::geography,
      NOW(), NOW(), 'active'
    )
    RETURNING id
  `;
  console.log(`  Iran-Azerbaijan: ${azRow.id}`);

  const [natoRow] = await sql`
    INSERT INTO situations (title, summary, category, severity, country_codes, location, first_seen, last_updated, status)
    VALUES (
      ${NATO_RESPONSE.title}, ${NATO_RESPONSE.summary}, ${NATO_RESPONSE.category}, ${NATO_RESPONSE.severity},
      ${NATO_RESPONSE.countryCodes}::text[],
      ST_SetSRID(ST_MakePoint(${NATO_RESPONSE.lng}, ${NATO_RESPONSE.lat}), 4326)::geography,
      NOW(), NOW(), 'active'
    )
    RETURNING id
  `;
  console.log(`  NATO response: ${natoRow.id}`);

  // Step 2: Reassign events from old situations to new ones

  // Core war: absorb Iran insurgencies + Arab-Israeli conflict
  const coreOldIds = [IRAN_INSURGENCY_1, IRAN_INSURGENCY_2, ARAB_ISRAELI];
  const coreResult = await sql`
    UPDATE events SET situation_id = ${coreWarRow.id}, updated_at = NOW()
    WHERE situation_id = ANY(${coreOldIds}::uuid[])
  `;
  console.log(`\nReassigned ${coreResult.length ?? "?"} events to core war`);

  // Gulf spillover: absorb Bahrain, Qatar, Oman, Yemeni war situations
  const gulfOldIds = [BAHRAIN_CONFLICT, QATAR_CONFLICT, OMAN_CONFLICT, YEMENI_WAR];
  const gulfResult = await sql`
    UPDATE events SET situation_id = ${gulfRow.id}, updated_at = NOW()
    WHERE situation_id = ANY(${gulfOldIds}::uuid[])
  `;
  console.log(`Reassigned ${gulfResult.length ?? "?"} events to Gulf spillover`);

  // Iran-Azerbaijan: absorb Nagorno-Karabakh
  const azOldIds = [NAGORNO_KARABAKH];
  const azResult = await sql`
    UPDATE events SET situation_id = ${azRow.id}, updated_at = NOW()
    WHERE situation_id = ANY(${azOldIds}::uuid[])
  `;
  console.log(`Reassigned ${azResult.length ?? "?"} events to Iran-Azerbaijan`);

  // NATO response: fully absorb Cyprus, France, Netherlands, UK, Canada
  const natoFullAbsorbIds = [CYPRUS_CONFLICT, FRANCE_CONFLICT, NETHERLANDS_CONFLICT, UK_CONFLICT, CANADA_CONFLICT];
  const natoResult = await sql`
    UPDATE events SET situation_id = ${natoRow.id}, updated_at = NOW()
    WHERE situation_id = ANY(${natoFullAbsorbIds}::uuid[])
  `;
  console.log(`Reassigned ${natoResult.length ?? "?"} events to NATO response (full absorb)`);

  // Italy, Spain, US: move only Iran/Gulf/NATO-related events, leave domestic ones
  const mixedSitIds = [ITALY_CONFLICT, SPAIN_CONFLICT, US_CONFLICT];
  const iranKeywords = [
    '%iran%', '%gulf%', '%air defense%', '%nato%', '%middle east%',
    '%deploy%', '%frigate%', '%war powers%', '%centcom%', '%pentagon%',
    '%drone system%', '%cyprus%', '%mediterranean%', '%aircraft%',
  ];
  const keywordCondition = iranKeywords.map(k => `title ILIKE '${k}'`).join(' OR ');
  const mixedToNato = await sql`
    UPDATE events SET situation_id = ${natoRow.id}, updated_at = NOW()
    WHERE situation_id = ANY(${mixedSitIds}::uuid[])
    AND (${sql.unsafe(keywordCondition)})
  `;
  console.log(`Reassigned ${mixedToNato.length ?? "?"} events from mixed situations to NATO response`);

  // Move US-specific core war events (Senate votes on Iran, CENTCOM operations)
  const usToCore = await sql`
    UPDATE events SET situation_id = ${coreWarRow.id}, updated_at = NOW()
    WHERE situation_id = ${US_CONFLICT}
    AND (title ILIKE '%senate%iran%' OR title ILIKE '%centcom%' OR title ILIKE '%tampa%')
  `;
  console.log(`Reassigned ${usToCore.length ?? "?"} US events to core war`);

  // Iran terrorism → core war (attacks on Iranian cities)
  const iranTerrorResult = await sql`
    UPDATE events SET situation_id = ${coreWarRow.id}, updated_at = NOW()
    WHERE situation_id = ${IRAN_TERRORISM}
  `;
  console.log(`Reassigned ${iranTerrorResult.length ?? "?"} Iran terrorism events to core war`);

  // Saudi terrorism → Gulf spillover (Riyadh explosions)
  const saudiTerrorResult = await sql`
    UPDATE events SET situation_id = ${gulfRow.id}, updated_at = NOW()
    WHERE situation_id = ${SAUDI_TERRORISM}
  `;
  console.log(`Reassigned ${saudiTerrorResult.length ?? "?"} Saudi terrorism events to Gulf spillover`);

  // Iraqi conflict + Erbil → core war (Iran missiles on Kurdistan, US CRAM)
  const iraqResult = await sql`
    UPDATE events SET situation_id = ${coreWarRow.id}, updated_at = NOW()
    WHERE situation_id = ANY(${[IRAQI_CONFLICT, ERBIL_SITUATION]}::uuid[])
  `;
  console.log(`Reassigned ${iraqResult.length ?? "?"} Iraqi conflict events to core war`);

  // Fix misassigned events
  // "Gulf air defense assistance" event misassigned to Papua New Guinea
  const pngFix = await sql`
    UPDATE events SET situation_id = ${natoRow.id}, updated_at = NOW()
    WHERE situation_id = ${PNG_SITUATION}
    AND title ILIKE '%gulf%'
  `;
  console.log(`Fixed ${pngFix.length ?? "?"} misassigned PNG event(s)`);

  // Iranian frigate sunk near Sri Lanka → belongs to core war
  const sriLankaFix = await sql`
    UPDATE events SET situation_id = ${coreWarRow.id}, updated_at = NOW()
    WHERE situation_id = ${SRI_LANKA_CONFLICT}
    AND title ILIKE '%iranian%'
  `;
  console.log(`Fixed ${sriLankaFix.length ?? "?"} misassigned Sri Lanka event(s)`);

  // Step 3: Resolve old situations (only fully absorbed ones)
  const allOldIds = [
    ...coreOldIds, ...gulfOldIds, ...azOldIds, ...natoFullAbsorbIds,
    IRAN_TERRORISM, SAUDI_TERRORISM, IRAQI_CONFLICT, ERBIL_SITUATION,
  ];
  await sql`
    UPDATE situations SET status = 'resolved', updated_at = NOW()
    WHERE id = ANY(${allOldIds}::uuid[])
  `;
  console.log(`\nResolved ${allOldIds.length} fully-absorbed old situations`);

  // Resolve mixed situations only if they have no events left
  for (const mixedId of mixedSitIds) {
    const [count] = await sql`SELECT count(*)::int as c FROM events WHERE situation_id = ${mixedId}`;
    if (count.c === 0) {
      await sql`UPDATE situations SET status = 'resolved', updated_at = NOW() WHERE id = ${mixedId}`;
      console.log(`Resolved empty mixed situation ${mixedId}`);
    } else {
      // Recount
      await sql`
        UPDATE situations SET
          event_count = ${count.c},
          updated_at = NOW()
        WHERE id = ${mixedId}
      `;
      console.log(`Mixed situation ${mixedId} still has ${count.c} domestic events`);
    }
  }

  // Step 4: Recount event_count for new situations
  for (const newId of [coreWarRow.id, gulfRow.id, azRow.id, natoRow.id]) {
    await sql`
      UPDATE situations SET
        event_count = (SELECT count(*)::int FROM events WHERE situation_id = ${newId}),
        first_seen = COALESCE((SELECT min(timestamp) FROM events WHERE situation_id = ${newId}), NOW()),
        last_updated = COALESCE((SELECT max(timestamp) FROM events WHERE situation_id = ${newId}), NOW())
      WHERE id = ${newId}
    `;
  }
  console.log("Recounted event totals for new situations");

  // Step 5: Summary
  const newSituations = await sql`
    SELECT id, title, event_count, severity, array_to_string(country_codes, ', ') as countries
    FROM situations
    WHERE id = ANY(${[coreWarRow.id, gulfRow.id, azRow.id, natoRow.id]}::uuid[])
  `;
  console.log("\n=== New situation structure ===");
  for (const s of newSituations) {
    console.log(`  [${s.event_count} events] ${s.title} (sev ${s.severity}, countries: ${s.countries})`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
