import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Task {
  id: string;
  emailId: string;
  actionType: string;
  taskText: string;
  priority: number;
  status: string;
}

async function fetchAllTasks(): Promise<Task[]> {
  const res = await fetch(`${BASE}/api/tasks`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.tasks ?? [];
}

export function useEmailTaskMap(): Map<string, Task> {
  const { data } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: fetchAllTasks,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const map = new Map<string, Task>();
  for (const t of data ?? []) {
    map.set(t.emailId, t);
  }
  return map;
}

export function useTaskForEmail(emailId: string): { data: Task | null } {
  const map = useEmailTaskMap();
  return { data: map.get(emailId) ?? null };
}
