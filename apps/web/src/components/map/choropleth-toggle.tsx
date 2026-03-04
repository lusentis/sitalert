"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChoroplethToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function ChoroplethToggle({ active, onToggle }: ChoroplethToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Hide travel advisories layer" : "Show travel advisories layer"}
      className={cn(
        "bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg transition-colors",
        active
          ? "text-foreground border-primary/40"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Layers className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Advisories</span>
    </button>
  );
}
