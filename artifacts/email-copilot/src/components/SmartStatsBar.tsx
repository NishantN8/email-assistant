import { useEffect, useRef, useState } from "react";
import { Brain, Zap, Sparkles, Clock, AlertCircle, CreditCard, Mail, ChevronRight, GripHorizontal } from "lucide-react";
import { useInboxStats } from "@/hooks/use-sender-stats";
import { useGetInboxSummary } from "@workspace/api-client-react";
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
    blue: "text-blue-400 bg-blue-400/8 border-blue-400/15 hover:border-blue-400/30",
    orange: "text-orange-400 bg-orange-400/8 border-orange-400/15 hover:border-orange-400/30",
    green: "text-green-400 bg-green-400/8 border-green-400/15 hover:border-green-400/30",
    purple: "text-purple-400 bg-purple-400/8 border-purple-400/15 hover:border-purple-400/30",
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-200",
        colors[accent],
        active && "ring-2 ring-offset-1 ring-offset-background ring-current scale-[1.03]",
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
        !onClick && "cursor-default"
      )}
    >
      <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center shrink-0", `bg-${accent}-400/10`)}>
        {icon}
      </div>
      <div className="text-left min-w-0">
        <div className="text-[12px] font-bold tabular-nums leading-none">
          {animated}{suffix}
        </div>
        <div className="text-[9px] opacity-60 mt-0.5 whitespace-nowrap">{label}</div>
      </div>
      {onClick && (
        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-40 ml-auto transition-opacity" />
      )}
    </motion.button>
  );
}

interface FilterChipProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  bg: string;
  onClick?: () => void;
  active?: boolean;
}

function FilterChip({ icon, label, count, color, bg, onClick, active }: FilterChipProps) {
  const animated = useCountUp(count);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all duration-200 shrink-0 text-xs font-bold",
        bg,
        active && "ring-2 ring-offset-1 ring-offset-background ring-current scale-[1.03]",
        onClick && "hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
      )}
    >
      <span className={cn("w-3 h-3 shrink-0 flex items-center justify-center", color)}>{icon}</span>
      <span className={cn("font-mono", color)}>{animated}</span>
      <span className="text-muted-foreground hidden sm:inline">{label}</span>
    </button>
  );
}

interface SmartStatsBarProps {
  onFilterAction?: (filter: string) => void;
  activeFilter?: string | null;
}

const MIN_HEIGHT = 42;
const MAX_HEIGHT = 200;

export function SmartStatsBar({ onFilterAction, activeFilter }: SmartStatsBarProps) {
  const { data: stats } = useInboxStats();
  const { data: summary } = useGetInboxSummary();
  const [barHeight, setBarHeight] = useState(MIN_HEIGHT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(MIN_HEIGHT);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = barHeight;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dy = ev.clientY - startY.current;
      setBarHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH.current + dy)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const isExpanded = barHeight > MIN_HEIGHT + 8;

  if (!stats && !summary) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30" style={{ height: MIN_HEIGHT }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="h-7 w-20 rounded-xl bg-secondary/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-border/30 relative flex flex-col" style={{ height: barHeight }}>
      {/* ── Scrollable content area ── */}
      <div
        className={cn(
          "flex-1 flex gap-1.5 px-4 py-2 overflow-hidden",
          isExpanded ? "flex-wrap content-start overflow-y-auto" : "items-center overflow-x-auto scrollbar-none"
        )}
      >
        {/* ── Filter chips ── */}
        {summary && (
          <>
            <FilterChip
              icon={<Zap className="w-3 h-3" />}
              label="Need Action"
              count={summary.needsActionCount}
              color="text-score-high"
              bg="bg-score-high/10 border-score-high/20 hover:border-score-high/40"
              onClick={onFilterAction ? () => onFilterAction("priority") : undefined}
              active={activeFilter === "priority"}
            />
            <FilterChip
              icon={<AlertCircle className="w-3 h-3" />}
              label="Critical"
              count={summary.criticalCount}
              color="text-score-critical"
              bg="bg-score-critical/10 border-score-critical/20 hover:border-score-critical/40"
              onClick={onFilterAction ? () => onFilterAction("critical") : undefined}
              active={activeFilter === "critical"}
            />
            <FilterChip
              icon={<CreditCard className="w-3 h-3" />}
              label="Payments"
              count={summary.paymentsCount}
              color="text-primary"
              bg="bg-primary/10 border-primary/20 hover:border-primary/40"
              onClick={onFilterAction ? () => onFilterAction("payments") : undefined}
              active={activeFilter === "payments"}
            />
            <FilterChip
              icon={<Mail className="w-3 h-3" />}
              label="Unread"
              count={summary.unreadCount}
              color="text-muted-foreground"
              bg="bg-secondary/50 border-border/50 hover:border-border"
              onClick={onFilterAction ? () => onFilterAction("unread") : undefined}
              active={activeFilter === "unread"}
            />
          </>
        )}

        {/* ── Divider ── */}
        {summary && stats && (
          <div className={cn(
            "bg-border/50 shrink-0 self-center",
            isExpanded ? "w-full h-px my-0.5" : "w-px h-5 mx-0.5"
          )} />
        )}

        {/* ── Stat cards ── */}
        {stats && (
          <>
            <StatCard
              icon={<Brain className="w-3 h-3 text-blue-400" />}
              label="AI scored"
              value={stats.aiScored}
              accent="blue"
            />
            <StatCard
              icon={<Sparkles className="w-3 h-3 text-green-400" />}
              label="AI coverage"
              value={stats.coveragePercent}
              suffix="%"
              accent="green"
            />
            <StatCard
              icon={<Clock className="w-3 h-3 text-purple-400" />}
              label="min saved"
              value={stats.estimatedMinutesSaved}
              accent="purple"
            />
            <GpuWidget />
          </>
        )}
      </div>

      {/* ── Vertical drag handle ── */}
      <div
        onMouseDown={onDragStart}
        className="absolute bottom-0 left-0 right-0 h-3 flex items-end justify-center cursor-ns-resize group z-10"
        title="Drag to resize"
      >
        <div className="w-12 h-0.5 rounded-full bg-border/40 group-hover:bg-primary/50 group-active:bg-primary transition-colors mb-0.5" />
        <GripHorizontal className="absolute w-3 h-3 text-border/40 group-hover:text-primary/50 opacity-0 group-hover:opacity-100 transition-opacity bottom-0.5" />
      </div>
    </div>
  );
}
