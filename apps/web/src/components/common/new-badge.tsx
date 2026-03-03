import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NewBadgeProps {
  className?: string;
}

export function NewBadge({ className }: NewBadgeProps) {
  return (
    <Badge
      className={cn(
        "motion-safe:animate-pulse bg-emerald-500 text-white border-emerald-400 text-[10px] px-1.5 py-0",
        className,
      )}
    >
      NEW
    </Badge>
  );
}
