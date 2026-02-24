import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { MessageSquare, Mic, Target, Users, Zap, TrendingUp, Clock, Trophy, Coins } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Overview() {
  const { data: usersCount } = useQuery({
    queryKey: ["discord-users-count"],
    queryFn: async () => {
      const { count } = await supabase.from("discord_users").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: activeMissions } = useQuery({
    queryKey: ["active-missions-count"],
    queryFn: async () => {
      const { count } = await supabase.from("missions").select("*", { count: "exact", head: true }).eq("is_active", true);
      return count || 0;
    },
  });

  const { data: topUsers } = useQuery({
    queryKey: ["top-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("discord_users")
        .select("discord_id, username, points_total, rank_name, avatar_url")
        .order("points_total", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_events")
        .select("id, type, discord_id, points_awarded, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const { data: shopItemsCount } = useQuery({
    queryKey: ["shop-items-count"],
    queryFn: async () => {
      const { count } = await supabase.from("shop_items").select("*", { count: "exact", head: true }).eq("is_active", true);
      return count || 0;
    },
  });

  const { data: pendingOrders } = useQuery({
    queryKey: ["pending-orders-count"],
    queryFn: async () => {
      const { count } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "PENDING");
      return count || 0;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["pulse-hour-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").eq("key", "pulse_hour").single();
      return data?.value_json as { enabled: boolean; schedule: { day: number; hour: number }[] } | null;
    },
  });

  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  return (
    <DashboardLayout title="Vue globale" subtitle="Tableau de bord Pulse Engine">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard
          title="Membres trackés"
          value={usersCount ?? 0}
          icon={<Users className="w-5 h-5" />}
          variant="primary"
        />
        <StatCard
          title="Missions actives"
          value={activeMissions ?? 0}
          icon={<Target className="w-5 h-5" />}
          variant="accent"
        />
        <StatCard
          title="Items boutique"
          value={shopItemsCount ?? 0}
          icon={<Coins className="w-5 h-5" />}
          variant="warning"
        />
        <StatCard
          title="Commandes en attente"
          value={pendingOrders ?? 0}
          icon={<Zap className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          title="Messages aujourd'hui"
          value="—"
          subtitle="Bot requis"
          icon={<MessageSquare className="w-5 h-5" />}
        />
        <StatCard
          title="Vocal aujourd'hui"
          value="—"
          subtitle="Bot requis"
          icon={<Mic className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Users */}
        <div className="lg:col-span-2 glass rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Top membres</h2>
          </div>
          {topUsers && topUsers.length > 0 ? (
            <div className="space-y-3">
              {topUsers.map((user, i) => (
                <div key={user.discord_id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    i === 0 ? "gradient-primary text-primary-foreground" :
                    i === 1 ? "gradient-accent text-accent-foreground" :
                    i === 2 ? "gradient-success text-success-foreground" :
                    "bg-secondary text-secondary-foreground"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{user.username}</p>
                    <p className="text-xs text-muted-foreground font-mono">{user.rank_name}</p>
                  </div>
                  <span className="font-bold text-primary font-mono">{user.points_total} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucun membre tracké</p>
              <p className="text-xs mt-1">Les données apparaîtront quand le bot sera actif</p>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Pulse Hour */}
          <div className="glass rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-warning" />
              <h2 className="text-lg font-semibold text-foreground">Pulse Hour</h2>
            </div>
            {settings?.enabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-sm text-success font-medium">Activé</span>
                </div>
                <div className="space-y-2">
                  {settings.schedule?.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {dayNames[s.day]} à {s.hour}h00
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Non configuré</p>
            )}
          </div>

          {/* Recent Activity */}
          <div className="glass rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-foreground">Activité récente</h2>
            </div>
            {recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-2">
                {recentActivity.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-muted-foreground capitalize">{event.type}</span>
                    <span className="text-primary font-mono text-xs">+{event.points_awarded}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune activité récente</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
