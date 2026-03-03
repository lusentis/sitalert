import { SEVERITY_LEVELS } from "@sitalert/shared";
import { Badge } from "@/components/ui/badge";

interface SeverityBadgeProps {
  severity: number;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const level = SEVERITY_LEVELS[severity];
  const label = level?.label ?? `Severity ${severity}`;
  const color = level?.color ?? "#6B7280";

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
