import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, User, TrendingUp, Award } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { translations } from "@/i18n/translations";

export default function Utilisateurs() {
  const [search, setSearch] = useState("");
  const { t, locale } = useLanguage();
  const L = translations.users;

  const { data: users } = useQuery({
    queryKey: ["all-discord-users"],
    queryFn: async () => {
      const { data } = await supabase.from("discord_users").select("*").order("points_total", { ascending: false });
      return data || [];
    },
  });

  const filtered = users?.filter((u) => u.username.toLowerCase().includes(search.toLowerCase()) || u.discord_id.includes(search));

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const selected = users?.find((u) => u.discord_id === selectedUser);

  const { data: userActivity } = useQuery({
    queryKey: ["user-activity", selectedUser],
    enabled: !!selectedUser,
    queryFn: async () => {
      const { data } = await supabase.from("activity_events").select("*").eq("discord_id", selectedUser!).order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
  });

  const exportCSV = () => {
    if (!users) return;
    const headers = "Username,Discord ID,Points Total,Points Week,Points Month,Rank,Streak\n";
    const rows = users.map((u) => `${u.username},${u.discord_id},${u.points_total},${u.points_week},${u.points_month},${u.rank_name},${u.streak}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "users_pulse.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout title={t(L.title)} subtitle={t(L.subtitle)}>
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(L.searchPlaceholder)} className="w-full h-10 pl-10 pr-4 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={exportCSV} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted transition-colors">
          <Download className="w-4 h-4" /> {t(L.exportCsv)}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">#</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t(L.user)}</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t(L.rank)}</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t(L.points)}</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">PULSE</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t(L.streak)}</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((user, i) => (
                <tr key={user.discord_id} onClick={() => setSelectedUser(user.discord_id)} className={`border-b border-border/50 cursor-pointer transition-colors ${selectedUser === user.discord_id ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{i + 1}</td>
                  <td className="py-3 px-4"><p className="font-medium text-foreground">{user.username}</p><p className="text-xs text-muted-foreground font-mono">{user.discord_id}</p></td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{user.rank_name}</span></td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-primary">{user.points_total}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-warning">{user.balance_pulse}</td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">{user.streak}{locale === "fr" ? "j" : "d"}</td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">{t(L.noUserFound)}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glass rounded-xl border border-border p-6">
          {selected ? (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center"><User className="w-6 h-6 text-primary-foreground" /></div>
                <div><h3 className="font-bold text-foreground">{selected.username}</h3><p className="text-xs text-muted-foreground font-mono">{selected.discord_id}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t(L.totalPoints)}</p><p className="text-lg font-bold text-primary font-mono">{selected.points_total}</p></div>
                <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t(L.week)}</p><p className="text-lg font-bold text-foreground font-mono">{selected.points_week}</p></div>
                <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t(L.month)}</p><p className="text-lg font-bold text-foreground font-mono">{selected.points_month}</p></div>
                <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">{t(L.streak)}</p><p className="text-lg font-bold text-warning font-mono">{selected.streak}{locale === "fr" ? "j" : "d"}</p></div>
              </div>
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-warning mb-2">💰 {t(L.wallet)}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="text-[10px] text-muted-foreground">{t(L.balance)}</p><p className="text-sm font-bold text-warning font-mono">{selected.balance_pulse}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">{t(L.earned)}</p><p className="text-sm font-bold text-success font-mono">{selected.lifetime_earned_pulse}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">{t(L.spent)}</p><p className="text-sm font-bold text-destructive font-mono">{selected.lifetime_spent_pulse}</p></div>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3"><Award className="w-4 h-4 text-accent" /><h4 className="text-sm font-semibold text-foreground">{t(L.rankLabel)} : {selected.rank_name}</h4></div>
              <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-primary" /><h4 className="text-sm font-semibold text-foreground">{t(L.recentActivity)}</h4></div>
              <div className="space-y-2 max-h-48 overflow-auto">
                {userActivity?.map((event) => (
                  <div key={event.id} className="flex justify-between text-xs py-1.5 border-b border-border/30">
                    <span className="text-muted-foreground capitalize">{event.type}</span>
                    <span className="text-primary font-mono">+{event.points_awarded}</span>
                  </div>
                ))}
                {(!userActivity || userActivity.length === 0) && <p className="text-xs text-muted-foreground">{t(L.noActivity)}</p>}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t(L.selectUser)}</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
