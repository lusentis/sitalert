"use client";

import { Activity, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-background text-foreground">
        <div className="flex h-screen w-screen items-center justify-center p-6">
          <div className="flex flex-col items-center gap-6 max-w-md text-center">
            <Activity className="h-10 w-10 text-primary" />
            <div className="space-y-2">
              <h1 className="text-lg font-bold font-mono tracking-tight">
                Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An unexpected error occurred. This has been logged and we&apos;re looking into it.
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
      </body>
    </html>
  );
}
