import { useState } from "react";
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
  Menu,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { useLanguage } from "@/i18n/LanguageContext";
import { translations } from "@/i18n/translations";

export function DashboardSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  const navItems = [
    { path: "/", label: t(translations.nav.overview), icon: LayoutDashboard },
    { path: "/configuration", label: t(translations.nav.configuration), icon: Settings },
    { path: "/missions", label: t(translations.nav.missions), icon: Target },
    { path: "/boutique", label: t(translations.nav.shop), icon: ShoppingBag },
    { path: "/transactions", label: t(translations.nav.transactions), icon: ArrowLeftRight },
    { path: "/commandes", label: t(translations.nav.orders), icon: Package },
    { path: "/mini-jeux", label: t(translations.nav.miniGames), icon: Gamepad2 },
    { path: "/utilisateurs", label: t(translations.nav.users), icon: Users },
    { path: "/logs", label: t(translations.nav.logs), icon: ScrollText },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 z-50 lg:hidden">
        <button onClick={() => setOpen(true)} className="text-sidebar-foreground hover:text-foreground">
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <img src={logo} alt="Pulse Engine" className="w-8 h-8 rounded-lg object-contain" />
          <span className="text-sm font-bold text-gradient-logo">Pulse Engine</span>
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Pulse Engine" className="w-11 h-11 rounded-lg object-contain" />
            <div>
              <h1 className="text-lg font-bold text-gradient-logo tracking-tight">Pulse Engine</h1>
              <p className="text-[10px] text-muted-foreground font-mono tracking-widest">by The Flippin' Labs</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-sidebar-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
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
            {t(translations.nav.logout)}
          </button>
        </div>
      </aside>
    </>
  );
}
