import { SEVERITY_LEVELS } from "@travelrisk/shared";
import { Badge } from "@/components/ui/badge";

interface SeverityBadgeProps {
  severity: number;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const level = SEVERITY_LEVELS[severity];
  const label = level?.label ?? `Severity ${severity}`;
  const color = level?.color ?? "#9CA3AF";

  return (
    <Badge
      className={className}
      style={{
        backgroundColor: `${color}20`,
        color,
        borderColor: `${color}40`,
      }}
    >
      {label}
    </Badge>
  );
}
