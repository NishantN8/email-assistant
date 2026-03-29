import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, RefreshCw, Cpu, Cloud, Loader2,
  ChevronDown, CheckCircle2, Edit3, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────
type Tone = "professional" | "friendly" | "brief" | "formal";
type VariantType = "short" | "detailed" | "friendly";

interface ReplyVariant {
  type: VariantType;
  content: string;
  model: string;
  tone: Tone;
}

interface GeneratedReplies {
  replies: ReplyVariant[];
  confidence: number;
  modelUsed: string;
  replyId?: string;
}

const TONES: { value: Tone; label: string; emoji: string }[] = [
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "friendly", label: "Friendly", emoji: "😊" },
  { value: "brief", label: "Brief", emoji: "⚡" },
  { value: "formal", label: "Formal", emoji: "🎩" },
];

const VARIANT_LABELS: Record<VariantType, string> = {
  short: "Short",
  detailed: "Detailed",
  friendly: "Friendly",
};

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
  const [activeVariant, setActiveVariant] = useState<VariantType>("detailed");
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
      // Patch the active variant with streamed content
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

  // Batch generation (all 3 variants at once)
  const generate = useCallback(async (selectedTone: Tone, forceRefresh: boolean) => {
    if (isGenerating) return;

    // Stop any active stream
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

      const data: GeneratedReplies & { replyId?: string } = await resp.json();
      setReplies(data);
      setReplyId(data.replyId);

      // Set active variant content in textarea
      const activeContent = data.replies.find((r) => r.type === activeVariant)?.content
        || data.replies[0]?.content
        || "";
      setEditedContent(activeContent);
    } catch (err) {
      toast.error("Failed to generate reply — try again");
    } finally {
      setIsGenerating(false);
    }
  }, [emailId, isGenerating, activeVariant]);

  // Switch variant
  const handleVariantSwitch = (variant: VariantType) => {
    setActiveVariant(variant);
    const content = replies?.replies.find((r) => r.type === variant)?.content || "";
    setEditedContent(content);
    setHasEdited(false);
  };

  // Switch tone → regenerate
  const handleToneChange = async (newTone: Tone) => {
    setTone(newTone);
    await generate(newTone, true);
  };

  // Send reply
  const handleSend = async () => {
    if (!editedContent.trim()) return;
    setIsSending(true);

    try {
      // Save feedback if user edited
      if (hasEdited) {
        const apiBase = import.meta.env.VITE_API_URL || "";
        await fetch(`${apiBase}/api/replies/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ emailId, editedContent, tone }),
        }).catch(() => {}); // Non-blocking
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

  if (!isOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        <button
          onClick={handleOpen}
          className="w-full rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-all p-5 flex items-center gap-4 group text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <Wand2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground text-sm">AI Reply Assistant</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Generate a smart reply to this email using local GPU or cloud AI
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
      className="mt-8 rounded-2xl border border-primary/20 bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between bg-primary/[0.03]">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">AI Reply</span>
          {currentModel && <ModelBadge model={currentModel} />}
          {replies && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {Math.round((replies.confidence || 0.88) * 100)}% confidence
            </span>
          )}
        </div>

        {/* Tone selector */}
        <div className="flex items-center gap-1">
          {TONES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleToneChange(t.value)}
              disabled={isGenerating}
              title={t.label}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                tone === t.value
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <span className="hidden sm:inline">{t.emoji} {t.label}</span>
              <span className="sm:hidden">{t.emoji}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Variant tabs */}
      {replies && (
        <div className="flex border-b border-border/50 bg-background/30">
          {(["short", "detailed", "friendly"] as VariantType[]).map((v) => (
            <button
              key={v}
              onClick={() => handleVariantSwitch(v)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                activeVariant === v
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {VARIANT_LABELS[v]}
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="p-5">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <Cpu className="w-4 h-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-sm text-muted-foreground">Generating 3 reply variants...</p>
          </div>
        ) : (
          <>
            {/* Editable textarea */}
            <div className="relative">
              {isStreaming ? (
                <div className="w-full min-h-[100px] text-sm text-foreground leading-relaxed font-sans p-0">
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
                  className="w-full bg-transparent border-0 focus:ring-0 resize-none text-foreground text-sm leading-relaxed font-sans p-0 min-h-[100px] placeholder:text-muted-foreground outline-none"
                  placeholder="Reply will appear here..."
                />
              )}
              {hasEdited && !isStreaming && (
                <div className="absolute top-0 right-0">
                  <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    <Edit3 className="w-2.5 h-2.5" />
                    Edited
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generate(tone, true)}
                  disabled={isGenerating || isStreaming}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                {activeVariant === "detailed" && !isStreaming && (
                  <button
                    onClick={() => streamGenerate(tone, activeVariant)}
                    disabled={isGenerating || isStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Stream
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || isStreaming || !editedContent.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Reply
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Learning indicator */}
      {hasEdited && (
        <div className="px-5 py-2.5 border-t border-border/30 bg-primary/[0.02] flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            Your edits will improve future AI replies to match your writing style
          </p>
        </div>
      )}
    </motion.div>
  );
}
