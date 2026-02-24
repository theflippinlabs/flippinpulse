import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  Target,
  Users,
  ScrollText,
  LogOut,
  ShoppingBag,
  ArrowLeftRight,
  Package,
  Gamepad2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";

const navItems = [
  { path: "/", label: "Vue globale", icon: LayoutDashboard },
  { path: "/configuration", label: "Configuration", icon: Settings },
  { path: "/missions", label: "Missions", icon: Target },
  { path: "/boutique", label: "Boutique", icon: ShoppingBag },
  { path: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { path: "/commandes", label: "Commandes", icon: Package },
  { path: "/mini-jeux", label: "Mini-Jeux", icon: Gamepad2 },
  { path: "/utilisateurs", label: "Utilisateurs", icon: Users },
  { path: "/logs", label: "Logs", icon: ScrollText },
];

export function DashboardSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Pulse Engine" className="w-11 h-11 rounded-lg object-contain" />
          <div>
            <h1 className="text-lg font-bold text-gradient-logo tracking-tight">Pulse Engine</h1>
            <p className="text-[10px] text-muted-foreground font-mono tracking-widest">by The Flippin' Labs</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary glow-primary border border-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 w-full"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
