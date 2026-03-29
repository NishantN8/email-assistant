import { useRoute, Link, useLocation } from "wouter";
import { useGetEmail } from "@workspace/api-client-react";
import { useEmailActions } from "@/hooks/use-emails";
import { useEffect } from "react";
import { ArrowLeft, Loader2, Reply, Forward, Archive, Trash2, MoreHorizontal } from "lucide-react";
import { AiDecisionCard } from "@/components/AiDecisionCard";
import { formatTimeAgo, getInitials } from "@/lib/utils";

export default function EmailDetail() {
  const [, params] = useRoute("/email/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";
  
  const { data, isLoading, error } = useGetEmail(id, { query: { enabled: !!id } });
  const { logAction } = useEmailActions();

  // Mark as read on mount
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
            <button onClick={() => handleAction('reply')} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Reply">
              <Reply className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors hidden sm:block" title="Forward">
              <Forward className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-border mx-1" />
            <button onClick={() => handleAction('archive')} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Archive">
              <Archive className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-score-critical transition-colors" title="Trash">
              <Trash2 className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
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
              <div>{new Date(email.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div>{new Date(email.receivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
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
              <br/><br/>
              <em className="text-muted-foreground text-sm">(Full body content not loaded in preview)</em>
            </div>
          )}
        </div>

        {/* Quick Reply Box */}
        <div className="mt-16 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
              ME
            </div>
            <div className="flex-1">
              <textarea 
                className="w-full bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground p-0 min-h-[60px]"
                placeholder="Write a quick reply..."
              />
              <div className="flex justify-end mt-2">
                <button 
                  onClick={() => handleAction('reply')}
                  className="px-5 py-2 bg-primary text-primary-foreground font-semibold rounded-lg shadow-md hover:bg-primary/90 transition-colors text-sm"
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
