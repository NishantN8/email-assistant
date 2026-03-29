import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, RefreshCw, Cpu, Cloud, Loader2,
  ChevronDown, CheckCircle2, Edit3, Wand2, Target, User,
  Lightbulb, ChevronRight, Zap, Heart, BarChart2, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────
type Tone = "professional" | "friendly" | "brief" | "formal";
type VariantType = "strategic" | "concise" | "persuasive" | "relationship";

interface ReplyVariant {
  type: VariantType;
  content: string;
  why_it_works: string;
  model: string;
  tone: Tone;
}

interface GeneratedReplies {
  intent: string;
  role: string;
  strategy: string;
  replies: ReplyVariant[];
  confidence: number;
  modelUsed: string;
  replyId?: string;
}

const VARIANT_CONFIG: Record<VariantType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  desc: string;
}> = {
  strategic:     { label: "Strategic",     icon: Target,       color: "text-violet-400",  desc: "Maximizes outcome" },
  concise:       { label: "Concise",       icon: Zap,          color: "text-yellow-400",  desc: "Fast & direct" },
  persuasive:    { label: "Persuasive",    icon: BarChart2,    color: "text-blue-400",    desc: "Influence-focused" },
  relationship:  { label: "Relationship",  icon: Heart,        color: "text-rose-400",    desc: "Builds rapport" },
};

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Pro" },
  { value: "friendly",     label: "Friendly" },
  { value: "brief",        label: "Brief" },
  { value: "formal",       label: "Formal" },
];

function ModelBadge({ model }: { model?: string }) {
  if (!model) return null;
  const isLocal = model.startsWith("local:");
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
      isLocal
        ? "bg-green-500/10 border-green-500/20 text-green-400"
        : "bg-blue-500/10 border-blue-500/20 text-blue-400"
    )}>
      {isLocal ? <Cpu className="w-2.5 h-2.5" /> : <Cloud className="w-2.5 h-2.5" />}
      {isLocal ? "GPU" : "Cloud"}
    </span>
  );
}

function TypingText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <span>
      {text}
      {isStreaming && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.6, repeat: Infinity }}
          className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
        />
      )}
    </span>
  );
}

