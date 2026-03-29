import { Link, useLocation } from "wouter";
import {
  Inbox,
  Send,
  Archive,
  Trash2,
  Settings,
  Cpu,
  RefreshCw,
  Mail,
  LogOut,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import { useGetSyncStatus } from "@workspace/api-client-react";
import { useEmailActions } from "@/hooks/use-emails";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Sidebar() {
  const [location] = useLocation();
  const { triggerSync } = useEmailActions();
  const { user, isConnected, connectGmail, logout } = useAuth();

  const { data: syncStatus } = useGetSyncStatus({
    query: {
      refetchInterval: (data) =>
        data?.state?.data?.status === "syncing" ? 2000 : false,
    },
  });

  const navItems = [
    { icon: Inbox, label: "Smart Inbox", href: "/" },
    { icon: Send, label: "Sent", href: "/sent" },
    { icon: Archive, label: "Archive", href: "/archive" },
    { icon: Trash2, label: "Trash", href: "/trash" },
  ];

  return (
    <aside className="w-64 border-r border-border bg-background h-screen flex flex-col hidden lg:flex shrink-0 fixed left-0 top-0">
      {/* Logo */}
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3 outline-none">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-lg shadow-primary/20">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">
            Copilot
          </span>
        </Link>
      </div>

      {/* Gmail Connection Banner */}
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3"
        >
          <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
            Connect Gmail to sync your real inbox
          </p>
          <button
            onClick={connectGmail}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
          >
            <Mail className="w-3.5 h-3.5" />
            Connect Gmail
          </button>
        </motion.div>
      )}

      {/* Connected account */}
      {isConnected && user && (
        <div className="mx-4 mb-4 rounded-xl border border-green-500/20 bg-green-500/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
              Gmail Connected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold">
                {user.name?.[0] ?? user.email?.[0] ?? "?"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 outline-none",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon
                className={cn("w-5 h-5", isActive ? "text-primary" : "opacity-70")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 mt-auto space-y-2">
        {/* Sync status */}
        <div className="rounded-2xl bg-secondary/50 p-4 border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sync Status
            </span>
            <button
              onClick={() => triggerSync.mutate()}
              disabled={
                syncStatus?.status === "syncing" || triggerSync.isPending
              }
              className="p-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
              title="Sync now"
            >
              <RefreshCw
                className={cn(
                  "w-4 h-4 text-muted-foreground",
                  (syncStatus?.status === "syncing" || triggerSync.isPending) &&
                    "animate-spin text-primary"
                )}
              />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                syncStatus?.status === "syncing"
                  ? "bg-primary animate-pulse"
                  : syncStatus?.status === "error"
                  ? "bg-score-critical"
                  : "bg-score-low"
              )}
            />
            <span className="text-sm font-medium text-foreground capitalize">
              {syncStatus?.status || "Idle"}
            </span>
          </div>
          {syncStatus?.message && (
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              {syncStatus.message}
            </p>
          )}
          {syncStatus?.lastSyncAt && (
            <div className="text-xs text-muted-foreground mt-1">
              Last: {new Date(syncStatus.lastSyncAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Settings / Logout */}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 w-full",
            location === "/settings"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <Settings className={cn("w-5 h-5", location === "/settings" ? "text-primary" : "opacity-70")} />
          Settings
        </Link>

        {isConnected && (
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-secondary hover:text-destructive transition-all duration-200 w-full"
          >
            <LogOut className="w-5 h-5 opacity-70" />
            Disconnect Gmail
          </button>
        )}
      </div>
    </aside>
  );
}
