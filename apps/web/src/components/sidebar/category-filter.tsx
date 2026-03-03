"use client";

import { EVENT_CATEGORIES, CATEGORY_METADATA, type EventCategory } from "@sitalert/shared";
import { Toggle } from "@/components/ui/toggle";
import { CATEGORY_ICONS } from "@/lib/category-icons";

interface CategoryFilterProps {
  selected: string[];
  onToggle: (category: string) => void;
  counts?: Record<string, number>;
}

export function CategoryFilter({
  selected,
  onToggle,
  counts,
}: CategoryFilterProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Categories
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_CATEGORIES.map((category: EventCategory) => {
          const meta = CATEGORY_METADATA[category];
          const Icon = CATEGORY_ICONS[category];
          const isActive =
            selected.length === 0 || selected.includes(category);
          const count = counts?.[category] ?? 0;

          return (
            <Toggle
              key={category}
              pressed={isActive}
              onPressedChange={() => onToggle(category)}
              className="h-auto px-2 py-1 gap-1 text-xs"
              style={{
                borderColor: isActive ? `${meta.color}60` : undefined,
                color: isActive ? meta.color : undefined,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{meta.label}</span>
              {count > 0 && (
                <span className="text-muted-foreground ml-0.5">
                  {count}
                </span>
              )}
            </Toggle>
          );
        })}
      </div>
    </div>
  );
}
