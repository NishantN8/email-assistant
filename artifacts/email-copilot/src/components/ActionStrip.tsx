import { useGetInboxSummary } from "@workspace/api-client-react";
import { Zap, AlertCircle, CreditCard, Mail } from "lucide-react";
import { motion } from "framer-motion";

export function ActionStrip({ compact = false }: { compact?: boolean }) {
  const { data: summary, isLoading } = useGetInboxSummary();

  if (isLoading || !summary) {
    return (
      <div className={`w-full ${compact ? "h-10" : "h-16"} rounded-xl bg-secondary/50 animate-pulse border border-border/50 ${compact ? "mb-0" : "mb-8"}`} />
    );
  }

  const items = [
    {
      id: "needs-action",
      label: "Need Action",
      count: summary.needsActionCount,
      icon: Zap,
      color: "text-score-high",
      bg: "bg-score-high/10 border-score-high/20",
    },
    {
      id: "critical",
      label: "Critical Alerts",
      count: summary.criticalCount,
      icon: AlertCircle,
      color: "text-score-critical",
      bg: "bg-score-critical/10 border-score-critical/20",
    },
    {
      id: "payments",
      label: "Payments",
      count: summary.paymentsCount,
      icon: CreditCard,
      color: "text-primary",
      bg: "bg-primary/10 border-primary/20",
    },
    {
      id: "unread",
      label: "Total Unread",
      count: summary.unreadCount,
      icon: Mail,
      color: "text-muted-foreground",
      bg: "bg-secondary/50 border-border/50",
    }
  ];

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-background/60 shrink-0 overflow-x-auto"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${item.bg} shrink-0`}>
              <Icon className={`w-3 h-3 ${item.color}`} />
              <span className={`text-xs font-bold font-mono ${item.color}`}>{item.count}</span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">{item.label}</span>
            </div>
          );
        })}
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div 
            key={item.id}
            className={`flex items-center gap-4 p-4 rounded-2xl border ${item.bg} backdrop-blur-md`}
          >
            <div className={`p-2.5 rounded-xl bg-background/50 ${item.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {item.count}
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {item.label}
              </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
