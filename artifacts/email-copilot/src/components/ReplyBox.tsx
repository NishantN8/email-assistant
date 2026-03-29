import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, RefreshCw, Cpu, Cloud, Loader2,
  ChevronDown, CheckCircle2, Edit3, Wand2, Target, User,
  Lightbulb, ChevronRight, Zap, Heart, BarChart2, MessageSquare,
  PenLine, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────
type Tone = "professional" | "friendly" | "brief" | "formal";
type VariantType = "strategic" | "concise" | "persuasive" | "relationship";
type ReplyMode = "picker" | "plain" | "ai";

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

// ── Reply Mode Options (shared) ───────────────────────────────────
export function ReplyModeOptions({ onSelect }: { onSelect: (mode: "plain" | "ai") => void }) {
  return (
    <div className="p-1">
      <button
        onClick={() => onSelect("plain")}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/50 transition-colors text-left group/item rounded-lg"
      >
        <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center shrink-0 group-hover/item:bg-secondary/80 transition-colors">
          <PenLine className="w-4 h-4 text-foreground/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">Reply normally</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Write a plain text reply yourself</div>
        </div>
      </button>

      <div className="mx-4 h-px bg-border/50" />

      <button
        onClick={() => onSelect("ai")}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-violet-400/5 transition-colors text-left group/item rounded-lg"
      >
        <div className="w-8 h-8 rounded-xl bg-violet-400/10 flex items-center justify-center shrink-0 group-hover/item:bg-violet-400/20 transition-colors">
          <Wand2 className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">Reply with AI</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">4 outcome-optimised variants · intent · strategy</div>
        </div>
        <Sparkles className="w-3.5 h-3.5 text-violet-400/70 shrink-0" />
      </button>
    </div>
  );
}

// ── Reply Mode Picker ─────────────────────────────────────────────
function ReplyModePicker({ onSelect }: { onSelect: (mode: "plain" | "ai") => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <button
        id="reply-box-trigger"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-all p-4 flex items-center gap-3 group text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-violet-400/10 flex items-center justify-center shrink-0 group-hover:bg-violet-400/20 transition-colors">
          <Wand2 className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground text-sm">Reply</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Reply normally or use AI to craft a strategic response
          </div>
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground group-hover:text-foreground transition-all shrink-0",
          open && "rotate-180"
        )} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <ReplyModeOptions onSelect={(mode) => { setOpen(false); onSelect(mode); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Plain Reply Box ───────────────────────────────────────────────
function PlainReplyBox({
  emailId,
  emailFrom,
  onCancel,
  onSent,
}: {
  emailId: string;
  emailFrom: string;
  onCancel: () => void;
  onSent?: () => void;
}) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [content]);

  const handleSend = async () => {
    if (!content.trim()) return;
    setIsSending(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const resp = await fetch(`${apiBase}/api/replies/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailId, content }),
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
      onSent?.();
    } catch (err) {
      toast.error("Failed to send reply", { description: (err as Error).message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-background/40">
        <div className="flex items-center gap-2">
          <PenLine className="w-3.5 h-3.5 text-foreground/70" />
          <span className="font-bold text-xs text-foreground uppercase tracking-wider">Reply</span>
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full bg-transparent border-0 focus:ring-0 resize-none text-foreground text-sm leading-relaxed font-sans p-0 min-h-[100px] placeholder:text-muted-foreground outline-none"
          placeholder="Write your reply..."
        />
      </div>

      <div className="px-4 pb-4 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={isSending || !content.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-widest shadow-md hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isSending ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
          ) : (
            <><Send className="w-3 h-3" /> Send</>
          )}
        </button>
      </div>
    </motion.div>
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
  initialMode?: ReplyMode;
  onBack?: () => void;
}

export function ReplyBox({ emailId, emailFrom, emailSubject, threadId, defaultTone = "professional", onSent, initialMode = "picker", onBack }: ReplyBoxProps) {
  const [mode, setMode] = useState<ReplyMode>(initialMode);
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

  // Back to picker (or external handler when used inline)
  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      setMode("picker");
    }
  }, [onBack]);

  // Open AI mode → auto-generate
  const handleSelectAI = useCallback(async () => {
    setMode("ai");
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

  // Auto-generate when initialized directly in AI mode
  useEffect(() => {
    if (initialMode === "ai") {
      generate(tone, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      goBack();
      onSent?.();
    } catch (err) {
      toast.error("Failed to send reply", { description: (err as Error).message });
    } finally {
      setIsSending(false);
    }
  };

  const activeReply = replies?.replies.find((r) => r.type === activeVariant);
  const currentModel = activeReply?.model || replies?.modelUsed;

  // ── Picker (collapsed trigger) ──────────────────────────────────
  if (mode === "picker") {
    return (
      <ReplyModePicker
        onSelect={(selected) => {
          if (selected === "ai") {
            handleSelectAI();
          } else {
            setMode("plain");
          }
        }}
      />
    );
  }

  // ── Plain text reply ────────────────────────────────────────────
  if (mode === "plain") {
    return (
      <PlainReplyBox
        emailId={emailId}
        emailFrom={emailFrom}
        onCancel={goBack}
        onSent={() => {
          goBack();
          onSent?.();
        }}
      />
    );
  }

  // ── AI Reply Strategist ─────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-400/20 bg-card overflow-hidden"
    >
      {/* ── Header: tone switcher + escape hatch ── */}
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-violet-400/[0.03]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span className="font-bold text-xs text-foreground uppercase tracking-wider">AI Reply</span>
          <ModelBadge model={currentModel} />
        </div>
        <div className="flex items-center gap-2">
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
          <div className="w-px h-4 bg-border/50" />
          <button
            onClick={() => setMode("plain")}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title="Switch to plain text"
          >
            <PenLine className="w-3 h-3" />
            Write myself
          </button>
          <button
            onClick={goBack}
            className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
                  onClick={goBack}
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
