import { Link } from "wouter";
import { Zap, CheckCircle2, Clock, ArrowRight, Inbox } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getApiUrl = (path: string) => `${BASE}/api/${path}`;

type TaskStatus = "needs_action" | "in_progress" | "done";

interface Task {
  id: string;
  emailId: string;
  actionType: string;
  taskText: string;
  priority: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  needs_action: { label: "Needs Action", color: "text-red-400 border-red-400/20 bg-red-400/10", icon: Zap },
  in_progress: { label: "In Progress", color: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10", icon: Clock },
  done: { label: "Done", color: "text-green-400 border-green-400/20 bg-green-400/10", icon: CheckCircle2 },
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  reply: "Reply",
  review: "Review",
  pay: "Pay",
  track: "Track",
  archive: "Archive",
  follow_up: "Follow Up",
  read: "Read",
};

function TaskCard({ task, onStatusChange }: { task: Task; onStatusChange: (id: string, status: TaskStatus) => void }) {
  const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG.needs_action;
  const StatusIcon = statusInfo.icon;

  return (
    <div className={cn("rounded-xl border p-4 bg-card/50 flex flex-col gap-3", statusInfo.color.includes("red") ? "border-red-400/10" : statusInfo.color.includes("yellow") ? "border-yellow-400/10" : "border-green-400/10")}>
      <div className="flex items-start gap-3">
        <div className={cn("p-1.5 rounded-lg border shrink-0", statusInfo.color)}>
          <StatusIcon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {ACTION_TYPE_LABELS[task.actionType] ?? task.actionType}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              Priority: {task.priority}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">{task.taskText}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-between">
        <Link
          href={`/email/${task.emailId}`}
          className="text-[10px] text-primary hover:underline flex items-center gap-1"
        >
          <ArrowRight className="w-3 h-3" /> View Email
        </Link>
        <div className="flex gap-1.5">
          {task.status !== "in_progress" && (
            <button
              onClick={() => onStatusChange(task.id, "in_progress")}
              className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-secondary hover:bg-yellow-400/20 hover:text-yellow-400 text-muted-foreground transition-colors"
            >
              Start
            </button>
          )}
          {task.status !== "done" && (
            <button
              onClick={() => onStatusChange(task.id, "done")}
              className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-secondary hover:bg-green-400/20 hover:text-green-400 text-muted-foreground transition-colors"
            >
              Done
            </button>
          )}
          {task.status === "done" && (
            <button
              onClick={() => onStatusChange(task.id, "needs_action")}
              className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-secondary hover:bg-red-400/20 hover:text-red-400 text-muted-foreground transition-colors"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskGroup({ title, tasks, statusConfig, onStatusChange }: {
  title: string;
  tasks: Task[];
  statusConfig: typeof STATUS_CONFIG[TaskStatus];
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const StatusIcon = statusConfig.icon;
  return (
    <div>
      <div className={cn("flex items-center gap-2 mb-3 px-1")}>
        <StatusIcon className={cn("w-4 h-4", statusConfig.color.split(" ")[0])} />
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-secondary/20 px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">No tasks here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActionFeed() {
  const queryClient = useQueryClient();

  const statusFilter = (new URLSearchParams(window.location.search).get("status") as TaskStatus | null) ?? undefined;
  const validStatuses: TaskStatus[] = ["needs_action", "in_progress", "done"];
  const activeFilter = statusFilter && validStatuses.includes(statusFilter) ? statusFilter : undefined;

  const { data, isLoading } = useQuery<{ tasks: Task[]; total: number; disabled?: boolean }>({
    queryKey: ["tasks", activeFilter],
    queryFn: async () => {
      const url = activeFilter ? getApiUrl(`tasks?status=${activeFilter}`) : getApiUrl("tasks");
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return { tasks: [], total: 0, disabled: true };
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const res = await fetch(getApiUrl(`tasks/${taskId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const tasks = data?.tasks ?? [];
  const byStatus = {
    needs_action: tasks.filter((t) => t.status === "needs_action"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
  };

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    updateStatus.mutate({ taskId, status });
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:pl-64 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-yellow-500/15 border border-yellow-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {activeFilter ? (STATUS_CONFIG[activeFilter]?.label ?? "Action Feed") : "Action Feed"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {activeFilter ? `Filtered by status` : "AI-generated tasks from your inbox"}
              </p>
            </div>
            <div className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg">
              {tasks.length} total
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-secondary/50 animate-pulse" />
              ))}
            </div>
          ) : data?.disabled ? (
            <div className="text-center py-16">
              <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-sm text-muted-foreground">Task system is not enabled.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Enable ENABLE_TASK_SYSTEM to start generating AI tasks from your inbox.
              </p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-40" />
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tasks are generated automatically when your inbox syncs.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              <TaskGroup
                title="Needs Action"
                tasks={byStatus.needs_action}
                statusConfig={STATUS_CONFIG.needs_action}
                onStatusChange={handleStatusChange}
              />
              <TaskGroup
                title="In Progress"
                tasks={byStatus.in_progress}
                statusConfig={STATUS_CONFIG.in_progress}
                onStatusChange={handleStatusChange}
              />
              <TaskGroup
                title="Done"
                tasks={byStatus.done}
                statusConfig={STATUS_CONFIG.done}
                onStatusChange={handleStatusChange}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
