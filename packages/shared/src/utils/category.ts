import { CATEGORY_METADATA } from "../constants/categories.js";
import type { EventCategory } from "../types/category.js";

export function isEventCategory(value: string): value is EventCategory {
  return value in CATEGORY_METADATA;
}
