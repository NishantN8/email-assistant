import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useGetEmails, useGetEmail } from "@workspace/api-client-react";
import { type EmailWithDecision } from "@workspace/api-client-react";
import { ActionStrip } from "@/components/ActionStrip";
import { EmailCard } from "@/components/EmailCard";
import { Sidebar } from "@/components/Sidebar";
import { AiDecisionCard } from "@/components/AiDecisionCard";
import { useEmailActions } from "@/hooks/use-emails";
import { useKeyboardNav } from "@/hooks/use-keyboard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ArrowLeft, Reply, Archive, Trash2,
  MoreHorizontal, Forward, Keyboard, X
} from "lucide-react";
import { formatTimeAgo, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

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

// ── Email detail panel (center column) ──────────
function EmailDetailPanel({
  emailId,
  onClose,
  onReply,
  onArchive,
}: {
  emailId: string;
  onClose: () => void;
  onReply: () => void;
  onArchive: () => void;
}) {
  const { data, isLoading } = useGetEmail(emailId, { query: { enabled: !!emailId } });
  const { logAction } = useEmailActions();
  const markedRead = useRef(false);

  useEffect(() => {
    markedRead.current = false;
  }, [emailId]);

  useEffect(() => {
    if (data?.email && !data.email.isRead && !markedRead.current) {
      markedRead.current = true;
      logAction.mutate({ data: { emailId: data.email.id, action: "open" } });
    }
  }, [data, emailId, logAction]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading email…</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { email } = data;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-6 py-3 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-sm">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onReply} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Reply (r)">
            <Reply className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors hidden sm:block" title="Forward">
            <Forward className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={onArchive} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Archive (e)">
            <Archive className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Trash">
            <Trash2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight mb-4">{email.subject}</h1>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-sm font-bold border border-border">
                {getInitials(email.from)}
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">{email.from}</div>
                <div className="text-xs text-muted-foreground">{email.fromEmail}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <div>{new Date(email.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              <div>{new Date(email.receivedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="prose prose-invert max-w-none prose-sm prose-p:leading-relaxed text-foreground">
          {email.body ? (
            <div dangerouslySetInnerHTML={{ __html: email.body }} />
          ) : (
            <p className="whitespace-pre-wrap">{email.snippet}</p>
          )}
        </div>

        {/* Quick reply */}
        <div className="rounded-xl border border-border bg-card p-4 mt-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">ME</div>
            <div className="flex-1">
              <textarea
                className="w-full bg-transparent border-0 focus:ring-0 resize-none text-sm text-foreground placeholder:text-muted-foreground p-0 min-h-[52px]"
                placeholder="Write a quick reply…"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={onReply}
                  className="px-4 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg text-sm hover:bg-primary/90 transition-colors"
                >
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Decision sidebar (right column) ─────────────
function DecisionPanel({ emailId }: { emailId: string }) {
  const { data } = useGetEmail(emailId, { query: { enabled: !!emailId } });
  const decision = data?.decision;

  if (!decision) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Generating AI analysis…</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full px-4 py-4">
      <AiDecisionCard decision={decision} emailId={emailId} compact />
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

// ── Main Inbox component ─────────────────────────
export default function Inbox() {
  const { data: response, isLoading } = useGetEmails();
  const { logAction } = useEmailActions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const emails = useMemo(() => response?.emails ?? [], [response]);

  // Flat ordered list for keyboard navigation
  const flatEmails = useMemo(() => {
    const sections = [
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
    return sections.flat();
  }, [emails]);

  const selectedIndex = useMemo(
    () => flatEmails.findIndex((e) => e.email.id === selectedId),
    [flatEmails, selectedId]
  );

  const handleReply = useCallback(() => {
    if (!selectedId) return;
    logAction.mutate({ data: { emailId: selectedId, action: "reply" } });
  }, [selectedId, logAction]);

  const handleArchive = useCallback(() => {
    if (!selectedId) return;
    logAction.mutate({ data: { emailId: selectedId, action: "archive" } });
    // Move to next email after archive
    const next = flatEmails[selectedIndex + 1] ?? flatEmails[selectedIndex - 1];
    setSelectedId(next?.email.id ?? null);
  }, [selectedId, logAction, flatEmails, selectedIndex]);

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

  const sections = useMemo(() => [
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
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Smart Inbox</h1>
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
              {sections.map((section) => {
                if (section.items.length === 0) return null;
                return (
                  <div key={section.id} className="mb-2">
                    <div className="px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        {section.title}
                        <span className="font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full text-[10px]">
                          {section.items.length}
                        </span>
                      </span>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {section.items.map((item) => (
                        <EmailCardRow
                          key={item.email.id}
                          data={item}
                          isSelected={selectedId === item.email.id}
                          onSelect={() => setSelectedId(item.email.id)}
                        />
                      ))}
                    </AnimatePresence>
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
          <div className="shrink-0 px-4 py-3 border-b border-border/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Analysis</h3>
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

  const handleQuickAction = (e: React.MouseEvent, action: "reply" | "ignore" | "archive") => {
    e.preventDefault();
    e.stopPropagation();
    logAction.mutate({ data: { emailId: email.id, action } });
  };

  const scoreColor =
    email.priorityScore >= 80
      ? "text-red-400 border-red-400/30 bg-red-400/10"
      : email.priorityScore >= 60
      ? "text-orange-400 border-orange-400/30 bg-orange-400/10"
      : email.priorityScore >= 40
      ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
      : "text-green-400 border-green-400/30 bg-green-400/10";

  return (
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
        "w-full text-left px-4 py-3 border-b border-border/30 transition-all group cursor-pointer",
        isSelected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-secondary/40 border-l-2 border-l-transparent",
        !email.isRead && !isSelected && "bg-primary/[0.02]"
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
          <div className={cn("text-sm truncate mb-1", !email.isRead ? "text-foreground font-medium" : "text-muted-foreground")}>
            {email.subject}
          </div>
          <div className="text-xs text-muted-foreground truncate">{email.snippet}</div>

          {/* AI reason tag */}
          {decision && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono", scoreColor)}>
                {email.priorityScore}
              </span>
              <span className="text-[10px] text-muted-foreground italic truncate">{decision.reason}</span>
            </div>
          )}
        </div>

        {/* Hover quick actions */}
        <div className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5">
          <button
            onClick={(e) => handleQuickAction(e, "reply")}
            className="p-1.5 rounded hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors"
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
  );
}
