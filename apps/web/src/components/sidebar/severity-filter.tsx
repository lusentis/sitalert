"use client";

import { SEVERITY_LEVELS } from "@travelrisk/shared";
import { Slider } from "@/components/ui/slider";

interface SeverityFilterProps {
  value: number;
  onChange: (value: number) => void;
}

export function SeverityFilter({ value, onChange }: SeverityFilterProps) {
  const level = SEVERITY_LEVELS[value];
  const label = level?.label ?? `Level ${value}`;

  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between">
        <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Min Severity
        </legend>
        <span
          className="text-xs font-medium"
          style={{ color: level?.color }}
        >
          {value} - {label}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={1}
        max={5}
        step={1}
        className="w-full"
        aria-label="Minimum severity level"
      />
    </fieldset>
  );
}
