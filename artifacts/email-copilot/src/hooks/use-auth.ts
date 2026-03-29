import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

async function logout(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: fetchMe,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["auth-me"], { user: null });
      queryClient.invalidateQueries();
    },
  });

  const connectGmail = () => {
    window.location.href = `${BASE}/api/auth/google`;
  };

  return {
    user: data?.user ?? null,
    isLoading,
    isConnected: !!data?.user,
    connectGmail,
    logout: () => logoutMutation.mutate(),
  };
}
