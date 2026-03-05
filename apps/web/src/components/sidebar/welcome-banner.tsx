"use client";

import { X } from "lucide-react";

interface WelcomeBannerProps {
  onDismiss: () => void;
}

export function WelcomeBanner({ onDismiss }: WelcomeBannerProps) {
  return (
    <div
      role="status"
      className="relative rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2"
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss welcome message"
        className="absolute top-1.5 right-1.5 p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="font-medium text-foreground pr-5">
        What&apos;s happening around the world, right now.
      </p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        Conflicts, disasters, health alerts, and more — collected from global
        monitoring sources. Filter by category above or browse the feed below.
      </p>
    </div>
  );
}
