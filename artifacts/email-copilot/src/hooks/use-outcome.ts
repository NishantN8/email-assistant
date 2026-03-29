import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OutcomeSignal {
  id: string;
  emailId: string;
  outcomeType: string;
  sentimentScore: number;
  responseTimeMinutes: number | null;
  intent: string;
  strategy: string;
  createdAt: string;
}

async function fetchOutcome(emailId: string): Promise<OutcomeSignal | null> {
  const res = await fetch(`${BASE}/api/outcome-signals/${emailId}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  return res.json();
}

export function useOutcome(emailId: string) {
  return useQuery({
    queryKey: ["outcome", emailId],
    queryFn: () => fetchOutcome(emailId),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
