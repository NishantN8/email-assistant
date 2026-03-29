import { Sparkles, Brain, Zap, Clock } from "lucide-react";
import { useInboxStats } from "@/hooks/use-sender-stats";
import { cn } from "@/lib/utils";

function StatPill({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border",
      highlight
        ? "bg-primary/10 border-primary/20 text-primary"
        : "bg-secondary/60 border-border/40 text-muted-foreground"
    )}>
      <span className="shrink-0">{icon}</span>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="hidden sm:inline opacity-70">{label}</span>
    </div>
  );
}

export function SmartStatsBar() {
  const { data: stats } = useInboxStats();

  if (!stats) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/30 overflow-x-auto scrollbar-none">
      <StatPill
        icon={<Brain className="w-3 h-3" />}
        label="AI scored"
        value={stats.aiScored}
        highlight
      />
      <StatPill
        icon={<Sparkles className="w-3 h-3" />}
        label="coverage"
        value={`${stats.coveragePercent}%`}
      />
      {stats.criticalCount > 0 && (
        <StatPill
          icon={<Zap className="w-3 h-3 text-red-400" />}
          label="critical"
          value={stats.criticalCount}
          highlight
        />
      )}
      <StatPill
        icon={<Clock className="w-3 h-3" />}
        label="min saved"
        value={stats.estimatedMinutesSaved}
      />
    </div>
  );
}
