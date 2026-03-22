import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  MessageCircleReply,
  TrendingUp,
  BarChart3,
  CalendarClock,
  AtSign,
  Settings,
  LogOut,
  Menu,
  X,
  Zap,
} from "lucide-react";
import { signOut } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { path: "/content", label: "Content Generator", icon: Sparkles, group: "ai" },
  { path: "/replies", label: "Reply Generator", icon: MessageCircleReply, group: "ai" },
  { path: "/trends", label: "Trend Explorer", icon: TrendingUp, group: "growth" },
  { path: "/analytics", label: "Analytics", icon: BarChart3, group: "growth" },
  { path: "/scheduler", label: "Scheduler", icon: CalendarClock, group: "growth" },
  { path: "/accounts", label: "Accounts", icon: AtSign, group: "settings" },
  { path: "/settings", label: "Settings", icon: Settings, group: "settings" },
] as const;

const GROUP_LABELS: Record<string, string> = {
  main: "Overview",
  ai: "AI Tools",
  growth: "Growth",
  settings: "Manage",
};

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const groups = [...new Set(NAV_ITEMS.map((i) => i.group))];

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 z-50 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="text-sidebar-foreground hover:text-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 gradient-brand rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gradient-brand">Xperience</span>
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 gradient-brand rounded-xl flex items-center justify-center glow-primary">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gradient-brand tracking-tight">Xperience</h1>
              <p className="text-[10px] text-muted-foreground font-mono tracking-widest">
                X GROWTH PLATFORM
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-sidebar-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 mb-1.5">
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20 glow-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-primary")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 w-full"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
