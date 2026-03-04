import type { EventCategory } from "../types/category";

export interface CategoryMetadata {
  label: string;
  color: string;
  icon: string;
  defaultSeverity: number;
}

export const CATEGORY_METADATA: Record<EventCategory, CategoryMetadata> = {
  conflict: {
    label: "Armed Conflict",
    color: "#DC2626",
    icon: "Swords",
    defaultSeverity: 4,
  },
  terrorism: {
    label: "Terrorism",
    color: "#B45309",
    icon: "Bomb",
    defaultSeverity: 5,
  },
  natural_disaster: {
    label: "Natural Disaster",
    color: "#EA580C",
    icon: "CloudLightning",
    defaultSeverity: 3,
  },
  weather_extreme: {
    label: "Extreme Weather",
    color: "#2563EB",
    icon: "Thermometer",
    defaultSeverity: 2,
  },
  health_epidemic: {
    label: "Health / Epidemic",
    color: "#16A34A",
    icon: "HeartPulse",
    defaultSeverity: 3,
  },
  civil_unrest: {
    label: "Civil Unrest",
    color: "#CA8A04",
    icon: "Users",
    defaultSeverity: 2,
  },
  transport: {
    label: "Transport",
    color: "#9333EA",
    icon: "Plane",
    defaultSeverity: 2,
  },
  infrastructure: {
    label: "Infrastructure",
    color: "#94A3B8",
    icon: "Building2",
    defaultSeverity: 2,
  },
};

export const CATEGORY_COLORS: Record<EventCategory, string> = Object.fromEntries(
  Object.entries(CATEGORY_METADATA).map(([key, meta]) => [key, meta.color]),
) as Record<EventCategory, string>;
