import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback, useEffect } from "react";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

interface MeResponse {
  user: AuthUser | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
  if (!res.ok) return { user: null };
  return res.json();
}

async function logoutFn(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
}

export function useAuth() {
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const { data, isLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: fetchMe,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logoutFn,
    onSuccess: () => {
      queryClient.setQueryData(["auth-me"], { user: null });
      queryClient.invalidateQueries();
    },
  });

  const connectGmail = useCallback(() => {
    const oauthUrl = `${window.location.origin}${BASE}/api/auth/google`;

    const popup = window.open(
      oauthUrl,
      "gmail-oauth",
      "width=520,height=640,scrollbars=yes,resizable=yes"
    );

    if (!popup) {
      window.location.href = oauthUrl;
      return;
    }

    popupRef.current = popup;

    pollRef.current = setInterval(async () => {
      if (!popup || popup.closed) {
        stopPolling();
        return;
      }
      try {
        const res = await fetch(`${BASE}/api/auth/me`, { credentials: "include" });
        if (res.ok) {
          const json: MeResponse = await res.json();
          if (json.user) {
            stopPolling();
            popup.close();
            queryClient.setQueryData(["auth-me"], json);
            queryClient.invalidateQueries({ queryKey: ["emails"] });
            queryClient.invalidateQueries({ queryKey: ["sync-status"] });
          }
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 1500);
  }, [queryClient, stopPolling]);

  return {
    user: data?.user ?? null,
    isLoading,
    isConnected: !!data?.user,
    connectGmail,
    logout: () => logoutMutation.mutate(),
  };
}
