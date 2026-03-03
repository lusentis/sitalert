/** Default map center — world view slightly north of equator */
export const MAP_DEFAULT_CENTER: [number, number] = [0, 20];

/** Default map zoom level */
export const MAP_DEFAULT_ZOOM = 2;

/** SSE reconnection config */
export const SSE_CONFIG = {
  /** Initial reconnect delay in milliseconds */
  initialDelayMs: 1_000,
  /** Backoff multiplier */
  multiplier: 2,
  /** Maximum reconnect delay in milliseconds */
  maxDelayMs: 30_000,
  /** Maximum number of reconnection attempts */
  maxRetries: 10,
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: 30_000,
} as const;

/** Debounce time for viewport changes in milliseconds */
export const VIEWPORT_DEBOUNCE_MS = 300;

/** Threshold in minutes for "new" event badge */
export const NEW_EVENT_THRESHOLD_MINUTES = 5;
