import { useQuery } from "@tanstack/react-query";

export interface SenderStats {
  fromEmail: string;
  displayName: string;
  totalEmails: number;
  openCount: number;
  replyCount: number;
  ignoreCount: number;
  archiveCount: number;
  importanceScore: number;
  lastInteractionAt: string | null;
  openRate: number;
  replyRate: number;
  ignoreRate: number;
}

export interface InboxStats {
  totalEmails: number;
  aiScored: number;
  criticalCount: number;
  highPriorityCount: number;
  coveragePercent: number;
  estimatedMinutesSaved: number;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useSenderStats(emailId: string | null) {
  return useQuery<SenderStats>({
    queryKey: ["sender-stats", emailId],
    enabled: !!emailId,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${API_BASE}/api/emails/${emailId}/sender`, {
        credentials: "include",
        signal,
      });
      if (!res.ok) throw new Error("Failed to fetch sender stats");
      return res.json();
    },
  });
}

export function useInboxStats() {
  return useQuery<InboxStats>({
    queryKey: ["inbox-stats"],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${API_BASE}/api/emails/inbox-stats`, {
        credentials: "include",
        signal,
      });
      if (!res.ok) throw new Error("Failed to fetch inbox stats");
      return res.json();
    },
  });
}
