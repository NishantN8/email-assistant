import { type AiDecision } from "@workspace/api-client-react";
import { Sparkles, ArrowRight, ThumbsUp, XCircle, CheckCircle2 } from "lucide-react";
import { cn, getScoreColor } from "@/lib/utils";
import { useEmailActions } from "@/hooks/use-emails";
import { motion } from "framer-motion";

export function AiDecisionCard({ decision, emailId }: { decision: AiDecision; emailId: string }) {
  const { logAction } = useEmailActions();

  const handleOverride = (override: "reply" | "ignore" | "archive") => {
    logAction.mutate({ 
      data: { 
        emailId, 
        action: "override_decision",
        decisionOverride: override 
      } 
    });
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/[0.05] to-transparent overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-primary/10 flex items-center justify-between bg-primary/[0.02]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-primary">AI Decision Analysis</h2>
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
                  {decision.recommendedAction.replace('_', ' ')}
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
