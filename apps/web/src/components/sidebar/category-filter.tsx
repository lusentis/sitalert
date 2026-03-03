"use client";

import { EVENT_CATEGORIES, CATEGORY_METADATA, type EventCategory } from "@travelrisk/shared";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-help border-b border-dotted border-muted-foreground/40">
              Categories
            </legend>
          </TooltipTrigger>
          <TooltipContent side="top">Toggle event types. Color-coded on the map.</TooltipContent>
        </Tooltip>
        {!allSelected && (
          <button
            onClick={onSetAll}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors motion-safe:active:scale-95"
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
              className="h-auto px-2 py-1 gap-1 text-xs transition-transform motion-safe:active:scale-95"
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
    </fieldset>
  );
}
