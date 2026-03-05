"use client";

import { Activity, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="relative">
          <Activity className="h-10 w-10 text-destructive/70" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold font-mono tracking-tight">
            Failed to load
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error.message || "An unexpected error occurred while loading the page."}
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
