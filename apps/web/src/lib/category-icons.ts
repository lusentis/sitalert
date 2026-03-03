import {
  Swords,
  Bomb,
  CloudLightning,
  Thermometer,
  HeartPulse,
  Users,
  Plane,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { EventCategory } from "@travelrisk/shared";

export const CATEGORY_ICONS: Record<EventCategory, LucideIcon> = {
  conflict: Swords,
  terrorism: Bomb,
  natural_disaster: CloudLightning,
  weather_extreme: Thermometer,
  health_epidemic: HeartPulse,
  civil_unrest: Users,
  transport: Plane,
  infrastructure: Building2,
};
