import { Activity } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <Activity className="h-10 w-10 text-muted-foreground/50" />
        <div className="space-y-2">
          <h1 className="text-lg font-bold font-mono tracking-tight">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to map
        </Link>
      </div>
    </div>
  );
}
