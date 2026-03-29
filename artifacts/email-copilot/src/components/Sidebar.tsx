import { Link, useLocation } from "wouter";
import { 
  Inbox, 
  Send, 
  Archive, 
  Trash2, 
  Settings, 
  Cpu, 
  RefreshCw 
} from "lucide-react";
import { useGetSyncStatus } from "@workspace/api-client-react";
import { useEmailActions } from "@/hooks/use-emails";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const { triggerSync } = useEmailActions();
  const { data: syncStatus } = useGetSyncStatus({
    query: {
      refetchInterval: (data) => data?.state?.data?.status === 'syncing' ? 2000 : false
    }
  });

  const navItems = [
    { icon: Inbox, label: "Smart Inbox", href: "/" },
    { icon: Send, label: "Sent", href: "/sent" },
    { icon: Archive, label: "Archive", href: "/archive" },
    { icon: Trash2, label: "Trash", href: "/trash" },
  ];

  return (
    <aside className="w-64 border-r border-border bg-background h-screen flex flex-col hidden lg:flex shrink-0 fixed left-0 top-0">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3 outline-none">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-lg shadow-primary/20">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">Copilot</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 outline-none",
              isActive 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "opacity-70")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <div className="rounded-2xl bg-secondary/50 p-4 border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sync Status</span>
            <button 
              onClick={() => triggerSync.mutate()}
              disabled={syncStatus?.status === 'syncing' || triggerSync.isPending}
              className="p-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4 text-muted-foreground", (syncStatus?.status === 'syncing' || triggerSync.isPending) && "animate-spin text-primary")} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              syncStatus?.status === 'syncing' ? "bg-primary animate-pulse" :
              syncStatus?.status === 'error' ? "bg-score-critical" : "bg-score-low"
            )} />
            <span className="text-sm font-medium text-foreground capitalize">
              {syncStatus?.status || 'Idle'}
            </span>
          </div>
          {syncStatus?.lastSyncAt && (
            <div className="text-xs text-muted-foreground mt-2">
              Last: {new Date(syncStatus.lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200 w-full mt-2">
          <Settings className="w-5 h-5 opacity-70" />
          Settings
        </button>
      </div>
    </aside>
  );
}
