import { type AiDecision } from "@workspace/api-client-react";
import { Sparkles, ArrowRight, ThumbsUp, XCircle, CheckCircle2, Cpu, Cloud } from "lucide-react";
import { cn, getScoreColor } from "@/lib/utils";
import { useEmailActions } from "@/hooks/use-emails";
import { motion } from "framer-motion";

const URGENCY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-green-400",
};

const ACTION_LABELS: Record<string, string> = {
  reply: "Reply",
  ignore: "Ignore",
  archive: "Archive",
  track: "Track",
  read_later: "Read Later",
};

function ModelBadge({ source }: { source?: string }) {
  if (!source) return null;
  const isCloud = source === "cloud";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
        isCloud
          ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
          : "bg-green-500/10 border-green-500/30 text-green-400"
      )}
      title={isCloud ? "Cloud LLM (deep reasoning)" : "Local AI (rule-based + weighted scoring)"}
    >
      {isCloud ? <Cloud className="w-2.5 h-2.5" /> : <Cpu className="w-2.5 h-2.5" />}
      {isCloud ? "Cloud AI" : "Local AI"}
    </span>
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
    logAction.mutate({
      data: {
        emailId,
        action: "override_decision",
        decisionOverride: override,
      },
    });
  };

  // ── Compact right-panel version ──
  if (compact) {
    return (
      <div className="space-y-4 p-4">
        {/* Score ring */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Priority Score</span>
            <div className={cn("text-4xl font-bold font-mono tabular-nums", getScoreColor(decision.priorityScore).split(" ")[0])}>
              {decision.priorityScore}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
              getScoreColor(decision.priorityScore)
            )}>
              {decision.urgency}
            </div>
            <ModelBadge source={decision.modelSource} />
          </div>
        </div>

        {/* Confidence bar */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Confidence</span>
            <span className="text-xs font-bold font-mono">{(decision.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${decision.confidence * 100}%` }}
              transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              className="h-full bg-primary rounded-full"
            />
          </div>
        </div>

        {/* Recommended action */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
            Recommended
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs uppercase tracking-wide">
            <Sparkles className="w-3 h-3 mr-1.5" />
            {ACTION_LABELS[decision.recommendedAction] || decision.recommendedAction}
          </span>
        </div>

        {/* Reason */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Reason</span>
          <p className="text-xs text-foreground leading-relaxed">{decision.reason}</p>
        </div>

        {/* Summary */}
        {decision.summary && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Summary</span>
            <p className="text-xs text-muted-foreground leading-relaxed">{decision.summary}</p>
          </div>
        )}

        {/* Key points */}
        {decision.keyPoints && decision.keyPoints.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Key Points</span>
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

        <div className="border-t border-border/50 pt-3 space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Override AI</span>
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
          <Sparkles className="w-5 h-5 text-primary" />
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

          <div className="col-span-1 border-t md:border-t-0 md:border-l border-border/50 pt-6 md:pt-0 md:pl-8 space-y-6">
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
                  className="w-full px-4 py-2 rounded-xl bg-secondary hover:bg-score-low hover:text-white text-foreground font-medium text-sm transition-colors flex items-center justify-center gap-2"
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
