import { customType } from "drizzle-orm/pg-core";

/**
 * Custom Drizzle column type for PostGIS GEOGRAPHY(POINT, 4326).
 * Stores the raw SQL value; use ST_X/ST_Y to extract lng/lat in queries.
 */
export const geographyPoint = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "geography(POINT, 4326)";
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return value;
  },
});
