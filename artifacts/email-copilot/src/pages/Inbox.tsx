import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useGetEmails, useGetEmail } from "@workspace/api-client-react";
import { type EmailWithDecision } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionStrip } from "@/components/ActionStrip";
import { Sidebar } from "@/components/Sidebar";
import { AiDecisionCard } from "@/components/AiDecisionCard";
import { ReplyBox, ReplyModeOptions } from "@/components/ReplyBox";
import { SmartStatsBar } from "@/components/SmartStatsBar";
import { useEmailActions } from "@/hooks/use-emails";
import { useSenderStats } from "@/hooks/use-sender-stats";
import { useKeyboardNav } from "@/hooks/use-keyboard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ArrowLeft, Reply, Archive, Trash2,
  MoreHorizontal, Forward, Keyboard, X,
  ChevronDown, ChevronRight, ChevronUp, ChevronLeft, Cpu, Cloud, Zap,
  Brain, Sparkles, Star, Users, Filter, TrendingUp, VolumeX, Eye, Minus,
  MessageSquare, Send, MailOpen, AlertOctagon,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { EmailBodyRenderer } from "@/components/EmailBodyRenderer";
import { toast } from "sonner";

// ── Keyboard shortcut legend ────────────────────
function ShortcutBadge({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-secondary border border-border rounded text-muted-foreground">{keys}</kbd>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function KeyboardHint({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-4 right-4 z-50 bg-card border border-border rounded-2xl p-4 shadow-2xl w-52"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shortcuts</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="w-3 h-3" /></button>
      </div>
      <div className="space-y-2">
        <ShortcutBadge keys="j / ↓" label="Next email" />
        <ShortcutBadge keys="k / ↑" label="Previous email" />
        <ShortcutBadge keys="r" label="Reply" />
        <ShortcutBadge keys="e" label="Archive" />
        <ShortcutBadge keys="Esc" label="Deselect" />
      </div>
    </motion.div>
  );
}

