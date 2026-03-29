import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2, Archive, Shield, X, CheckSquare, Square,
  Loader2, Sparkles, Mail, Link2, AlertTriangle,
  ChevronDown, ChevronRight, BrushCleaning, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string) => `${BASE}/api/${path}`;

type CleanupCategory = "spam" | "newsletter" | "promotion" | "irrelevant";
type CleanupAction = "delete" | "archive" | "mark_spam";

interface CleanupEmail {
  emailId: string;
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  receivedAt: string;
  heuristicScore: number;
  finalScore: number;
  category: CleanupCategory;
  reasons: string[];
  unsubscribeLink: string | null;
}

interface CleanupData {
  emails: CleanupEmail[];
  summary: { spam: number; newsletter: number; promotion: number; irrelevant: number; total: number };
}

const CATEGORY_CONFIG: Record<CleanupCategory, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
}> = {
  spam: {
    label: "Likely Spam",
    color: "text-red-400",
    bg: "bg-red-400/8",
    border: "border-red-400/20",
    icon: Shield,
  },
  newsletter: {
    label: "Newsletters",
    color: "text-blue-400",
    bg: "bg-blue-400/8",
    border: "border-blue-400/20",
    icon: Mail,
  },
  promotion: {
    label: "Promotions",
    color: "text-yellow-400",
    bg: "bg-yellow-400/8",
    border: "border-yellow-400/20",
    icon: Sparkles,
  },
  irrelevant: {
    label: "Low Priority",
    color: "text-muted-foreground",
    bg: "bg-secondary/40",
    border: "border-border/30",
    icon: Archive,
  },
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-red-400 bg-red-400/10" : score >= 60 ? "text-yellow-400 bg-yellow-400/10" : "text-muted-foreground bg-secondary";
  return (
    <span className={cn("text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded font-mono", color)}>
      {score}
    </span>
  );
}

