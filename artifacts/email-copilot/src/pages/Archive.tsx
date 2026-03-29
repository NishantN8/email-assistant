import { useQuery } from "@tanstack/react-query";
import { Archive as ArchiveIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SmartStatsBar } from "@/components/SmartStatsBar";
import { EmailListView } from "@/components/EmailListView";

const API = import.meta.env.VITE_API_URL || "";

export default function Archive() {
  const { data, isLoading } = useQuery({
    queryKey: ["emails", "archive"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/emails/archive?limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch archived emails");
      return res.json() as Promise<{ emails: any[]; total: number }>;
    },
  });

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <SmartStatsBar />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-slate-500/10 flex items-center justify-center">
              <ArchiveIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Archive</h1>
              <p className="text-xs text-muted-foreground">Emails removed from inbox</p>
            </div>
          </div>

          <EmailListView
            emails={data?.emails || []}
            total={data?.total || 0}
            isLoading={isLoading}
            emptyIcon={<ArchiveIcon className="w-7 h-7 text-muted-foreground/50" />}
            emptyTitle="Archive is empty"
            emptyDescription="Emails you archive from the inbox will appear here."
          />
        </div>
      </div>
    </div>
  );
}
