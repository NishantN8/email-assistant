import { useQuery } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface AiStatus {
  gpu: {
    available: boolean;
    name: string | null;
    memoryFree: number | null;
    memoryTotal: number | null;
    utilizationPct: number | null;
  };
}

const API_BASE = import.meta.env.VITE_API_URL || "";

function useGpuStatus() {
  return useQuery<AiStatus>({
    queryKey: ["ai-status-gpu"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${API_BASE}/api/ai/status`, {
        credentials: "include",
        signal,
      });
      if (!res.ok) throw new Error("Failed to fetch AI status");
      return res.json();
    },
  });
}

export function GpuWidget() {
  const { data, isLoading } = useGpuStatus();

  if (isLoading) {
    return (
      <div className="h-9 w-28 rounded-xl bg-secondary/40 animate-pulse shrink-0" />
    );
  }

  const gpu = data?.gpu;
  const available = gpu?.available === true;

  if (!available) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-xl border shrink-0",
          "text-zinc-500 bg-zinc-500/8 border-zinc-500/15"
        )}
      >
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-zinc-500/10">
          <Cpu className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="text-left">
          <div className="text-[13px] font-bold leading-none text-zinc-500">offline</div>
          <div className="text-[10px] opacity-60 mt-0.5 whitespace-nowrap">GPU</div>
        </div>
      </motion.div>
    );
  }

  const util = gpu.utilizationPct ?? 0;
  const vramUsed = gpu.memoryTotal != null && gpu.memoryFree != null
    ? Math.round((gpu.memoryTotal - gpu.memoryFree) / 1024)
    : null;
  const vramTotal = gpu.memoryTotal != null
    ? Math.round(gpu.memoryTotal / 1024)
    : null;

  const utilColor =
    util >= 80
      ? "text-red-400 bg-red-400/8 border-red-400/15"
      : util >= 50
      ? "text-orange-400 bg-orange-400/8 border-orange-400/15"
      : "text-emerald-400 bg-emerald-400/8 border-emerald-400/15";

  const iconColor =
    util >= 80 ? "text-red-400" : util >= 50 ? "text-orange-400" : "text-emerald-400";

  const iconBg =
    util >= 80 ? "bg-red-400/10" : util >= 50 ? "bg-orange-400/10" : "bg-emerald-400/10";

  const shortName = gpu.name
    ? gpu.name.replace(/NVIDIA\s*/i, "").replace(/GeForce\s*/i, "").trim().split(" ")[0]
    : "GPU";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-xl border shrink-0",
        utilColor
      )}
      title={gpu.name ?? "GPU"}
    >
      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", iconBg)}>
        <Cpu className={cn("w-3.5 h-3.5", iconColor)} />
      </div>
      <div className="text-left min-w-0">
        <div className="text-[13px] font-bold tabular-nums leading-none">
          {util}%
          {vramUsed != null && vramTotal != null && (
            <span className="font-normal opacity-70 text-[11px] ml-1">
              {vramUsed}/{vramTotal}G
            </span>
          )}
        </div>
        <div className="text-[10px] opacity-60 mt-0.5 whitespace-nowrap">{shortName}</div>
      </div>
    </motion.div>
  );
}
