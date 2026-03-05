/**
 * One-time script to simplify verbose Nominatim location names to "City, Country".
 *
 * Finds events with overly detailed location_name (4+ commas = Nominatim verbose pattern),
 * reverse-geocodes their existing coordinates at zoom=10 (city level), and updates the names.
 *
 * Usage:
 *   cd apps/collector && npx tsx scripts/cleanup-location-names.ts
 *
 * Requires DATABASE_URL and NOMINATIM_URL (optional, defaults to OSM) in .env
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const NOMINATIM_URL =
  process.env["NOMINATIM_URL"] ?? "https://nominatim.openstreetmap.org";

const sql = neon(DATABASE_URL);

const NominatimReverseSchema = z.object({
  display_name: z.string(),
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      municipality: z.string().optional(),
      county: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

function simplifyAddress(address: z.infer<typeof NominatimReverseSchema>["address"]): string | null {
  if (!address) return null;
  const locality =
    address.city ?? address.town ?? address.village ?? address.municipality ?? address.county;
  const country = address.country;
  if (!locality && !country) return null;
  if (!locality) return country ?? null;
  if (!country) return locality;
  return `${locality}, ${country}`;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `${NOMINATIM_URL}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)" },
  });
  if (!response.ok) return null;

  const json: unknown = await response.json();
  const result = NominatimReverseSchema.safeParse(json);
  if (!result.success) return null;

  return simplifyAddress(result.data.address) ?? result.data.display_name;
}

async function main() {
  // Find events with verbose location names (4+ commas)
  const verbose = await sql`
    SELECT id, location_name, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
    FROM events
    WHERE location_name IS NOT NULL
      AND (LENGTH(location_name) - LENGTH(REPLACE(location_name, ',', ''))) >= 4
  `;

  console.log(`Found ${verbose.length} events with verbose location names`);

  let updated = 0;
  let failed = 0;

  for (const event of verbose) {
    const lat = event.lat as number;
    const lng = event.lng as number;
    const id = event.id as string;
    const oldName = event.location_name as string;

    // Rate limit: 1 req/sec for Nominatim
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const newName = await reverseGeocode(lat, lng);
    if (!newName) {
      console.log(`  SKIP ${id}: reverse geocode failed for (${lat}, ${lng})`);
      failed++;
      continue;
    }

    await sql`UPDATE events SET location_name = ${newName} WHERE id = ${id}`;
    console.log(`  OK ${id}: "${oldName}" → "${newName}"`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed, ${verbose.length - updated - failed} skipped`);
}

main().catch(console.error);
