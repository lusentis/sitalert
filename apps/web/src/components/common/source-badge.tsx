import { Badge } from "@/components/ui/badge";

interface SourceBadgeProps {
  platform: string;
  className?: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  api: "#3B82F6",
  telegram: "#229ED9",
  twitter: "#1DA1F2",
  rss: "#F97316",
  scraper: "#8B5CF6",
};

export function SourceBadge({ platform, className }: SourceBadgeProps) {
  const color = PLATFORM_COLORS[platform] ?? "#6B7280";

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
