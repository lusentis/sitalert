import { Badge } from "@/components/ui/badge";

interface NewBadgeProps {
  className?: string;
}

export function NewBadge({ className }: NewBadgeProps) {
  return (
    <Badge
      className={[
        "animate-pulse bg-emerald-500 text-white border-emerald-400 text-[10px] px-1.5 py-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      NEW
    </Badge>
  );
}
