import { cn } from "@/lib/utils";
import { getLevelInfo, levelBgMap } from "@/domain/students";

interface LevelBadgeProps {
  memorizedJuzCount: number;
  className?: string;
}

export function LevelBadge({ memorizedJuzCount, className }: LevelBadgeProps) {
  const { level, label } = getLevelInfo(memorizedJuzCount);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        levelBgMap[level],
        className
      )}
    >
      {label}
    </span>
  );
}