function EmailRow({
  email,
  checked,
  onToggle,
}: {
  email: CleanupEmail;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "border-b border-border/20 last:border-0 transition-colors",
      checked ? "bg-violet-400/5" : "hover:bg-secondary/20"
    )}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => onToggle(email.emailId)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {checked
            ? <CheckSquare className="w-4 h-4 text-violet-400" />
            : <Square className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground truncate">{email.subject || "(no subject)"}</span>
            <ScoreBadge score={email.finalScore} />
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{email.from} — {email.snippet}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {email.unsubscribeLink && (
            <a
              href={email.unsubscribeLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 border border-blue-400/20 rounded px-1.5 py-0.5 transition-colors"
            >
              <Link2 className="w-2.5 h-2.5" /> Unsub
            </a>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-0.5 transition-colors"
          >
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-9 pb-2.5 space-y-1">
          {email.reasons.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <AlertTriangle className="w-3 h-3 shrink-0 opacity-50" />
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  category,
  emails,
  checkedIds,
  onToggle,
  onToggleAll,
}: {
  category: CleanupCategory;
  emails: CleanupEmail[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const cfg = CATEGORY_CONFIG[category];
  const Icon = cfg.icon;
  const ids = emails.map((e) => e.emailId);
  const allChecked = ids.every((id) => checkedIds.has(id));
  const someChecked = ids.some((id) => checkedIds.has(id));

  return (
    <div className={cn("rounded-xl border overflow-hidden", cfg.border)}>
      <div className={cn("flex items-center gap-2 px-3 py-2.5", cfg.bg)}>
        <button
          onClick={() => onToggleAll(ids, !allChecked)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {allChecked
            ? <CheckSquare className="w-4 h-4 text-violet-400" />
            : someChecked
              ? <CheckSquare className="w-4 h-4 text-violet-400/50" />
              : <Square className="w-4 h-4" />}
        </button>
        <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
        <span className={cn("text-xs font-bold", cfg.color)}>{cfg.label}</span>
        <span className="text-[10px] text-muted-foreground bg-black/20 px-1.5 py-0.5 rounded-full ml-0.5">
          {emails.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !open && "-rotate-90")} />
        </button>
      </div>

      {open && (
        <div className="divide-y divide-border/10">
          {emails.map((e) => (
            <EmailRow
              key={e.emailId}
              email={e}
              checked={checkedIds.has(e.emailId)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CleanupPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<CleanupAction | null>(null);
  const [done, setDone] = useState<{ processed: number; action: CleanupAction } | null>(null);

  const { data, isLoading, refetch } = useQuery<CleanupData>({
    queryKey: ["cleanup-candidates"],
    queryFn: async () => {
      const res = await fetch(api("cleanup/candidates"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cleanup candidates");
      return res.json();
    },
  });

  const executeMutation = useMutation({
    mutationFn: async ({ emailIds, action }: { emailIds: string[]; action: CleanupAction }) => {
      const res = await fetch(api("cleanup/execute"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailIds, action }),
      });
      if (!res.ok) throw new Error("Cleanup failed");
      return res.json();
    },
    onSuccess: (result, variables) => {
      setDone({ processed: result.processed, action: variables.action });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cleanup-candidates"] });
    },
  });

  const grouped = useMemo(() => {
    const emails = data?.emails ?? [];
    const out: Partial<Record<CleanupCategory, CleanupEmail[]>> = {};
    for (const e of emails) {
      (out[e.category] ??= []).push(e);
    }
    return out;
  }, [data]);

  const handleToggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAll = (ids: string[], checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = (data?.emails ?? []).map((e) => e.emailId);
    if (checkedIds.size === all.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(all));
    }
  };

  const handleExecute = (action: CleanupAction) => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    setPendingAction(action);
    executeMutation.mutate({ emailIds: ids, action });
  };

  const total = data?.emails.length ?? 0;
  const checkedCount = checkedIds.size;
  const isBusy = executeMutation.isPending;

  const ACTION_LABELS: Record<CleanupAction, { label: string; icon: React.ElementType; color: string }> = {
    delete: { label: "Move to Trash", icon: Trash2, color: "bg-red-500 hover:bg-red-400 text-white shadow-red-500/20" },
    archive: { label: "Archive", icon: Archive, color: "bg-secondary hover:bg-secondary/80 text-foreground" },
    mark_spam: { label: "Mark as Spam", icon: Shield, color: "bg-orange-500 hover:bg-orange-400 text-white shadow-orange-500/20" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border/50 bg-background shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/50 flex items-center gap-3 bg-card/50 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <BrushCleaning className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Smart Cleanup</h2>
            <p className="text-[10px] text-muted-foreground">AI-identified emails safe to remove</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!isLoading && (
              <button
                onClick={() => refetch()}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {data && !done && (
          <div className="px-5 py-3 border-b border-border/30 bg-secondary/20 flex items-center gap-4 shrink-0 flex-wrap">
            {(["spam", "newsletter", "promotion", "irrelevant"] as CleanupCategory[]).map((cat) => {
              const count = data.summary[cat];
              if (!count) return null;
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg.icon;
              return (
                <div key={cat} className="flex items-center gap-1.5">
                  <Icon className={cn("w-3 h-3", cfg.color)} />
                  <span className={cn("text-[10px] font-bold", cfg.color)}>{count}</span>
                  <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                </div>
              );
            })}
            <div className="ml-auto text-[10px] text-muted-foreground">
              {total} total found
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-violet-400/20 border-t-violet-400 animate-spin" />
              <p className="text-xs text-muted-foreground">Analysing inbox for cleanup…</p>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-400/15 border border-green-400/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {done.processed} email{done.processed !== 1 ? "s" : ""} cleaned up
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                Action: {done.action.replace("_", " ")}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setDone(null); setCheckedIds(new Set()); refetch(); }}
                  className="px-4 py-2 rounded-xl bg-secondary text-xs font-bold text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Clean More
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-violet-500 text-xs font-bold text-white hover:bg-violet-400 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-400/15 border border-green-400/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm font-bold text-foreground">Your inbox looks clean!</p>
              <p className="text-xs text-muted-foreground">No cleanup candidates found right now.</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {(["spam", "newsletter", "promotion", "irrelevant"] as CleanupCategory[]).map((cat) => {
                const emails = grouped[cat];
                if (!emails?.length) return null;
                return (
                  <CategoryGroup
                    key={cat}
                    category={cat}
                    emails={emails}
                    checkedIds={checkedIds}
                    onToggle={handleToggle}
                    onToggleAll={handleToggleAll}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Action bar */}
        {!done && !isLoading && total > 0 && (
          <div className="px-5 py-3.5 border-t border-border/50 bg-card/50 flex items-center gap-3 shrink-0 flex-wrap">
            <button
              onClick={handleSelectAll}
              className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              {checkedCount === total ? "Deselect all" : `Select all (${total})`}
            </button>

            {checkedCount > 0 && (
              <span className="text-[10px] text-violet-400 font-bold">
                {checkedCount} selected
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {(["archive", "mark_spam", "delete"] as CleanupAction[]).map((action) => {
                const cfg = ACTION_LABELS[action];
                const Icon = cfg.icon;
                return (
                  <button
                    key={action}
                    onClick={() => handleExecute(action)}
                    disabled={checkedCount === 0 || isBusy}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 shadow-md",
                      cfg.color
                    )}
                  >
                    {isBusy && pendingAction === action
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Icon className="w-3 h-3" />}
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
