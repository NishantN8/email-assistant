import { useGetEmails } from "@workspace/api-client-react";
import { ActionStrip } from "@/components/ActionStrip";
import { EmailCard } from "@/components/EmailCard";
import { Sidebar } from "@/components/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function Inbox() {
  const { data: response, isLoading, error } = useGetEmails();

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen w-full lg:pl-64">
        <div className="text-center space-y-4">
          <div className="text-score-critical text-lg font-bold">Failed to load inbox</div>
          <p className="text-muted-foreground">Ensure the backend API is running.</p>
        </div>
      </div>
    );
  }

  const emails = response?.emails || [];

  // Group emails smartly
  const sections = [
    {
      id: "priority",
      title: "🔥 Priority",
      desc: "Requires immediate attention",
      items: emails.filter(e => e.email.priorityScore >= 70)
    },
    {
      id: "action",
      title: "⚡ Needs Action",
      desc: "Reply or follow up expected",
      items: emails.filter(e => 
        e.email.priorityScore >= 40 && 
        e.email.priorityScore < 70 && 
        (e.decision?.recommendedAction === 'reply' || e.decision?.recommendedAction === 'track')
      )
    },
    {
      id: "updates",
      title: "📥 Updates",
      desc: "Transactions and notifications",
      items: emails.filter(e => 
        e.email.priorityScore < 70 && 
        ['TRANSACTIONS', 'SOCIAL', 'PROMOTIONS'].includes(e.email.category) &&
        e.decision?.recommendedAction !== 'reply'
      )
    },
    {
      id: "low",
      title: "🧠 Low Priority",
      desc: "Newsletters and general reading",
      items: emails.filter(e => 
        e.email.priorityScore < 40 && 
        !['TRANSACTIONS', 'SOCIAL', 'PROMOTIONS'].includes(e.email.category)
      )
    }
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 lg:pl-64">
        <div className="max-w-5xl mx-auto px-4 py-8 md:px-8 md:py-12">
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">Smart Inbox</h1>
            <p className="text-muted-foreground">Your emails sorted by AI importance.</p>
          </header>

          <ActionStrip />

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground font-medium animate-pulse">Analyzing inbox...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <img 
                src={`${import.meta.env.BASE_URL}images/empty-inbox.png`} 
                alt="Empty Inbox" 
                className="w-48 h-48 mb-6 opacity-80 mix-blend-screen object-cover rounded-3xl"
              />
              <h2 className="text-2xl font-bold text-foreground mb-2">Inbox Zero</h2>
              <p className="text-muted-foreground max-w-md">
                You're all caught up! The AI has processed all your messages.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {sections.map(section => {
                if (section.items.length === 0) return null;
                return (
                  <section key={section.id} className="space-y-4">
                    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl py-4 mb-2 border-b border-border/50">
                      <div className="flex items-baseline justify-between">
                        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                          {section.title}
                          <span className="text-sm font-mono font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full ml-2">
                            {section.items.length}
                          </span>
                        </h2>
                        <span className="text-sm text-muted-foreground hidden sm:inline-block">
                          {section.desc}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <AnimatePresence mode="popLayout">
                        {section.items.map((item) => (
                          <EmailCard key={item.email.id} data={item} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
