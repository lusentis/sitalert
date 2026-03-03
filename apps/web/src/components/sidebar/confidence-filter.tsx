"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ChevronRight } from "lucide-react";

interface ConfidenceFilterProps {
  value: number;
  onChange: (value: number) => void;
}

export function ConfidenceFilter({ value, onChange }: ConfidenceFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const displayValue = Math.round(value * 100);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="confidence-panel"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        <ChevronRight
          className="h-3 w-3 transition-transform duration-150"
          style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
        />
        Advanced
      </button>
      {isOpen && (
        <div id="confidence-panel" className="space-y-2 pl-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Min Confidence
            </span>
            <span className="text-xs font-medium">{displayValue}%</span>
          </div>
          <Slider
            value={[displayValue]}
            onValueChange={([v]) => onChange(v / 100)}
            min={0}
            max={100}
            step={5}
            className="w-full"
            aria-label="Minimum confidence"
          />
        </div>
      )}
    </div>
  );
}
