import { type AiDecision } from "@workspace/api-client-react";
import {
  Sparkles, ArrowRight, ThumbsUp, XCircle, CheckCircle2,
  Cpu, Cloud, User, TrendingUp, TrendingDown, Minus,
  MessageSquare, Eye, VolumeX, Brain,
} from "lucide-react";
import { cn, getScoreColor } from "@/lib/utils";
import { useEmailActions } from "@/hooks/use-emails";
import { useSenderStats } from "@/hooks/use-sender-stats";
import { motion } from "framer-motion";

const ACTION_LABELS: Record<string, string> = {
  reply: "Reply",
  ignore: "Ignore",
  archive: "Archive",
  track: "Track",
  read_later: "Read Later",
};

function ModelBadge({ source }: { source?: string }) {
  if (!source) return null;
  const isCloud = source.startsWith("cloud") || source === "cloud";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
        isCloud
          ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
          : "bg-green-500/10 border-green-500/20 text-green-400"
      )}
    >
      {isCloud ? <Cloud className="w-2 h-2" /> : <Cpu className="w-2 h-2" />}
      {isCloud ? "Cloud" : "GPU"}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const color =
    score >= 80 ? "#f87171" : score >= 60 ? "#fb923c" : score >= 40 ? "#facc15" : "#4ade80";
  const label =
    score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 40 ? "Medium" : "Low";

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="5"
          className="text-secondary" />
        <motion.circle
          cx="32" cy="32" r={radius} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round"
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
          strokeDasharray={circ}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function SenderInsight({ replyRate, openRate, ignoreRate }: {
  replyRate: number; openRate: number; ignoreRate: number;
}) {
  if (replyRate >= 0.5) {
    return (
      <p className="text-[11px] text-green-400 flex items-center gap-1">
        <TrendingUp className="w-3 h-3 shrink-0" />
        You usually reply to this sender
      </p>
    );
  }
  if (ignoreRate >= 0.5) {
    return (
      <p className="text-[11px] text-red-400 flex items-center gap-1">
        <VolumeX className="w-3 h-3 shrink-0" />
        You often ignore similar emails
      </p>
    );
  }
  if (openRate >= 0.5) {
    return (
      <p className="text-[11px] text-yellow-400 flex items-center gap-1">
        <Eye className="w-3 h-3 shrink-0" />
        You open but rarely reply
      </p>
    );
  }
  return (
    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
      <Minus className="w-3 h-3 shrink-0" />
      New sender — no history yet
    </p>
  );
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cn("h-full rounded-full", color)}
      />
    </div>
  );
}

