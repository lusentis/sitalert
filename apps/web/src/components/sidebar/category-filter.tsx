"use client";

import { EVENT_CATEGORIES, CATEGORY_METADATA, type EventCategory } from "@travelrisk/shared";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { ChevronRight } from "lucide-react";

interface CategoryFilterProps {
  selected: string[];
  onToggle: (category: string) => void;
  onSetCategories: (categories: string[]) => void;
  counts?: Record<string, number>;
}

export function CategoryFilter({
  selected,
  onToggle,
  onSetCategories,
  counts,
}: CategoryFilterProps) {
  const allSelected = selected.length === 0;

  const handleAll = () => onSetCategories([]);
  const handleNone = () => onSetCategories(["__none__"]);
  const handleInvert = () => {
    if (allSelected) return;
    const inverted = EVENT_CATEGORIES.filter((c) => !selected.includes(c));
    onSetCategories(inverted.length === EVENT_CATEGORIES.length ? [] : inverted);
  };

  return (
    <Collapsible defaultOpen asChild>
      <fieldset className="space-y-2">
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="group flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <Tooltip>
              <TooltipTrigger asChild>
                <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-help border-b border-dotted border-muted-foreground/40">
                  Categories
                </legend>
              </TooltipTrigger>
              <TooltipContent side="top">Show or hide event categories. Each has a matching color on the map.</TooltipContent>
            </Tooltip>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            {!allSelected && (
              <>
                <button
                  onClick={handleAll}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  All
                </button>
                <button
                  onClick={handleInvert}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Flip
                </button>
              </>
            )}
            <button
              onClick={handleNone}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              None
            </button>
          </div>
        </div>
        <CollapsibleContent>
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
                  <span className="text-muted-foreground ml-0.5 tabular-nums">
                    {count}
                  </span>
                </Toggle>
              );
            })}
          </div>
        </CollapsibleContent>
      </fieldset>
    </Collapsible>
  );
}
