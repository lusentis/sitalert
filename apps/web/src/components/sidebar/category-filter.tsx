"use client";

import { EVENT_CATEGORIES, CATEGORY_METADATA, type EventCategory } from "@sitalert/shared";
import { Toggle } from "@/components/ui/toggle";
import { CATEGORY_ICONS } from "@/lib/category-icons";

interface CategoryFilterProps {
  selected: string[];
  onToggle: (category: string) => void;
  onSetAll: () => void;
  counts?: Record<string, number>;
}

export function CategoryFilter({
  selected,
  onToggle,
  onSetAll,
  counts,
}: CategoryFilterProps) {
  const allSelected = selected.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Categories
        </h3>
        {!allSelected && (
          <button
            onClick={onSetAll}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            All
          </button>
        )}
      </div>
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
