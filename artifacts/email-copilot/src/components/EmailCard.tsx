import { motion } from "framer-motion";
import { Link } from "wouter";
import { Check, Archive, MessageSquare, Clock, ArrowRight } from "lucide-react";
import { type EmailWithDecision } from "@workspace/api-client-react";
import { cn, formatTimeAgo, getScoreColor, getInitials } from "@/lib/utils";
import { useEmailActions } from "@/hooks/use-emails";

export function EmailCard({ data }: { data: EmailWithDecision }) {
  const { email, decision } = data;
  const { logAction } = useEmailActions();

  const handleQuickAction = (e: React.MouseEvent, action: "reply" | "ignore" | "archive") => {
    e.preventDefault();
    e.stopPropagation();
    logAction.mutate({ data: { emailId: email.id, action } });
  };

  return (
    <Link href={`/email/${email.id}`} className="block outline-none group">
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "hover-card-effect flex flex-col md:flex-row gap-4 p-4 md:p-5 rounded-2xl border bg-card/50",
          !email.isRead && "border-primary/30 bg-primary/[0.02]",
          email.isRead && "border-border/50 opacity-80 hover:opacity-100"
        )}
      >
        {/* Left Side: Avatar & Sender */}
        <div className="flex md:flex-col items-center gap-4 md:w-48 shrink-0 md:border-r border-border/50 md:pr-4">
          <div className="relative">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center text-sm md:text-base font-bold shadow-inner border border-border">
              {getInitials(email.from)}
            </div>
            {email.bundledCount && email.bundledCount > 1 && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-primary text-primary-foreground text-[10px] md:text-xs font-bold flex items-center justify-center border-2 border-card">
                {email.bundledCount}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 md:text-center">
            <div className={cn("text-sm font-semibold truncate", !email.isRead && "text-foreground", email.isRead && "text-muted-foreground")}>
              {email.from}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {formatTimeAgo(email.receivedAt)}
            </div>
          </div>
        </div>

        {/* Middle: Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn("text-base font-semibold truncate", !email.isRead ? "text-foreground" : "text-muted-foreground")}>
              {email.subject}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {email.snippet}
          </p>
          
          {decision && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">
                {decision.category}
              </span>
              <span className="text-xs font-medium text-muted-foreground italic flex items-center gap-1">
                <ArrowRight className="w-3 h-3" /> {decision.reason}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: AI Score & Actions */}
        <div className="flex items-center justify-between md:flex-col md:items-end gap-3 md:w-32 shrink-0 md:pl-4">
          <div className={cn("px-3 py-1.5 rounded-lg border font-mono font-bold text-sm", getScoreColor(email.priorityScore))}>
            {email.priorityScore}
            <span className="text-[10px] opacity-60 ml-1">/100</span>
          </div>

          {/* Quick Actions - visible on hover on desktop, always on mobile */}
          <div className="flex items-center gap-1 md:opacity-0 md:-translate-x-4 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-all duration-200">
            <button 
              onClick={(e) => handleQuickAction(e, "reply")}
              className="p-2 rounded-lg bg-secondary hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors"
              title="Quick Reply"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => handleQuickAction(e, "ignore")}
              className="p-2 rounded-lg bg-secondary hover:bg-foreground hover:text-background text-muted-foreground transition-colors"
              title="Ignore"
            >
              <Clock className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => handleQuickAction(e, "archive")}
              className="p-2 rounded-lg bg-secondary hover:bg-score-low hover:text-white text-muted-foreground transition-colors"
              title="Archive"
            >
              <Archive className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