function SenderTrustPanel({ emailId }: { emailId: string }) {
  const { data: sender, isLoading } = useSenderStats(emailId);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-3 border-t border-border/40">
        <div className="h-3 w-20 bg-secondary animate-pulse rounded" />
        <div className="h-2 w-full bg-secondary animate-pulse rounded" />
        <div className="h-2 w-3/4 bg-secondary animate-pulse rounded" />
      </div>
    );
  }

  if (!sender) return null;

  const trustPct = Math.round(sender.importanceScore * 100);
  const trustColor =
    trustPct >= 65 ? "text-green-400" : trustPct >= 35 ? "text-yellow-400" : "text-red-400";
  const trustLabel =
    trustPct >= 65 ? "High Trust" : trustPct >= 35 ? "Medium Trust" : "Low Trust";

  const initials = sender.displayName
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  return (
    <div className="pt-3 border-t border-border/40 space-y-3">
      {/* Sender header */}
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border",
          trustPct >= 65
            ? "bg-green-400/10 border-green-400/20 text-green-400"
            : trustPct >= 35
            ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
            : "bg-red-400/10 border-red-400/20 text-red-400"
        )}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground truncate">{sender.displayName}</p>
          <p className={cn("text-[9px] font-bold uppercase tracking-wider", trustColor)}>{trustLabel}</p>
        </div>
        <span className={cn("text-[13px] font-bold tabular-nums", trustColor)}>{trustPct}</span>
      </div>

      {/* AI insight */}
      <SenderInsight
        replyRate={sender.replyRate}
        openRate={sender.openRate}
        ignoreRate={sender.ignoreRate}
      />

      {/* Rate bars */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-2.5 h-2.5 text-green-400 shrink-0" />
          <span className="text-[9px] text-muted-foreground w-10">Reply</span>
          <MiniBar value={sender.replyRate} color="bg-green-400" />
          <span className="text-[9px] font-mono text-muted-foreground w-6 text-right">
            {Math.round(sender.replyRate * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Eye className="w-2.5 h-2.5 text-blue-400 shrink-0" />
          <span className="text-[9px] text-muted-foreground w-10">Open</span>
          <MiniBar value={sender.openRate} color="bg-blue-400" />
          <span className="text-[9px] font-mono text-muted-foreground w-6 text-right">
            {Math.round(sender.openRate * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <VolumeX className="w-2.5 h-2.5 text-red-400 shrink-0" />
          <span className="text-[9px] text-muted-foreground w-10">Ignore</span>
          <MiniBar value={sender.ignoreRate} color="bg-red-400" />
          <span className="text-[9px] font-mono text-muted-foreground w-6 text-right">
            {Math.round(sender.ignoreRate * 100)}%
          </span>
        </div>
      </div>

      {sender.totalEmails > 0 && (
        <p className="text-[9px] text-muted-foreground">
          Based on {sender.totalEmails} email{sender.totalEmails !== 1 ? "s" : ""} tracked
        </p>
      )}
    </div>
  );
}

export function AiDecisionCard({
  decision,
  emailId,
  compact = false,
}: {
  decision: AiDecision;
  emailId: string;
  compact?: boolean;
}) {
  const { logAction } = useEmailActions();

  const handleOverride = (override: "reply" | "ignore" | "archive") => {
    logAction.mutate({ data: { emailId, action: "override_decision", decisionOverride: override } });
  };

  // ── Compact right-panel version ──
  if (compact) {
    return (
      <div className="space-y-4 p-4">
        {/* Score + urgency */}
        <div className="flex items-center gap-3">
          <ScoreRing score={decision.priorityScore} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                getScoreColor(decision.priorityScore)
              )}>
                {decision.urgency}
              </span>
              <ModelBadge source={decision.modelSource} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Confidence</span>
              <span className="text-[10px] font-bold">{Math.round(decision.confidence * 100)}%</span>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${decision.confidence * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-primary rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Recommended action */}
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
            AI Recommendation
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs uppercase tracking-wide">
            <Sparkles className="w-3 h-3 mr-1.5" />
            {ACTION_LABELS[decision.recommendedAction] || decision.recommendedAction}
          </span>
        </div>

        {/* Why this email */}
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            Why this email?
          </span>
          <p className="text-xs text-foreground leading-relaxed">{decision.reason}</p>
        </div>

        {/* Summary */}
        {decision.summary && (
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Summary</span>
            <p className="text-xs text-muted-foreground leading-relaxed">{decision.summary}</p>
          </div>
        )}

        {/* Key points */}
        {decision.keyPoints && decision.keyPoints.length > 0 && (
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Key Points</span>
            <ul className="space-y-1.5">
              {decision.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                  <CheckCircle2 className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sender Trust */}
        <SenderTrustPanel emailId={emailId} />

        {/* Override actions */}
        <div className="border-t border-border/50 pt-3 space-y-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">Override AI</span>
          <button
            onClick={() => handleOverride("reply")}
            className="w-full px-3 py-1.5 rounded-lg bg-secondary hover:bg-foreground hover:text-background text-foreground font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <ThumbsUp className="w-3 h-3" /> Force Reply
          </button>
          <button
            onClick={() => handleOverride("archive")}
            className="w-full px-3 py-1.5 rounded-lg bg-secondary hover:bg-red-500/20 hover:text-red-400 text-foreground font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <XCircle className="w-3 h-3" /> Force Archive
          </button>
        </div>
      </div>
    );
  }

  // ── Full (email detail page) version ──
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/[0.05] to-transparent overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-primary/10 flex items-center justify-between bg-primary/[0.02]">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-primary">AI Decision Analysis</h2>
          <ModelBadge source={decision.modelSource} />
        </div>
        <div className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest", getScoreColor(decision.priorityScore))}>
          Score: {decision.priorityScore}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="col-span-2 space-y-6">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Recommended Action</div>
              <div className="flex items-center gap-3">
                <span className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm shadow-lg shadow-primary/20">
                  {decision.recommendedAction.replace("_", " ")}
                </span>
                <span className="text-sm font-medium text-foreground">
                  <ArrowRight className="w-4 h-4 inline mr-1 opacity-50" />
                  {decision.reason}
                </span>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Summary</div>
              <p className="text-foreground leading-relaxed">
                {decision.summary || "No summary generated for this email."}
              </p>
            </div>

            {decision.keyPoints && decision.keyPoints.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Key Extraction</div>
                <ul className="space-y-2">
                  {decision.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="col-span-1 border-t md:border-t-0 md:border-l border-border/50 pt-6 md:pt-0 md:pl-8 space-y-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-muted-foreground">AI Confidence</span>
                <span className="text-sm font-bold font-mono">{(decision.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${decision.confidence * 100}%` }}
                  transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                  className="h-full bg-primary"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Sender Intelligence</div>
              <SenderTrustPanel emailId={emailId} />
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Override AI</div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleOverride("reply")}
                  className="w-full px-4 py-2 rounded-xl bg-secondary hover:bg-foreground hover:text-background text-foreground font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <ThumbsUp className="w-4 h-4" /> Force Reply
                </button>
                <button
                  onClick={() => handleOverride("archive")}
                  className="w-full px-4 py-2 rounded-xl bg-secondary hover:bg-red-500/20 hover:text-red-400 text-foreground font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> Force Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
