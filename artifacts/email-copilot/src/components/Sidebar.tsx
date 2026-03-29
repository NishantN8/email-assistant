import { useEffect, useRef } from "react";
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Zap,
  AlertCircle,
  Clock,
  CheckCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSyncStatus, getGetEmailsQueryKey, getGetInboxSummaryQueryKey } from "@workspace/api-client-react";
import { useEmailActions } from "@/hooks/use-emails";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { triggerSync } = useEmailActions();
  const { user, isConnected, connectGmail, logout } = useAuth();
  const queryClient = useQueryClient();
  const prevSyncStatus = useRef<string | undefined>(undefined);

  const { data: syncStatus } = useGetSyncStatus({
    query: {
      // Poll every 2s while syncing, every 30s otherwise (catches server-side syncs too)
      refetchInterval: (data) =>
        data?.state?.data?.status === "syncing" ? 2000 : 30000,
    },
  });

  // When sync transitions syncing → idle, refresh the email list so new emails appear
  useEffect(() => {
    const current = syncStatus?.status;
    const prev = prevSyncStatus.current;
    if (prev === "syncing" && current === "idle") {
      queryClient.invalidateQueries({ queryKey: getGetEmailsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInboxSummaryQueryKey() });
    }
    prevSyncStatus.current = current;
  }, [syncStatus?.status, queryClient]);

  const navItems = [
    { icon: Inbox, label: "Smart Inbox", href: "/" },
    { icon: Send, label: "Sent", href: "/sent" },
    { icon: Archive, label: "Archive", href: "/archive" },
    { icon: Trash2, label: "Trash", href: "/trash" },
    { icon: Zap, label: "Action Feed", href: "/action-feed" },
  ];

  const taskStatusItems = [
    { icon: AlertCircle, label: "Needs Action", href: "/action-feed?status=needs_action", color: "text-red-400" },
    { icon: Clock, label: "In Progress", href: "/action-feed?status=in_progress", color: "text-yellow-400" },
    { icon: CheckCheck, label: "Done", href: "/action-feed?status=done", color: "text-green-400" },
  ];

  return (
    <motion.aside
      animate={{ width: collapsed ? 56 : 256 }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className="border-r border-border bg-background h-screen flex flex-col hidden lg:flex shrink-0 fixed left-0 top-0 overflow-hidden z-30"
    >
      {/* Logo + toggle */}
      <div className={cn("p-4 flex items-center", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-3 outline-none">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground whitespace-nowrap">
              Copilot
            </span>
          </Link>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Cpu className="w-5 h-5 text-white" />
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            "p-1 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0",
            collapsed && "absolute right-0 top-4 translate-x-0"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Gmail Connection Banner */}
      <AnimatePresence>
        {!isConnected && !collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
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
      </AnimatePresence>

      {/* Collapsed: connect gmail icon */}
      {!isConnected && collapsed && (
        <button
          onClick={connectGmail}
          className="mx-2 mb-2 p-2 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center hover:bg-primary/20 transition-colors"
          title="Connect Gmail"
        >
          <Mail className="w-4 h-4 text-primary" />
        </button>
      )}

      {/* Connected account */}
      <AnimatePresence>
        {isConnected && user && !collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mb-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3"
          >
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
                  className="w-6 h-6 rounded-full shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold shrink-0">
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connected account collapsed: avatar */}
      {isConnected && user && collapsed && (
        <div className="mx-2 mb-2 flex justify-center" title={user.email}>
          {user.picture ? (
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-[11px] font-bold text-green-400">
              {user.name?.[0] ?? user.email?.[0] ?? "?"}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2.5 rounded-xl font-medium transition-all duration-200 outline-none",
                collapsed && "justify-center",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon
                className={cn("w-5 h-5 shrink-0", isActive ? "text-primary" : "opacity-70")}
              />
              {!collapsed && item.label}
            </Link>
          );
        })}

        <div className="pt-1 pb-0.5">
          <p className="px-3 text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Task Status</p>
          {taskStatusItems.map((item) => {
            const isActive = location.startsWith("/action-feed") && location.includes(item.href.split("?")[1] ?? "XXXX");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 outline-none",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", item.color)} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className={cn("p-2 mt-auto space-y-1", collapsed && "px-2")}>
        {/* Sync status */}
        {!collapsed ? (
          <div className="rounded-2xl bg-secondary/50 p-3 border border-border/50 mb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Sync Status
              </span>
              <button
                onClick={() => triggerSync.mutate()}
                disabled={syncStatus?.status === "syncing" || triggerSync.isPending}
                className="p-1 rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
                title="Sync now"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5 text-muted-foreground",
                    (syncStatus?.status === "syncing" || triggerSync.isPending) &&
                      "animate-spin text-primary"
                  )}
                />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  syncStatus?.status === "syncing"
                    ? "bg-primary animate-pulse"
                    : syncStatus?.status === "error"
                    ? "bg-score-critical"
                    : "bg-score-low"
                )}
              />
              <span className="text-xs font-medium text-foreground capitalize">
                {syncStatus?.status || "Idle"}
              </span>
            </div>
            {syncStatus?.message && (
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                {syncStatus.message}
              </p>
            )}
            {syncStatus?.lastSyncAt && (
              <div className="text-[10px] text-muted-foreground mt-1">
                Last: {new Date(syncStatus.lastSyncAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => triggerSync.mutate()}
            disabled={syncStatus?.status === "syncing" || triggerSync.isPending}
            className="w-full flex justify-center p-2 rounded-xl hover:bg-secondary transition-colors disabled:opacity-50 mb-1"
            title={`Sync — ${syncStatus?.status || "Idle"}`}
          >
            <RefreshCw
              className={cn(
                "w-4 h-4 text-muted-foreground",
                (syncStatus?.status === "syncing" || triggerSync.isPending) &&
                  "animate-spin text-primary"
              )}
            />
          </button>
        )}

        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 px-2.5 py-2.5 rounded-xl font-medium transition-all duration-200 w-full",
            collapsed && "justify-center",
            location === "/settings"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <Settings className={cn("w-5 h-5 shrink-0", location === "/settings" ? "text-primary" : "opacity-70")} />
          {!collapsed && "Settings"}
        </Link>

        {isConnected && (
          <button
            onClick={logout}
            title={collapsed ? "Disconnect Gmail" : undefined}
            className={cn(
              "flex items-center gap-3 px-2.5 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-secondary hover:text-destructive transition-all duration-200 w-full",
              collapsed && "justify-center"
            )}
          >
            <LogOut className="w-5 h-5 opacity-70 shrink-0" />
            {!collapsed && "Disconnect Gmail"}
          </button>
        )}
      </div>
    </motion.aside>
  );
}
