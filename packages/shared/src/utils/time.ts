/**
 * Format a timestamp as a relative time string (e.g., "3m ago", "2h ago").
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return "just now";

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Calculate age in minutes from a timestamp to now.
 */
export function ageInMinutes(timestamp: string | Date): number {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return Math.max(0, (Date.now() - date.getTime()) / 60_000);
}

/**
 * Convert a TimeRange preset to a Date representing the start of that range.
 */
export function timeRangeToDate(
  range: "1h" | "6h" | "24h" | "7d" | "30d",
): Date {
  const now = Date.now();
  const ms: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - ms[range]);
}
