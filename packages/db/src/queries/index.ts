export {
  queryEventsInViewport,
  queryEventsGeoJSON,
  insertEvent,
  upsertEvent,
  findNearbyEvents,
  type ViewportQuery,
  type EventWithCoords,
  type GeoJSONFeature,
  type GeoJSONFeatureCollection,
} from "./events";

export { getStats24h, type EventStats } from "./stats";

export {
  findActiveSituations,
  createSituation,
  upsertSituation,
  updateSituation,
  resolveExpiredSituations,
  decaySeverity,
  mergeSituations,
  querySituationsForFeed,
  queryEventsBySituation,
  clusterOrphanedEvents,
  assignEventsToSituation,
  queryActiveSituationsFlat,
  queryCoverageGaps,
  type SituationWithCoords,
  type SituationFeedQuery,
  type OrphanCluster,
} from "./situations";

export {
  upsertAdvisory,
  queryAllAdvisories,
} from "./advisories";
