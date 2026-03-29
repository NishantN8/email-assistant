import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon, Cloud, Cpu, Brain, Sliders,
  User, Trash2, CheckCircle2, AlertCircle, RotateCcw,
  BookOpen, ChevronRight, Zap, MessageSquare, LogOut, GitMerge,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SmartStatsBar } from "@/components/SmartStatsBar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const API = import.meta.env.VITE_API_URL || "";

type Tone = "professional" | "friendly" | "brief" | "formal";
type ReplyLength = "short" | "medium" | "long";
type RoutingMode = "cloud" | "local" | "hybrid";

interface SettingsData {
  modelRouting: {
    preferLocal: boolean;
    cloudEscalationScore: number;
    forceCloud: boolean;
    routingMode?: RoutingMode;
  };
  toneProfile: {
    preferredTone: string;
    avgReplyLength: string;
    editCount: string;
    exampleReplies: string[];
    vocabularyHints: string[];
    updatedAt: string;
  } | null;
}

function SectionCard({ title, icon: Icon, children, accent = "primary" }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  accent?: "primary" | "blue" | "green" | "red";
}) {
  const accentClasses = {
    primary: "text-primary bg-primary/10",
    blue: "text-blue-400 bg-blue-400/10",
    green: "text-green-400 bg-green-400/10",
    red: "text-red-400 bg-red-400/10",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", accentClasses[accent])}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange, disabled }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        className={cn(
          "w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 relative",
          value ? "bg-primary" : "bg-secondary border border-border",
          disabled && "opacity-40 cursor-not-allowed"
        )}
      >
        <span className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
          value && "translate-x-5"
        )} />
      </button>
    </div>
  );
}

