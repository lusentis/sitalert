export interface SeverityLevel {
  label: string;
  color: string;
  description: string;
}

export const SEVERITY_LEVELS: Record<number, SeverityLevel> = {
  1: {
    label: "Minor",
    color: "#9CA3AF",
    description: "Limited impact, localized event",
  },
  2: {
    label: "Moderate",
    color: "#F59E0B",
    description: "Noticeable impact, may affect travel",
  },
  3: {
    label: "Significant",
    color: "#F97316",
    description: "Significant impact, avoid area",
  },
  4: {
    label: "Severe",
    color: "#EF4444",
    description: "Major impact, immediate danger",
  },
  5: {
    label: "Catastrophic",
    color: "#DC2626",
    description: "Extreme impact, mass casualties possible",
  },
};

export const MIN_SEVERITY = 1;
export const MAX_SEVERITY = 5;
