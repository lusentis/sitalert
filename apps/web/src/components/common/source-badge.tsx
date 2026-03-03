import { Badge } from "@/components/ui/badge";
import { PLATFORM_COLORS } from "@travelrisk/shared";

interface SourceBadgeProps {
  platform: string;
  className?: string;
}

export function SourceBadge({ platform, className }: SourceBadgeProps) {
  const color = PLATFORM_COLORS[platform] ?? "#9CA3AF";

  return (
    <Badge
      variant="outline"
      className={className}
      style={{
        borderColor: `${color}60`,
        color,
      }}
    >
      {platform}
    </Badge>
  );
}
