import { useEffect, useRef, useState } from "react";
import { Brain, Zap, Sparkles, Clock, ChevronRight } from "lucide-react";
import { useInboxStats } from "@/hooks/use-sender-stats";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { GpuWidget } from "@/components/GpuWidget";

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);
  const start = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    start.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  accent?: "blue" | "orange" | "green" | "purple";
  onClick?: () => void;
  active?: boolean;
}

function StatCard({ icon, label, value, suffix = "", accent = "blue", onClick, active }: StatCardProps) {
  const animated = useCountUp(value);
  const colors = {
    blue: "text-blue-400 bg-blue-400/8 border-blue-400/15 group-hover:border-blue-400/30",
    orange: "text-orange-400 bg-orange-400/8 border-orange-400/15 group-hover:border-orange-400/30",
    green: "text-green-400 bg-green-400/8 border-green-400/15 group-hover:border-green-400/30",
    purple: "text-purple-400 bg-purple-400/8 border-purple-400/15 group-hover:border-purple-400/30",
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-200",
        colors[accent],
        active && "ring-2 ring-offset-1 ring-offset-background ring-current scale-[1.03]",
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
        !onClick && "cursor-default"
      )}
    >
      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", `bg-${accent}-400/10`)}>
        {icon}
      </div>
      <div className="text-left min-w-0">
        <div className="text-[13px] font-bold tabular-nums leading-none">
          {animated}{suffix}
        </div>
        <div className="text-[10px] opacity-60 mt-0.5 whitespace-nowrap">{label}</div>
      </div>
      {onClick && (
        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-40 ml-auto transition-opacity" />
      )}
    </motion.button>
  );
}

export function SmartStatsBar({ onFilterAction, activeFilter }: { onFilterAction?: (filter: string) => void; activeFilter?: string | null }) {
  const { data: stats } = useInboxStats();

  if (!stats) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-9 w-24 rounded-xl bg-secondary/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 overflow-x-auto scrollbar-none">
      <StatCard
        icon={<Brain className="w-3.5 h-3.5 text-blue-400" />}
        label="AI scored"
        value={stats.aiScored}
        accent="blue"
      />
      <StatCard
        icon={<Zap className="w-3.5 h-3.5 text-orange-400" />}
        label="need action"
        value={stats.highPriorityCount + stats.criticalCount}
        accent="orange"
        onClick={onFilterAction ? () => onFilterAction("priority") : undefined}
        active={activeFilter === "priority"}
      />
      <StatCard
        icon={<Sparkles className="w-3.5 h-3.5 text-green-400" />}
        label="AI coverage"
        value={stats.coveragePercent}
        suffix="%"
        accent="green"
      />
      <StatCard
        icon={<Clock className="w-3.5 h-3.5 text-purple-400" />}
        label="min saved"
        value={stats.estimatedMinutesSaved}
        accent="purple"
      />
      <GpuWidget />
    </div>
  );
}