// ── Strategy Brief ────────────────────────────────────────────────
function StrategyBrief({
  intent, role, strategy, confidence, modelUsed,
}: {
  intent: string;
  role: string;
  strategy: string;
  confidence: number;
  modelUsed: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/40 bg-background/40">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Strategy Brief
          </span>
          <ModelBadge model={modelUsed} />
          <span className="text-[10px] font-mono text-muted-foreground">
            {Math.round(confidence * 100)}% confidence
          </span>
        </div>
        <ChevronRight className={cn(
          "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
          expanded && "rotate-90"
        )} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2.5">
              {intent && (
                <div className="flex items-start gap-2">
                  <Target className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground block">Intent</span>
                    <p className="text-[11px] text-foreground/80 leading-snug">{intent}</p>
                  </div>
                </div>
              )}
              {role && (
                <div className="flex items-start gap-2">
                  <User className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground block">Your Role</span>
                    <p className="text-[11px] text-foreground/80 leading-snug">{role}</p>
                  </div>
                </div>
              )}
              {strategy && (
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground block">Approach</span>
                    <p className="text-[11px] text-foreground/80 leading-snug">{strategy}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Why It Works reveal ───────────────────────────────────────────
function WhyItWorks({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setShow((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Lightbulb className="w-3 h-3" />
        {show ? "Hide" : "Why this works"}
      </button>
      <AnimatePresence>
        {show && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden text-[11px] text-muted-foreground mt-1 leading-relaxed pl-4 border-l-2 border-violet-400/40 italic"
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main ReplyBox Component ───────────────────────────────────────
interface ReplyBoxProps {
  emailId: string;
  emailFrom: string;
  emailSubject: string;
  threadId?: string | null;
  defaultTone?: Tone;
  onSent?: () => void;
}

export function ReplyBox({ emailId, emailFrom, emailSubject, threadId, defaultTone = "professional", onSent }: ReplyBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [replies, setReplies] = useState<GeneratedReplies | null>(null);
  const [activeVariant, setActiveVariant] = useState<VariantType>("strategic");
  const [editedContent, setEditedContent] = useState("");
  const [tone, setTone] = useState<Tone>(defaultTone);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [replyId, setReplyId] = useState<string | undefined>();
  const [hasEdited, setHasEdited] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [editedContent]);

  // Open → auto-generate
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    if (!replies) {
      await generate(tone, false);
    }
  }, [replies, tone]);

  // SSE streaming generation
  const streamGenerate = useCallback(async (selectedTone: Tone, variant: VariantType) => {
    setIsStreaming(true);
    setStreamingText("");

    const apiBase = import.meta.env.VITE_API_URL || "";
    const url = `${apiBase}/api/replies/stream?emailId=${emailId}&tone=${selectedTone}&variant=${variant}`;

    let accumulated = "";
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("token", (e) => {
      const { chunk } = JSON.parse(e.data);
      accumulated += chunk;
      setStreamingText(accumulated);
    });

    es.addEventListener("done", (e) => {
      const { model } = JSON.parse(e.data);
      setIsStreaming(false);
      setEditedContent(accumulated);
      setReplies((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          replies: prev.replies.map((r) =>
            r.type === variant ? { ...r, content: accumulated, model } : r
          ),
        };
      });
      es.close();
    });

    es.addEventListener("error", () => {
      setIsStreaming(false);
      es.close();
    });
  }, [emailId]);

  // Batch generation (all 4 variants via single AI call)
  const generate = useCallback(async (selectedTone: Tone, forceRefresh: boolean) => {
    if (isGenerating) return;

    eventSourceRef.current?.close();
    setIsStreaming(false);
    setStreamingText("");
    setIsGenerating(true);
    setHasEdited(false);

    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const resp = await fetch(`${apiBase}/api/replies/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailId, tone: selectedTone, forceRefresh }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data: GeneratedReplies = await resp.json();
      setReplies(data);
      setReplyId(data.replyId);

      const activeContent = data.replies.find((r) => r.type === activeVariant)?.content
        || data.replies[0]?.content
        || "";
      setEditedContent(activeContent);
    } catch {
      toast.error("Failed to generate reply — try again");
    } finally {
      setIsGenerating(false);
    }
  }, [emailId, isGenerating, activeVariant]);

  const handleVariantSwitch = (variant: VariantType) => {
    setActiveVariant(variant);
    const content = replies?.replies.find((r) => r.type === variant)?.content || "";
    setEditedContent(content);
    setHasEdited(false);
  };

  const handleToneChange = async (newTone: Tone) => {
    setTone(newTone);
    await generate(newTone, true);
  };

  const handleSend = async () => {
    if (!editedContent.trim()) return;
    setIsSending(true);

    try {
      if (hasEdited) {
        const apiBase = import.meta.env.VITE_API_URL || "";
        await fetch(`${apiBase}/api/replies/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ emailId, editedContent, tone }),
        }).catch(() => {});
      }

      const apiBase = import.meta.env.VITE_API_URL || "";
      const resp = await fetch(`${apiBase}/api/replies/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailId, content: editedContent, replyId }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data.error === "token_expired" || data.error === "no_gmail_access") {
          toast.error("Gmail permission needed", {
            description: "Re-connect Gmail from the sidebar to enable sending",
          });
        } else {
          throw new Error(data.message || "Send failed");
        }
        return;
      }

      toast.success("Reply sent!", { description: `To: ${emailFrom}` });
      setIsOpen(false);
      onSent?.();
    } catch (err) {
      toast.error("Failed to send reply", { description: (err as Error).message });
    } finally {
      setIsSending(false);
    }
  };

  const activeReply = replies?.replies.find((r) => r.type === activeVariant);
  const currentModel = activeReply?.model || replies?.modelUsed;

  // ── Collapsed trigger ─────────────────────────────────────────
  if (!isOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={handleOpen}
          className="w-full rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-all p-4 flex items-center gap-3 group text-left"
        >
          <div className="w-8 h-8 rounded-xl bg-violet-400/10 flex items-center justify-center shrink-0 group-hover:bg-violet-400/20 transition-colors">
            <Wand2 className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground text-sm">AI Reply Strategist</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              4 outcome-optimised variants · intent · strategy · why it works
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-400/20 bg-card overflow-hidden"
    >
      {/* ── Header: tone switcher ── */}
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-violet-400/[0.03]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
          <span className="font-bold text-xs text-foreground uppercase tracking-wider">AI Reply Strategist</span>
        </div>
        <div className="flex items-center gap-1">
          {TONES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleToneChange(t.value)}
              disabled={isGenerating}
              className={cn(
                "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all",
                tone === t.value
                  ? "bg-violet-400/20 text-violet-300 border border-violet-400/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Strategy Brief (collapsed by default) ── */}
      {replies && (
        <StrategyBrief
          intent={replies.intent}
          role={replies.role}
          strategy={replies.strategy}
          confidence={replies.confidence}
          modelUsed={replies.modelUsed}
        />
      )}

      {/* ── Variant tabs ── */}
      {replies && (
        <div className="flex border-b border-border/50 bg-background/20">
          {(Object.entries(VARIANT_CONFIG) as [VariantType, typeof VARIANT_CONFIG[VariantType]][]).map(([type, cfg]) => {
            const Icon = cfg.icon;
            const isActive = activeVariant === type;
            return (
              <button
                key={type}
                onClick={() => handleVariantSwitch(type)}
                className={cn(
                  "flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors border-b-2 text-center",
                  isActive
                    ? `border-current ${cfg.color} bg-current/[0.04]`
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                )}
              >
                <Icon className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-wider">{cfg.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Content area ── */}
      <div className="p-4">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full border-2 border-violet-400/20 border-t-violet-400 animate-spin" />
              <Sparkles className="w-3.5 h-3.5 text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-xs font-medium text-foreground">Analysing & generating 4 variants</p>
              <p className="text-[10px] text-muted-foreground">Intent → Role → Strategy → Replies</p>
            </div>
          </div>
        ) : (
          <>
            {/* Editable textarea */}
            <div className="relative">
              {isStreaming ? (
                <div className="w-full min-h-[90px] text-sm text-foreground leading-relaxed font-sans">
                  <TypingText text={streamingText} isStreaming={isStreaming} />
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={editedContent}
                  onChange={(e) => {
                    setEditedContent(e.target.value);
                    setHasEdited(true);
                  }}
                  className="w-full bg-transparent border-0 focus:ring-0 resize-none text-foreground text-sm leading-relaxed font-sans p-0 min-h-[90px] placeholder:text-muted-foreground outline-none"
                  placeholder="Reply will appear here..."
                />
              )}
              {hasEdited && !isStreaming && (
                <div className="absolute top-0 right-0">
                  <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    <Edit3 className="w-2.5 h-2.5" /> Edited
                  </span>
                </div>
              )}
            </div>

            {/* Why it works */}
            {activeReply?.why_it_works && !isStreaming && (
              <WhyItWorks text={activeReply.why_it_works} />
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generate(tone, true)}
                  disabled={isGenerating || isStreaming}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
                {!isStreaming && replies && (
                  <button
                    onClick={() => streamGenerate(tone, activeVariant)}
                    disabled={isGenerating || isStreaming}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" /> Stream
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || isStreaming || !editedContent.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest shadow-md shadow-violet-500/20 hover:bg-violet-400 transition-colors disabled:opacity-50"
                >
                  {isSending ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="w-3 h-3" /> Send</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Learning strip */}
      {hasEdited && (
        <div className="px-4 py-2 border-t border-border/30 bg-violet-400/[0.02] flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3 text-violet-400 shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Your edits train the AI to match your writing style in future replies
          </p>
        </div>
      )}
    </motion.div>
  );
}
