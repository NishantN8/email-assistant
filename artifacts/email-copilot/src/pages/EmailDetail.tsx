import { useRoute, Link, useLocation } from "wouter";
import { useGetEmail } from "@workspace/api-client-react";
import { useEmailActions } from "@/hooks/use-emails";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Loader2, Reply, Forward, Archive, Trash2,
  MoreHorizontal, MailOpen, AlertOctagon, X, Send,
} from "lucide-react";
import { AiDecisionCard } from "@/components/AiDecisionCard";
import { ReplyBox } from "@/components/ReplyBox";
import { getInitials, cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Forward Dialog ────────────────────────────────────────────────
interface ForwardDialogProps {
  email: {
    id: string;
    from: string;
    fromEmail: string;
    subject: string;
    body?: string;
    snippet: string;
    receivedAt: string;
  };
  onClose: () => void;
}

function ForwardDialog({ email, onClose }: ForwardDialogProps) {
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  const originalDate = new Date(email.receivedAt).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const quotedContent = `\n\n---------- Forwarded message ----------\nFrom: ${email.from} <${email.fromEmail}>\nDate: ${originalDate}\nSubject: ${email.subject}\n\n${email.body ? email.body.replace(/<[^>]*>/g, "") : email.snippet}`;

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }
    if (!body.trim()) {
      toast.error("Please add a message before forwarding");
      return;
    }
    setIsSending(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const resp = await fetch(`${apiBase}/api/replies/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          emailId: email.id,
          content: body + quotedContent,
          to,
          subject: `Fwd: ${email.subject}`,
        }),
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
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Forward className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm text-foreground">Forward Email</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subject (read-only) */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-muted-foreground w-14 shrink-0">Subject</span>
            <span className="text-sm text-foreground truncate">Fwd: {email.subject}</span>
          </div>

          {/* To field */}
          <div className="flex items-center gap-2 mb-3 border-b border-border/50 pb-3">
            <label htmlFor="forward-to" className="text-xs font-semibold text-muted-foreground w-14 shrink-0">
              To
            </label>
            <input
              id="forward-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* Message body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a message..."
            rows={4}
            className="w-full bg-transparent border-0 outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground leading-relaxed"
          />
        </div>

        {/* Quoted preview */}
        <div className="mx-5 mb-4 rounded-xl bg-secondary/40 border border-border/50 p-3 max-h-28 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Forwarded message
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
            From: {email.from} &lt;{email.fromEmail}&gt;{"\n"}
            Date: {originalDate}{"\n"}
            Subject: {email.subject}{"\n\n"}
            {email.body ? email.body.replace(/<[^>]*>/g, "").slice(0, 300) : email.snippet}
            {(email.body?.replace(/<[^>]*>/g, "") || email.snippet).length > 300 ? "…" : ""}
          </p>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !to.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20"
          >
            {isSending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="w-4 h-4" /> Forward</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── More Menu ─────────────────────────────────────────────────────
interface MoreMenuProps {
  emailId: string;
  isRead: boolean;
  onClose: () => void;
  onAction: (action: "mark_unread" | "trash" | "spam") => void;
}

function MoreMenu({ isRead, onClose, onAction }: MoreMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const items = [
    {
      label: isRead ? "Mark as Unread" : "Mark as Read",
      icon: MailOpen,
      action: "mark_unread" as const,
      className: "text-foreground hover:bg-secondary",
    },
    {
      label: "Move to Trash",
      icon: Trash2,
      action: "trash" as const,
      className: "text-red-400 hover:bg-red-500/10",
    },
    {
      label: "Report Spam",
      icon: AlertOctagon,
      action: "spam" as const,
      className: "text-amber-400 hover:bg-amber-500/10",
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            onClick={() => {
              onAction(item.action);
              onClose();
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
              item.className
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── EmailDetail Page ──────────────────────────────────────────────
export default function EmailDetail() {
  const [, params] = useRoute("/email/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";

  const { data, isLoading, error } = useGetEmail(id, { query: { enabled: !!id } });
  const { logAction } = useEmailActions();
  const [replySent, setReplySent] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (data?.email && !data.email.isRead) {
      logAction.mutate({ data: { emailId: data.email.id, action: "open" } });
    }
  }, [data, logAction]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading email context...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">Email not found</h2>
        <p className="text-muted-foreground mb-6">This message may have been deleted or moved.</p>
        <Link href="/" className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors">
          Back to Inbox
        </Link>
      </div>
    );
  }

  const { email, decision } = data;

  const handleAction = (action: "reply" | "archive") => {
    logAction.mutate({ data: { emailId: email.id, action } });
    if (action === "archive") setLocation("/");
  };

  const handleMoreAction = (action: "mark_unread" | "trash" | "spam") => {
    logAction.mutate({
      data: { emailId: email.id, action },
    });

    if (action === "mark_unread") {
      toast.success("Marked as unread");
    } else if (action === "trash") {
      toast.success("Moved to Trash");
      setLocation("/");
    } else if (action === "spam") {
      toast.success("Reported as Spam", {
        description: "This email has been moved to your spam folder.",
      });
      setLocation("/");
    }
  };

  const handleTrash = () => {
    logAction.mutate({ data: { emailId: email.id, action: "trash" } });
    toast.success("Moved to Trash");
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Navigation */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors outline-none">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex gap-2">
              {email.labels?.map((label) => (
                <span key={label} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => handleAction("reply")}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Reply"
            >
              <Reply className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowForward(true)}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
              title="Forward"
            >
              <Forward className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <button
              onClick={() => handleAction("archive")}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Archive"
            >
              <Archive className="w-5 h-5" />
            </button>
            <button
              onClick={handleTrash}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-score-critical transition-colors"
              title="Trash"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className={cn(
                  "p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors",
                  showMoreMenu && "bg-secondary text-foreground"
                )}
                title="More options"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.1 }}
                  >
                    <MoreMenu
                      emailId={email.id}
                      isRead={email.isRead}
                      onClose={() => setShowMoreMenu(false)}
                      onAction={handleMoreAction}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* AI Explainer */}
        {decision && <AiDecisionCard decision={decision} emailId={email.id} />}

        {/* Email Header */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-8 leading-tight">
            {email.subject}
          </h1>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-lg font-bold shadow-inner border border-border">
                {getInitials(email.from)}
              </div>
              <div>
                <div className="font-semibold text-foreground text-base">{email.from}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span>{email.fromEmail}</span>
                  <span>•</span>
                  <span>to {email.to || "me"}</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-right">
              <div>{new Date(email.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
              <div>{new Date(email.receivedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
            </div>
          </div>
        </div>

        {/* Email Body */}
        <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-a:text-primary hover:prose-a:text-primary/80">
          {email.body ? (
            <div dangerouslySetInnerHTML={{ __html: email.body }} className="text-foreground" />
          ) : (
            <div className="text-foreground whitespace-pre-wrap font-sans text-base">
              {email.snippet}
              <br /><br />
              <em className="text-muted-foreground text-sm">(Full body content not loaded in preview)</em>
            </div>
          )}
        </div>

        {/* AI Reply Box */}
        <ReplyBox
          emailId={email.id}
          emailFrom={email.fromEmail}
          emailSubject={email.subject}
          threadId={email.threadId}
          defaultTone={
            decision?.recommendedAction === "reply" ? "professional" : "friendly"
          }
          onSent={() => {
            setReplySent(true);
            logAction.mutate({ data: { emailId: email.id, action: "reply" } });
          }}
        />
        {replySent && (
          <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary font-medium flex items-center gap-2">
            ✓ Reply sent successfully
          </div>
        )}
      </div>

      {/* Forward Dialog */}
      <AnimatePresence>
        {showForward && (
          <ForwardDialog
            email={email}
            onClose={() => setShowForward(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