// ── AI-first center panel ────────────────────────
const ACTION_META: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  reply:     { label: "Reply",     color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/25",   icon: "↩" },
  archive:   { label: "Archive",   color: "text-slate-400",  bg: "bg-slate-400/10",  border: "border-slate-400/25",  icon: "▾" },
  ignore:    { label: "Ignore",    color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/25",    icon: "✕" },
  track:     { label: "Track",     color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/25", icon: "◎" },
  read_later:{ label: "Read Later",color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/25", icon: "⏱" },
};

function InboxMoreMenu({ isRead, onClose, onAction }: {
  isRead: boolean;
  onClose: () => void;
  onAction: (a: "mark_unread" | "trash" | "spam") => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
    >
      <button
        onClick={() => { onAction("mark_unread"); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
      >
        <MailOpen className="w-4 h-4 shrink-0" />
        {isRead ? "Mark as Unread" : "Mark as Read"}
      </button>
      <button
        onClick={() => { onAction("trash"); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-4 h-4 shrink-0" />
        Move to Trash
      </button>
      <button
        onClick={() => { onAction("spam"); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
      >
        <AlertOctagon className="w-4 h-4 shrink-0" />
        Report Spam
      </button>
    </div>
  );
}

function InboxForwardDialog({ email, onClose }: {
  email: { id: string; from: string; fromEmail: string; subject: string; body?: string; snippet: string; receivedAt: string };
  onClose: () => void;
}) {
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const originalDate = new Date(email.receivedAt).toLocaleString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const handleSend = async () => {
    if (!to.trim()) { toast.error("Please enter a recipient email address"); return; }
    if (!body.trim()) { toast.error("Please add a message before forwarding"); return; }
    setIsSending(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const quotedContent = `\n\n---------- Forwarded message ----------\nFrom: ${email.from} <${email.fromEmail}>\nDate: ${originalDate}\nSubject: ${email.subject}\n\n${email.body ? email.body.replace(/<[^>]*>/g, "") : email.snippet}`;
      const resp = await fetch(`${apiBase}/api/replies/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailId: email.id, content: body + quotedContent, to, subject: `Fwd: ${email.subject}` }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.error === "token_expired" || data.error === "no_gmail_access") {
          toast.error("Gmail permission needed", { description: "Re-connect Gmail from the sidebar to enable sending" });
        } else {
          throw new Error(data.message || "Send failed");
        }
        return;
      }
      toast.success("Email forwarded!", { description: `To: ${to}` });
      onClose();
    } catch (err) {
      toast.error("Failed to forward email", { description: (err as Error).message });
    } finally {
      setIsSending(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Forward className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm text-foreground">Forward Email</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-muted-foreground w-14 shrink-0">Subject</span>
            <span className="text-sm text-foreground truncate">Fwd: {email.subject}</span>
          </div>
          <div className="flex items-center gap-2 mb-3 border-b border-border/50 pb-3">
            <label htmlFor="fwd-to" className="text-xs font-semibold text-muted-foreground w-14 shrink-0">To</label>
            <input
              id="fwd-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a message..."
            rows={4}
            className="w-full bg-transparent border-0 outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground leading-relaxed"
          />
        </div>
        <div className="mx-5 mb-4 rounded-xl bg-secondary/40 border border-border/50 p-3 max-h-24 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Forwarded message</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
            From: {email.from} · {originalDate} · {email.subject}
          </p>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !to.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20"
          >
            {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Forward</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function EmailDetailPanel({
  emailId,
  onClose,
  onReply,
  onArchive,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  emailId: string;
  onClose: () => void;
  onReply: () => void;
  onArchive: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}) {
  const { data, isLoading } = useGetEmail(emailId, { query: { enabled: !!emailId } });
  const { logAction } = useEmailActions();
  const markedRead = useRef(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    markedRead.current = false;
    setBodyExpanded(false);
    setReplyOpen(false);
  }, [emailId]);

  useEffect(() => {
    if (data?.email && !data.email.isRead && !markedRead.current) {
      markedRead.current = true;
      logAction.mutate({ data: { emailId: data.email.id, action: "open" } });
    }
  }, [data, emailId, logAction]);

  const handleReplyClick = useCallback(() => {
    setReplyOpen((v) => !v);
    onReply();
  }, [onReply]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="shrink-0 h-12 border-b border-border/50 bg-background/80 animate-pulse" />
        <div className="flex-1 p-6 space-y-4">
          <div className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />
          <div className="h-16 rounded-xl bg-secondary/40 animate-pulse" />
          <div className="h-40 rounded-xl bg-secondary/30 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { email, decision } = data;
  const actionMeta = decision ? (ACTION_META[decision.recommendedAction] ?? ACTION_META.archive) : null;
  const isReply = decision?.recommendedAction === "reply";
  const isCloud = decision?.modelSource?.startsWith("cloud");
  const confidencePct = decision ? Math.round(decision.confidence * 100) : 0;

  const urgencyColor =
    (decision?.priorityScore ?? 0) >= 80 ? "text-red-400" :
    (decision?.priorityScore ?? 0) >= 60 ? "text-orange-400" :
    (decision?.priorityScore ?? 0) >= 40 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous email (k)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next email (j)"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleReplyClick}
            className={cn(
              "p-2 rounded-lg hover:bg-secondary transition-colors",
              replyOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            )}
            title="Reply (r)"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button onClick={onArchive} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Archive (e)">
            <Archive className="w-3.5 h-3.5" />
          </button>
          {data && (
            <button
              onClick={() => setShowForward(true)}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Forward"
            >
              <Forward className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              className={cn(
                "p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors",
                showMoreMenu && "bg-secondary text-foreground"
              )}
              title="More options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showMoreMenu && data && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.1 }}
                >
                  <InboxMoreMenu
                    isRead={data.email.isRead}
                    onClose={() => setShowMoreMenu(false)}
                    onAction={(action) => {
                      logAction.mutate({ data: { emailId, action } });
                      if (action === "mark_unread") toast.success("Marked as unread");
                      else if (action === "trash") { toast.success("Moved to Trash"); onArchive(); }
                      else if (action === "spam") { toast.success("Reported as Spam"); onArchive(); }
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── 1. AI DECISION BANNER (primary) ── */}
        {decision && actionMeta && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "mx-4 mt-4 rounded-2xl border p-4 space-y-3",
              actionMeta.bg, actionMeta.border
            )}
          >
            {/* Action header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={cn("text-2xl font-black tracking-tight uppercase", actionMeta.color)}>
                  {actionMeta.icon} {actionMeta.label}
                </span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border",
                  urgencyColor, "border-current/20 bg-current/5"
                )}>
                  {decision.urgency}
                </span>
              </div>
              {/* Model + confidence */}
              <div className="flex items-center gap-2 text-right">
                <span className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border",
                  isCloud ? "text-blue-400 border-blue-400/20 bg-blue-400/10" : "text-green-400 border-green-400/20 bg-green-400/10"
                )}>
                  {isCloud ? <Cloud className="w-2.5 h-2.5" /> : <Cpu className="w-2.5 h-2.5" />}
                  {isCloud ? "Cloud" : "GPU"}
                </span>
                <span className={cn("text-sm font-bold tabular-nums", actionMeta.color)}>{confidencePct}%</span>
              </div>
            </div>

            {/* WHY — 1-2 lines only */}
            <p className="text-[13px] text-foreground/80 leading-snug font-medium">
              {decision.reason}
            </p>

            {/* Confidence bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-black/20 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${confidencePct}%` }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
                  className={cn("h-full rounded-full", actionMeta.color.replace("text-", "bg-"))}
                />
              </div>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">confidence</span>
            </div>

            {/* Primary action button */}
            <div className="flex gap-2 pt-1">
              {isReply ? (
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all border",
                    actionMeta.color, actionMeta.border, actionMeta.bg,
                    "hover:brightness-110 active:scale-[0.98]"
                  )}
                >
                  ↩ Compose Reply
                </button>
              ) : (
                <button
                  onClick={onArchive}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all border",
                    actionMeta.color, actionMeta.border, actionMeta.bg,
                    "hover:brightness-110 active:scale-[0.98]"
                  )}
                >
                  {actionMeta.icon} Execute: {actionMeta.label}
                </button>
              )}
              <button
                onClick={onArchive}
                className="px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/20 border border-border/30 transition-colors"
              >
                Skip
              </button>
            </div>
          </motion.div>
        )}

        {/* ── 2. SENDER + SUBJECT (secondary context) ── */}
        <div className="mx-4 mt-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-foreground text-xs shrink-0 border border-border/40">
            {email.from?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{email.from}</div>
            <div className="text-xs text-muted-foreground truncate">{email.subject} · {formatTimeAgo(email.receivedAt)}</div>
          </div>
        </div>

        {/* ── 3. KEY POINTS ── */}
        {decision?.keyPoints && decision.keyPoints.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mx-4 mt-3 p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-1.5"
          >
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Key Points</p>
            {decision.keyPoints.map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px] text-foreground/80 leading-snug">
                <span className="text-primary mt-0.5 shrink-0 font-bold">·</span>
                {pt}
              </div>
            ))}
          </motion.div>
        )}

        {/* ── 4. REPLY BOX (if open manually or AI recommends reply) ── */}
        <AnimatePresence>
          {(replyOpen || isReply) && (
            <motion.div
              key="reply-box"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mx-4 mt-3"
            >
              <ReplyBox
                emailId={emailId}
                emailSubject={email.subject}
                emailFrom={email.from}
                threadId={email.threadId}
                onSent={() => setReplyOpen(false)}
                onBack={() => setReplyOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 5. EMAIL BODY — collapsed by default ── */}
        <div className="mx-4 mt-3 mb-6">
          <button
            onClick={() => setBodyExpanded((v) => !v)}
            className="w-full flex items-center gap-2 py-2 px-3 rounded-xl border border-border/30 hover:bg-secondary/40 text-muted-foreground text-xs transition-colors"
          >
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200", bodyExpanded && "rotate-90")} />
            {bodyExpanded ? "Hide" : "Show"} original email
            {!bodyExpanded && email.snippet && (
              <span className="truncate opacity-60 ml-1">&nbsp;— {email.snippet}</span>
            )}
          </button>
          <AnimatePresence>
            {bodyExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-xl bg-secondary/20 border border-border/20 overflow-hidden">
                  <EmailBodyRenderer body={email.body} snippet={email.snippet} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Manual reply box below body if reply is not already shown above */}
          {!isReply && !replyOpen && bodyExpanded && (
            <div className="mt-3">
              <button
                onClick={() => setReplyOpen(true)}
                className="w-full py-2 px-3 rounded-xl border border-border/30 hover:bg-secondary/40 text-muted-foreground text-xs transition-colors flex items-center gap-2"
              >
                <Reply className="w-3.5 h-3.5" />
                Write a reply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Forward Dialog */}
      <AnimatePresence>
        {showForward && (
          <InboxForwardDialog
            email={email}
            onClose={() => setShowForward(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Decision panel (right column) ───────────────
function DecisionPanel({ emailId }: { emailId: string }) {
  const { data, isLoading } = useGetEmail(emailId, { query: { enabled: !!emailId } });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn("rounded-xl bg-secondary animate-pulse", i === 1 ? "h-20" : "h-10")} />
        ))}
      </div>
    );
  }

  if (!data?.decision) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center space-y-3">
        <Brain className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">No AI decision yet for this email.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full px-4 py-4">
      <AiDecisionCard decision={data.decision} emailId={emailId} compact />
    </div>
  );
}

// ── Empty state ──────────────────────────────────
function EmptyState({ hasEmails }: { hasEmails: boolean }) {
  if (hasEmails) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-8 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center text-3xl">📧</div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Select an email</h3>
          <p className="text-sm text-muted-foreground mt-1">Use j/k or click to navigate</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-8 space-y-4">
      <img
        src={`${import.meta.env.BASE_URL}images/empty-inbox.png`}
        alt="Empty Inbox"
        className="w-32 h-32 opacity-70 rounded-2xl object-cover"
      />
      <div>
        <h2 className="text-xl font-bold text-foreground">Inbox Zero</h2>
        <p className="text-sm text-muted-foreground mt-1">The AI has processed all your messages.</p>
      </div>
    </div>
  );
}

// ── Sender bundle (groups 2+ emails from same sender) ──
function SenderBundle({ sender, items, selectedId, onSelect }: {
  sender: string;
  items: EmailWithDecision[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const first = items[0];
  const rest = items.slice(1);
  const hasSelected = items.some((i) => i.email.id === selectedId);

  return (
    <div className={cn("border-b border-border/30", hasSelected && "bg-primary/5")}>
      {/* Always show first email as the representative row */}
      <EmailCardRow data={first} isSelected={selectedId === first.email.id} onSelect={() => onSelect(first.email.id)} />
      {/* Bundle expander */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors border-t border-border/20 border-dashed"
      >
        <Users className="w-3 h-3 shrink-0" />
        <span className="font-medium">{expanded ? "Hide" : `+${rest.length} more`} from {sender.split("<")[0].trim()}</span>
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pl-4 border-l-2 border-primary/20"
          >
            {rest.map((item) => (
              <EmailCardRow
                key={item.email.id}
                data={item}
                isSelected={selectedId === item.email.id}
                onSelect={() => onSelect(item.email.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Inbox component ─────────────────────────
export default function Inbox() {
  const { data: response, isLoading } = useGetEmails();
  const { logAction } = useEmailActions();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Feature 1: collapsed sections (Low Priority collapsed by default)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(["low"]));
  // Feature 2: active filter from SmartStatsBar
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const emails = useMemo(() => response?.emails ?? [], [response]);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const handleFilterAction = useCallback((filter: string) => {
    setActiveFilter((prev) => prev === filter ? null : filter);
  }, []);

  // Flat ordered list for keyboard navigation
  const flatEmails = useMemo(() => {
    const s = [
      emails.filter((e) => e.email.priorityScore >= 70),
      emails.filter((e) =>
        e.email.priorityScore >= 40 &&
        e.email.priorityScore < 70 &&
        (e.decision?.recommendedAction === "reply" || e.decision?.recommendedAction === "track")
      ),
      emails.filter((e) =>
        e.email.priorityScore < 70 &&
        ["TRANSACTIONS", "SOCIAL", "PROMOTIONS"].includes(e.email.category) &&
        e.decision?.recommendedAction !== "reply"
      ),
      emails.filter((e) =>
        e.email.priorityScore < 40 &&
        !["TRANSACTIONS", "SOCIAL", "PROMOTIONS"].includes(e.email.category)
      ),
    ];
    return s.flat();
  }, [emails]);

  const selectedIndex = useMemo(
    () => flatEmails.findIndex((e) => e.email.id === selectedId),
    [flatEmails, selectedId]
  );

  const handleReply = useCallback(() => {
    if (!selectedId) return;
    logAction.mutate({ data: { emailId: selectedId, action: "reply" } });
  }, [selectedId, logAction]);

  const handleArchive = useCallback(async () => {
    if (!selectedId) return;
    const apiBase = import.meta.env.VITE_API_URL || "";
    try {
      const resp = await fetch(`${apiBase}/api/emails/${selectedId}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Archive failed");
      logAction.mutate({ data: { emailId: selectedId, action: "archive" } });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("Archived", { description: "Email removed from inbox" });
      const next = flatEmails[selectedIndex + 1] ?? flatEmails[selectedIndex - 1];
      setSelectedId(next?.email.id ?? null);
    } catch {
      toast.error("Failed to archive email");
    }
  }, [selectedId, logAction, queryClient, flatEmails, selectedIndex]);

  useKeyboardNav({
    enabled: true,
    onNext: () => {
      const next = flatEmails[selectedIndex + 1];
      if (next) setSelectedId(next.email.id);
    },
    onPrev: () => {
      const prev = flatEmails[selectedIndex - 1];
      if (prev) setSelectedId(prev.email.id);
    },
    onReply: handleReply,
    onArchive: handleArchive,
    onEscape: () => setSelectedId(null),
  });

  const allSections = useMemo(() => [
    {
      id: "priority",
      title: "🔥 Priority",
      desc: "Requires immediate attention",
      items: emails.filter((e) => e.email.priorityScore >= 70),
    },
    {
      id: "action",
      title: "⚡ Needs Action",
      desc: "Reply or follow up expected",
      items: emails.filter((e) =>
        e.email.priorityScore >= 40 &&
        e.email.priorityScore < 70 &&
        (e.decision?.recommendedAction === "reply" || e.decision?.recommendedAction === "track")
      ),
    },
    {
      id: "updates",
      title: "📥 Updates",
      desc: "Transactions and notifications",
      items: emails.filter((e) =>
        e.email.priorityScore < 70 &&
        ["TRANSACTIONS", "SOCIAL", "PROMOTIONS"].includes(e.email.category) &&
        e.decision?.recommendedAction !== "reply"
      ),
    },
    {
      id: "low",
      title: "🧠 Low Priority",
      desc: "Newsletters and general reading",
      items: emails.filter((e) =>
        e.email.priorityScore < 40 &&
        !["TRANSACTIONS", "SOCIAL", "PROMOTIONS"].includes(e.email.category)
      ),
    },
  ], [emails]);

  // Feature 2: filter sections based on active filter
  const sections = useMemo(() => {
    if (!activeFilter) return allSections;
    if (activeFilter === "priority") return allSections.filter((s) => s.id === "priority" || s.id === "action");
    return allSections;
  }, [allSections, activeFilter]);

  // Feature 4: group emails by sender within each section
  const groupedSections = useMemo(() => {
    return sections.map((section) => {
      const senderMap = new Map<string, EmailWithDecision[]>();
      for (const item of section.items) {
        const key = item.email.fromEmail || item.email.from;
        if (!senderMap.has(key)) senderMap.set(key, []);
        senderMap.get(key)!.push(item);
      }
      // Create ordered groups preserving original order
      const seen = new Set<string>();
      const groups: { sender: string; items: EmailWithDecision[] }[] = [];
      for (const item of section.items) {
        const key = item.email.fromEmail || item.email.from;
        if (!seen.has(key)) {
          seen.add(key);
          groups.push({ sender: key, items: senderMap.get(key)! });
        }
      }
      return { ...section, groups };
    });
  }, [sections]);

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* ── Column 1: Sidebar nav ── */}
      <Sidebar />

      {/* ── Column 2: Email list ── */}
      <div className={cn(
        "flex flex-col border-r border-border/50 bg-background transition-all duration-300 shrink-0",
        selectedId ? "w-0 lg:w-[380px] overflow-hidden" : "flex-1 lg:w-auto lg:flex-none lg:w-[520px]",
        "lg:ml-64"
      )}>
        {/* List header */}
        <div className="shrink-0 px-6 py-5 border-b border-border/50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Smart Inbox</h1>
              {/* Feature 2: active filter badge */}
              {activeFilter && (
                <button
                  onClick={() => setActiveFilter(null)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-bold hover:bg-primary/25 transition-colors"
                >
                  <Filter className="w-2.5 h-2.5" />
                  {activeFilter === "priority" ? "Priority only" : activeFilter}
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowShortcuts((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">AI-sorted by importance</p>
        </div>

        <ActionStrip compact />
        {/* Feature 2: pass filter callback to SmartStatsBar */}
        <SmartStatsBar onFilterAction={handleFilterAction} activeFilter={activeFilter} />

        {/* Email sections */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">Analyzing inbox…</p>
            </div>
          ) : emails.length === 0 ? (
            <EmptyState hasEmails={false} />
          ) : (
            <div className="py-2">
              {groupedSections.map((section) => {
                if (section.items.length === 0) return null;
                const isCollapsed = collapsedSections.has(section.id);
                return (
                  <div key={section.id} className="mb-1">
                    {/* Feature 1: clickable section header with collapse */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full px-4 py-2 flex items-center justify-between hover:bg-secondary/20 transition-colors group"
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        {section.title}
                        <span className="font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full text-[10px]">
                          {section.items.length}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 opacity-0 group-hover:opacity-100",
                          isCollapsed && "rotate-[-90deg] opacity-60"
                        )}
                      />
                    </button>

                    {/* Feature 1: animated collapse */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <AnimatePresence mode="popLayout">
                            {section.groups.map(({ sender, items }) =>
                              items.length >= 2 ? (
                                /* Feature 4: sender bundle for 2+ emails */
                                <SenderBundle
                                  key={sender}
                                  sender={items[0].email.from}
                                  items={items}
                                  selectedId={selectedId}
                                  onSelect={setSelectedId}
                                />
                              ) : (
                                <EmailCardRow
                                  key={items[0].email.id}
                                  data={items[0]}
                                  isSelected={selectedId === items[0].email.id}
                                  onSelect={() => setSelectedId(items[0].email.id)}
                                />
                              )
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Collapsed preview */}
                    {isCollapsed && (
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full px-4 py-1.5 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                      >
                        <ChevronRight className="w-3 h-3" />
                        {section.items.length} email{section.items.length !== 1 ? "s" : ""} hidden · {section.desc}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Column 3: Email detail ── */}
      <div className={cn(
        "flex-1 flex flex-col min-h-screen border-r border-border/50 relative",
        !selectedId && "hidden lg:flex"
      )}>
        <AnimatePresence mode="wait">
          {selectedId ? (
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
              className="flex-1 flex flex-col h-screen"
            >
              <EmailDetailPanel
                emailId={selectedId}
                onClose={() => setSelectedId(null)}
                onReply={handleReply}
                onArchive={handleArchive}
                onPrev={() => {
                  const prev = flatEmails[selectedIndex - 1];
                  if (prev) setSelectedId(prev.email.id);
                }}
                onNext={() => {
                  const next = flatEmails[selectedIndex + 1];
                  if (next) setSelectedId(next.email.id);
                }}
                hasPrev={selectedIndex > 0}
                hasNext={selectedIndex < flatEmails.length - 1}
              />
            </motion.div>
          ) : (
            <EmptyState hasEmails={emails.length > 0} />
          )}
        </AnimatePresence>

        {/* Keyboard hint overlay */}
        <AnimatePresence>
          <KeyboardHint visible={showShortcuts} onClose={() => setShowShortcuts(false)} />
        </AnimatePresence>
      </div>

      {/* ── Column 4: AI Decision panel ── */}
      {selectedId && (
        <div className="hidden xl:flex w-72 shrink-0 flex-col border-l border-border/50 bg-card/30 h-screen">
          <div className="shrink-0 px-4 py-3 border-b border-border/50 flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-primary shrink-0" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground leading-none">AI Analysis</h3>
              <p className="text-[9px] text-muted-foreground mt-0.5">Action · Why · Confidence</p>
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 overflow-hidden"
            >
              <DecisionPanel emailId={selectedId} />
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── "Why?" panel with behavior influence + similar emails ──
function WhyPanel({ emailId, reason, summary, confidence, modelSource }: {
  emailId: string;
  reason?: string;
  summary?: string;
  confidence?: number;
  modelSource?: string;
}) {
  const { data: sender } = useSenderStats(emailId);
  const isCloud = modelSource?.startsWith("cloud");

  const behaviorInsight = useMemo(() => {
    if (!sender) return null;
    if (sender.replyRate >= 0.5) return { text: `Your reply rate (${Math.round(sender.replyRate * 100)}%) boosted this email's priority`, icon: <TrendingUp className="w-3 h-3 text-green-400 shrink-0" />, color: "text-green-400" };
    if (sender.ignoreRate >= 0.5) return { text: `Your ignore rate (${Math.round(sender.ignoreRate * 100)}%) lowered this email's score`, icon: <VolumeX className="w-3 h-3 text-red-400 shrink-0" />, color: "text-red-400" };
    if (sender.openRate >= 0.5) return { text: `You open emails from this sender but rarely reply`, icon: <Eye className="w-3 h-3 text-yellow-400 shrink-0" />, color: "text-yellow-400" };
    return { text: "No prior history — scored on content alone", icon: <Minus className="w-3 h-3 text-muted-foreground shrink-0" />, color: "text-muted-foreground" };
  }, [sender]);

  return (
    <div
      className="mt-2 p-2.5 rounded-lg bg-secondary/60 border border-border/40 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* AI reason */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
          <Brain className="w-2.5 h-2.5" /> Why this email?
        </p>
        <p className="text-xs text-foreground leading-relaxed">{reason}</p>
      </div>

      {/* Feature 5: Behavior influence */}
      {behaviorInsight && (
        <div className="border-t border-border/30 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Your behavior influence</p>
          <p className={cn("text-[11px] flex items-start gap-1.5", behaviorInsight.color)}>
            {behaviorInsight.icon}
            {behaviorInsight.text}
          </p>
        </div>
      )}

      {/* Feature 6: Similar past emails */}
      {sender && sender.totalEmails > 0 && (
        <div className="border-t border-border/30 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Similar past emails</p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MessageSquare className="w-3 h-3 text-primary shrink-0" />
            <span>
              <span className="font-bold text-foreground">{sender.totalEmails}</span> tracked email{sender.totalEmails !== 1 ? "s" : ""} from this sender
              {sender.replyRate > 0 && ` · replied ${Math.round(sender.replyRate * 100)}% of the time`}
            </span>
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/30 pt-2">
          {summary}
        </p>
      )}

      {/* Model + confidence footer */}
      <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1 border-t border-border/30 pt-1.5">
        {isCloud ? <Cloud className="w-2.5 h-2.5" /> : <Cpu className="w-2.5 h-2.5" />}
        {confidence !== undefined && `${Math.round(confidence * 100)}% confidence`}
        {modelSource && ` · ${modelSource}`}
      </p>
    </div>
  );
}

// ── Inline mini reply box ─────────────────────────
function InlineReplyBox({ emailId, from, subject, onClose }: {
  emailId: string;
  from: string;
  subject: string;
  onClose: () => void;
}) {
  const [selectedMode, setSelectedMode] = useState<"plain" | "ai" | null>(null);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mx-4 mb-2 border border-primary/20 rounded-xl overflow-hidden bg-background shadow-lg">
        <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-primary/15">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
            <Reply className="w-2.5 h-2.5" /> Quick Reply
          </span>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-secondary text-muted-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>

        {selectedMode === null ? (
          <ReplyModeOptions onSelect={(mode) => setSelectedMode(mode)} />
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <ReplyBox
              emailId={emailId}
              emailSubject={subject}
              emailFrom={from}
              initialMode={selectedMode}
              onBack={() => setSelectedMode(null)}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Compact email row for the list column ────────
function EmailCardRow({
  data,
  isSelected,
  onSelect,
}: {
  data: EmailWithDecision;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { email, decision } = data;
  const { logAction } = useEmailActions();
  const queryClient = useQueryClient();
  const [whyExpanded, setWhyExpanded] = useState(false);
  // Feature 7: inline reply state
  const [replyOpen, setReplyOpen] = useState(false);
  // Feature 3: star/important state
  const [starred, setStarred] = useState(false);

  const handleQuickAction = async (e: React.MouseEvent, action: "reply" | "ignore" | "archive") => {
    e.preventDefault();
    e.stopPropagation();
    if (action === "reply") {
      setReplyOpen((v) => !v);
    } else if (action === "archive") {
      const apiBase = import.meta.env.VITE_API_URL || "";
      try {
        const resp = await fetch(`${apiBase}/api/emails/${email.id}/archive`, {
          method: "POST",
          credentials: "include",
        });
        if (!resp.ok) throw new Error("Archive failed");
        logAction.mutate({ data: { emailId: email.id, action } });
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        toast.success("Archived", { description: "Email removed from inbox" });
      } catch {
        toast.error("Failed to archive email");
      }
    } else {
      logAction.mutate({ data: { emailId: email.id, action } });
    }
  };

  // Feature 3: mark important handler
  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStarred((v) => !v);
    if (!starred) {
      logAction.mutate({ data: { emailId: email.id, action: "star" } });
    }
  };

  const handleWhyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setWhyExpanded((v) => !v);
  };

  const score = email.priorityScore ?? 0;
  const isHigh = score >= 80;
  const isOrange = score >= 60 && score < 80;
  const isYellow = score >= 40 && score < 60;

  const leftBorderColor = isHigh
    ? "border-l-red-500"
    : isOrange
    ? "border-l-orange-400"
    : isSelected
    ? "border-l-primary"
    : "border-l-transparent";

  const scoreBadge = isHigh
    ? "text-red-400 border-red-400/30 bg-red-400/10"
    : isOrange
    ? "text-orange-400 border-orange-400/30 bg-orange-400/10"
    : isYellow
    ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
    : "text-green-500 border-green-500/20 bg-green-500/8";

  const isCloud = decision?.modelSource?.startsWith("cloud");

  // Feature 7: Show inline reply when AI recommends reply
  const aiRecommendsReply = decision?.recommendedAction === "reply";

  return (
    <div>
      <motion.div
        layout
        role="button"
        tabIndex={0}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, height: 0 }}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
        className={cn(
          "w-full text-left px-4 py-3 border-b border-border/30 transition-all group cursor-pointer border-l-2",
          leftBorderColor,
          isSelected && "bg-primary/10",
          !isSelected && isHigh && "bg-red-500/[0.04] hover:bg-red-500/[0.07]",
          !isSelected && !isHigh && "hover:bg-secondary/40"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Unread dot */}
          <div className="mt-1.5 shrink-0">
            {!email.isRead ? (
              <div className="w-2 h-2 rounded-full bg-primary" />
            ) : (
              <div className="w-2 h-2" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className={cn("text-sm font-semibold truncate", !email.isRead ? "text-foreground" : "text-muted-foreground")}>
                {email.from}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatTimeAgo(email.receivedAt)}</span>
            </div>

            <div className={cn("text-sm truncate mb-1", !email.isRead ? "text-foreground font-medium" : "text-muted-foreground", isHigh && "font-bold")}>
              {isHigh && <Zap className="w-3 h-3 inline text-red-400 mr-1 -mt-0.5" />}
              {email.subject}
            </div>

            <div className="text-xs text-muted-foreground truncate">{email.snippet}</div>

            {/* AI metadata row */}
            {decision && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono shrink-0", scoreBadge)}>
                  {score}
                </span>
                <span className={cn(
                  "inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0",
                  isCloud
                    ? "text-blue-400 border-blue-400/20 bg-blue-400/8"
                    : "text-green-400 border-green-400/20 bg-green-400/8"
                )}>
                  {isCloud ? <Cloud className="w-2 h-2" /> : <Cpu className="w-2 h-2" />}
                </span>

                {/* Feature 7: "Reply" recommended badge */}
                {aiRecommendsReply && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setReplyOpen((v) => !v); }}
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 transition-colors",
                      replyOpen
                        ? "text-primary border-primary/30 bg-primary/10"
                        : "text-muted-foreground border-border/40 bg-secondary/60 hover:text-primary hover:border-primary/20"
                    )}
                  >
                    <Reply className="w-2 h-2" />
                    {replyOpen ? "Close reply" : "Quick reply"}
                  </button>
                )}

                {/* Why this email? */}
                <button
                  onClick={handleWhyClick}
                  className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground italic truncate transition-colors max-w-[180px]"
                  title="Why this email?"
                >
                  <span className="truncate">{decision.reason}</span>
                  {whyExpanded
                    ? <ChevronDown className="w-2.5 h-2.5 shrink-0" />
                    : <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                  }
                </button>
              </div>
            )}

            {/* Feature 5+6: expandable "Why?" with behavior + similar emails */}
            <AnimatePresence>
              {whyExpanded && decision && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <WhyPanel
                    emailId={email.id}
                    reason={decision.reason}
                    summary={decision.summary ?? undefined}
                    confidence={decision.confidence}
                    modelSource={decision.modelSource}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Hover quick actions */}
          <div className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5">
            {/* Feature 3: Mark important (star) */}
            <button
              onClick={handleStar}
              className={cn(
                "p-1.5 rounded transition-colors",
                starred
                  ? "text-yellow-400"
                  : "text-muted-foreground hover:text-yellow-400"
              )}
              title="Mark important"
            >
              <Star className={cn("w-3 h-3", starred && "fill-current")} />
            </button>
            <button
              onClick={(e) => handleQuickAction(e, "reply")}
              className={cn(
                "p-1.5 rounded transition-colors",
                replyOpen
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-primary hover:text-primary-foreground text-muted-foreground"
              )}
              title="Reply (r)"
            >
              <Reply className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleQuickAction(e, "archive")}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
              title="Archive (e)"
            >
              <Archive className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Feature 7: Inline reply box */}
      <AnimatePresence>
        {replyOpen && (
          <InlineReplyBox
            emailId={email.id}
            from={email.from}
            subject={email.subject}
            onClose={() => setReplyOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