function SelectRow({ label, description, value, options, onChange }: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none focus:border-primary transition-colors shrink-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function Settings() {
  const { user, isConnected, logout } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const patchModelRouting = useMutation({
    mutationFn: async (updates: Partial<SettingsData["modelRouting"]>) => {
      const res = await fetch(`${API}/api/settings/model-routing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Model routing saved");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const patchToneProfile = useMutation({
    mutationFn: async (updates: { preferredTone?: string; avgReplyLength?: string }) => {
      const res = await fetch(`${API}/api/settings/tone-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Tone preferences saved");
    },
    onError: () => toast.error("Failed to save tone profile"),
  });

  const resetLearning = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/settings/tone-profile`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("AI learning data cleared");
    },
    onError: () => toast.error("Failed to reset learning data"),
  });

  const routing = settings?.modelRouting;
  const tone = settings?.toneProfile;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <SmartStatsBar />

        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Settings</h1>
              <p className="text-xs text-muted-foreground">AI routing · tone profile · account</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-2xl mx-auto pb-16">

              {/* ── AI Model Routing ── */}
              <SectionCard title="AI Model Routing" icon={Brain} accent="primary">
                {/* 3-mode radio selector */}
                <div className="space-y-2 pb-4 border-b border-border/40">
                  <p className="text-xs text-muted-foreground mb-3">Choose how AI decisions are routed between cloud and local GPU.</p>
                  {(
                    [
                      {
                        mode: "cloud" as const,
                        icon: Cloud,
                        label: "Force Cloud",
                        desc: "Always use OpenAI cloud for all decisions. Best accuracy, requires internet.",
                        color: "text-blue-400",
                        activeBg: "bg-blue-500/10 border-blue-500/30",
                      },
                      {
                        mode: "local" as const,
                        icon: Cpu,
                        label: "Prefer Local GPU",
                        desc: "Route tasks to your local Ollama instance. Fast & private, requires GPU.",
                        color: "text-green-400",
                        activeBg: "bg-green-500/10 border-green-500/30",
                      },
                      {
                        mode: "hybrid" as const,
                        icon: GitMerge,
                        label: "Hybrid (GPU + Cloud)",
                        desc: "GPU handles low-priority tasks; cloud handles critical & high-priority emails.",
                        color: "text-violet-400",
                        activeBg: "bg-violet-500/10 border-violet-500/30",
                      },
                    ] as const
                  ).map(({ mode, icon: Icon, label, desc, color, activeBg }) => {
                    const currentMode = routing?.routingMode ?? (routing?.forceCloud ? "cloud" : routing?.preferLocal ? "local" : "cloud");
                    const isActive = currentMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => patchModelRouting.mutate({ routingMode: mode })}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left",
                          isActive ? activeBg : "border-border hover:bg-secondary/40"
                        )}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                          isActive ? `${color.replace("text-", "bg-").replace("400", "400/20")}` : "bg-secondary"
                        )}>
                          <Icon className={cn("w-3.5 h-3.5", isActive ? color : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-semibold", isActive ? color : "text-foreground")}>{label}</span>
                            {isActive && (
                              <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", color, activeBg)}>
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                        </div>
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
                          isActive ? `border-current ${color}` : "border-border"
                        )}>
                          {isActive && <div className={cn("w-2 h-2 rounded-full", color.replace("text-", "bg-"))} />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="py-3 border-b border-border/40">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Cloud Escalation Threshold</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        In Hybrid mode, emails scoring above this priority always use cloud AI.
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {routing?.cloudEscalationScore ?? 65}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={routing?.cloudEscalationScore ?? 65}
                    onChange={(e) => patchModelRouting.mutate({ cloudEscalationScore: Number(e.target.value) })}
                    disabled={(routing?.routingMode ?? "cloud") !== "hybrid"}
                    className="w-full accent-primary disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>1 (always cloud)</span>
                    <span>100 (only critical)</span>
                  </div>
                </div>

                {/* Status chips */}
                <div className="pt-3 flex flex-wrap gap-2">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border",
                    routing?.forceCloud
                      ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                      : "bg-secondary border-border text-muted-foreground"
                  )}>
                    <Cloud className="w-3 h-3" />
                    OpenAI Cloud {routing?.forceCloud ? "active" : "standby"}
                  </div>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border",
                    routing?.preferLocal && !routing?.forceCloud
                      ? "bg-green-500/10 border-green-500/20 text-green-400"
                      : "bg-secondary border-border text-muted-foreground"
                  )}>
                    <Cpu className="w-3 h-3" />
                    Local GPU {routing?.preferLocal && !routing?.forceCloud ? "preferred" : "off"}
                  </div>
                  {(routing?.routingMode ?? "cloud") === "hybrid" && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-violet-500/10 border-violet-500/20 text-violet-400">
                      <GitMerge className="w-3 h-3" />
                      Hybrid active
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── Tone & Reply Style ── */}
              <SectionCard title="Tone & Reply Style" icon={MessageSquare} accent="blue">
                <SelectRow
                  label="Default Reply Tone"
                  description="The AI will use this tone when generating reply variants."
                  value={tone?.preferredTone || "professional"}
                  options={[
                    { value: "professional", label: "Professional" },
                    { value: "friendly", label: "Friendly" },
                    { value: "brief", label: "Brief" },
                    { value: "formal", label: "Formal" },
                  ]}
                  onChange={(v) => patchToneProfile.mutate({ preferredTone: v })}
                />
                <SelectRow
                  label="Default Reply Length"
                  description="Preferred length for AI-generated reply variants."
                  value={tone?.avgReplyLength || "medium"}
                  options={[
                    { value: "short", label: "Short (1-2 sentences)" },
                    { value: "medium", label: "Medium (3-5 sentences)" },
                    { value: "long", label: "Long (full paragraph)" },
                  ]}
                  onChange={(v) => patchToneProfile.mutate({ avgReplyLength: v })}
                />

                {/* Learning stats */}
                <div className="py-3 border-b border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">AI Learning Data</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        The AI learns from your reply edits to match your writing style.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex-1 rounded-xl bg-secondary/50 p-3 border border-border/50">
                      <div className="text-xl font-bold text-foreground">
                        {tone?.editCount || "0"}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                        Reply edits learned
                      </div>
                    </div>
                    <div className="flex-1 rounded-xl bg-secondary/50 p-3 border border-border/50">
                      <div className="text-xl font-bold text-foreground">
                        {tone?.exampleReplies?.length || "0"}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                        Example replies stored
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clear learning */}
                <div className="pt-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Reset AI Learning</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Clears all stored reply examples and style hints.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Clear all AI learning data? This cannot be undone.")) {
                        resetLearning.mutate();
                      }
                    }}
                    disabled={resetLearning.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {resetLearning.isPending ? "Clearing…" : "Reset"}
                  </button>
                </div>
              </SectionCard>

              {/* ── Account ── */}
              <SectionCard title="Account" icon={User} accent="green">
                {isConnected && user ? (
                  <>
                    <div className="flex items-center gap-3 py-3 border-b border-border/40">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                          {user.name?.[0] || "?"}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Gmail connected
                      </div>
                    </div>

                    <div className="py-3 border-b border-border/40">
                      <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-amber-400">Re-authorization may be needed</span> if you haven't
                          reconnected Gmail since the <code className="text-[10px] bg-secondary px-1 py-0.5 rounded">gmail.send</code> scope was added.
                          Disconnect and reconnect Gmail to grant send permissions.
                        </div>
                      </div>
                    </div>

                    <div className="pt-3">
                      <button
                        onClick={logout}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Disconnect Gmail
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Gmail not connected. Connect from the sidebar to get started.
                  </div>
                )}
              </SectionCard>

              {/* ── About ── */}
              <div className="rounded-2xl border border-border bg-card/50 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center">
                    <Cpu className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">AI Email Copilot</p>
                    <p className="text-[10px] text-muted-foreground">3-stage hybrid pipeline · Superhuman-grade inbox</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">v2.0</span>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
