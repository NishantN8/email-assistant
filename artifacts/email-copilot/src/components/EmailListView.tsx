import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Loader2, Inbox, ChevronRight } from "lucide-react";
import { EmailBodyRenderer } from "@/components/EmailBodyRenderer";

interface EmailItem {
  email: {
    id: string;
    subject: string;
    from: string;
    fromEmail: string;
    to?: string;
    snippet: string;
    body?: string;
    labels: string[];
    receivedAt: string;
    isRead: boolean;
    isStarred: boolean;
  };
}

interface EmailListViewProps {
  emails: EmailItem[];
  total: number;
  isLoading: boolean;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

export function EmailListView({
  emails,
  total,
  isLoading,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: EmailListViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = emails.find((e) => e.email.id === selectedId);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground max-w-xs text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-2xl">
            {emptyIcon}
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{emptyTitle}</p>
            <p className="text-sm text-muted-foreground mt-1">{emptyDescription}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Email list */}
      <div className={cn(
        "border-r border-border overflow-y-auto transition-all duration-300",
        selected ? "w-80 shrink-0" : "flex-1"
      )}>
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {total} emails
          </span>
        </div>
        <div className="divide-y divide-border/30">
          {emails.map((item) => {
            const isActive = item.email.id === selectedId;
            const date = new Date(item.email.receivedAt);
            return (
              <motion.button
                key={item.email.id}
                onClick={() => setSelectedId(isActive ? null : item.email.id)}
                className={cn(
                  "w-full text-left px-4 py-3.5 transition-all hover:bg-secondary/50 flex items-start gap-3",
                  isActive && "bg-primary/5 border-l-2 border-primary"
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0 mt-0.5">
                  {(item.email.from?.[0] || "?").toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                      "text-sm truncate",
                      item.email.isRead ? "text-muted-foreground font-medium" : "text-foreground font-semibold"
                    )}>
                      {item.email.from}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(date, { addSuffix: true })}
                    </span>
                  </div>
                  <p className={cn(
                    "text-xs truncate mt-0.5",
                    item.email.isRead ? "text-muted-foreground" : "text-foreground/80 font-medium"
                  )}>
                    {item.email.subject}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {item.email.snippet}
                  </p>
                </div>

                {selected && (
                  <ChevronRight className={cn(
                    "w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 transition-transform",
                    isActive && "text-primary"
                  )} />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Email detail pane */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.email.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="p-6 max-w-2xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-xl font-bold text-foreground leading-snug mb-3">
                  {selected.email.subject}
                </h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">From:</span>{" "}
                    {selected.email.from} &lt;{selected.email.fromEmail}&gt;
                  </span>
                  {selected.email.to && (
                    <span>
                      <span className="font-medium text-foreground">To:</span>{" "}
                      {selected.email.to}
                    </span>
                  )}
                  <span>
                    {new Date(selected.email.receivedAt).toLocaleString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              {/* Labels */}
              {selected.email.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selected.email.labels
                    .filter((l) => !["INBOX", "UNREAD"].includes(l))
                    .map((label) => (
                      <span
                        key={label}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-muted-foreground uppercase tracking-wide"
                      >
                        {label.replace("CATEGORY_", "")}
                      </span>
                    ))}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-border/50 mb-6" />

              {/* Body */}
              <div className="text-sm text-foreground leading-relaxed">
                <EmailBodyRenderer body={selected.email.body || selected.email.snippet} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
