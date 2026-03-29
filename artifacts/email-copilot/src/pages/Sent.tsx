import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SmartStatsBar } from "@/components/SmartStatsBar";
import { EmailListView } from "@/components/EmailListView";

const API = import.meta.env.VITE_API_URL || "";

export default function Sent() {
  const { data, isLoading } = useQuery({
    queryKey: ["emails", "sent"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/emails/sent?limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sent emails");
      return res.json() as Promise<{ emails: any[]; total: number }>;
    },
  });

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <SmartStatsBar />
        <div className="flex-1 flex flex-col min-h-0">
          {/* Page header */}
          <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Send className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Sent</h1>
              <p className="text-xs text-muted-foreground">Emails you've sent via Gmail</p>
            </div>
          </div>

          <EmailListView
            emails={data?.emails || []}
            total={data?.total || 0}
            isLoading={isLoading}
            emptyIcon={<Send className="w-7 h-7 text-muted-foreground/50" />}
            emptyTitle="No sent emails"
            emptyDescription="Emails you send via the Reply Strategist will appear here."
          />
        </div>
      </div>
    </div>
  );
}
