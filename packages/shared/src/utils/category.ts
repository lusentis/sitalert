import { CATEGORY_METADATA } from "../constants/categories";
import type { EventCategory } from "../types/category";

export function isEventCategory(value: string): value is EventCategory {
  return value in CATEGORY_METADATA;
}
