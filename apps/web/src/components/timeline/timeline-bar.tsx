"use client";

import { Button } from "@/components/ui/button";
import type { TimeRange } from "@travelrisk/shared";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

interface TimelineBarProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

export function TimelineBar({ value, onChange }: TimelineBarProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="absolute bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur border border-border rounded-full px-2 py-1 flex items-center gap-1 shadow-lg"
    >
      {TIME_RANGE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "ghost"}
          size="sm"
          className="h-7 px-3 text-xs rounded-full"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
