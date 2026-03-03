import { Suspense } from "react";
import { MainPage } from "@/components/main-page";

function LoadingFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1">
          <span className="size-2 rounded-full bg-muted-foreground/60 animate-pulse" />
          <span className="size-2 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
          <span className="size-2 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
        </div>
        <p className="text-sm text-muted-foreground">Loading SitAlert...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MainPage />
    </Suspense>
  );
}
