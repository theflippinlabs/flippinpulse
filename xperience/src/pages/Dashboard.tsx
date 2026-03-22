import { useQuery } from "@tanstack/react-query";
import {
  Users, TrendingUp, BarChart3, Sparkles, ArrowUpRight,
  ArrowDownRight, Zap, Target, Clock, CalendarClock,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { fetchTrends } from "@/lib/trends";
import { formatNumber, formatPercent, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { XAccount, ContentDraft } from "@/types";

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  delta?: number;
  icon: React.ReactNode;
  color: "blue" | "purple" | "green" | "orange";
  loading?: boolean;
}

function StatCard({ title, value, delta, icon, color, loading }: StatCardProps) {
  const colorMap = {
    blue: "bg-blue-500/10 text-blue-400",
    purple: "bg-purple-500/10 text-purple-400",
    green: "bg-green-500/10 text-green-400",
    orange: "bg-orange-500/10 text-orange-400",
  };

  if (loading) {
    return (
      <Card className="glass border-border/50">
        <CardContent className="p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-20 mb-2" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-border/50 hover:border-border transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colorMap[color])}>
            {icon}
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
        {delta !== undefined && (
          <div className={cn(
            "flex items-center gap-1 mt-1.5 text-xs font-medium",
            delta >= 0 ? "text-green-400" : "text-red-400"
          )}>
            {delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {formatPercent(Math.abs(delta))} this week
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();

  const { data: accounts, isLoading: accountsLoading } = useQuery<XAccount[]>({
    queryKey: ["x-accounts", user?.id],
    queryFn: async (): Promise<XAccount[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("x_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_connected", true);
      return (data as XAccount[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: draftsCount } = useQuery({
    queryKey: ["drafts-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("content_drafts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "draft");
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: scheduledCount } = useQuery({
    queryKey: ["scheduled-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("content_drafts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "scheduled");
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: recentPosts } = useQuery<ContentDraft[]>({
    queryKey: ["recent-posts", user?.id],
    queryFn: async (): Promise<ContentDraft[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("content_drafts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data as ContentDraft[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: topTrends } = useQuery({
    queryKey: ["top-trends-dashboard"],
    queryFn: () => fetchTrends("all", "24h"),
    staleTime: 5 * 60_000,
    select: (data) => data.slice(0, 5),
  });

  // Aggregate stats from connected accounts
  const totalFollowers = accounts?.reduce((sum, a) => sum + a.followers_count, 0) ?? 0;

  // Simulated growth data (replace with analytics_snapshots queries)
  const weeklyGrowth = accounts && accounts.length > 0 ? 4.2 : 0;
  const engagementRate = accounts && accounts.length > 0 ? 3.7 : 0;

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Your X growth overview"
      actions={
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      }
    >
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Followers"
          value={formatNumber(totalFollowers)}
          delta={weeklyGrowth}
          icon={<Users className="w-4 h-4" />}
          color="blue"
          loading={accountsLoading}
        />
        <StatCard
          title="Engagement Rate"
          value={`${engagementRate}%`}
          delta={0.3}
          icon={<TrendingUp className="w-4 h-4" />}
          color="green"
          loading={accountsLoading}
        />
        <StatCard
          title="Saved Drafts"
          value={draftsCount ?? 0}
          icon={<Sparkles className="w-4 h-4" />}
          color="purple"
        />
        <StatCard
          title="Scheduled Posts"
          value={scheduledCount ?? 0}
          icon={<CalendarClock className="w-4 h-4" />}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected accounts */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Connected Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accountsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : accounts && accounts.length > 0 ? (
              <div className="space-y-3">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <div className="w-9 h-9 rounded-full gradient-x flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {account.display_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {account.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">@{account.handle}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-primary font-mono">
                        {formatNumber(account.followers_count)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">followers</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No accounts connected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go to <span className="text-primary">Accounts</span> to connect your first X account
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top trending topics */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Trending Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!topTrends ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {topTrends.map((trend, i) => (
                  <div key={trend.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-bold text-muted-foreground font-mono w-4 text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {trend.hashtag}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {formatNumber(trend.tweetCount)} posts
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        trend.momentum === "rising"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      {trend.score}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions + recent content */}
        <div className="space-y-4">
          {/* Quick actions */}
          <Card className="glass border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Generate a tweet", href: "/content", icon: Sparkles, color: "text-purple-400" },
                { label: "Craft a reply", href: "/replies", icon: Target, color: "text-blue-400" },
                { label: "Explore trends", href: "/trends", icon: TrendingUp, color: "text-green-400" },
                { label: "View analytics", href: "/analytics", icon: BarChart3, color: "text-orange-400" },
              ].map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 group"
                >
                  <action.icon className={cn("w-4 h-4 flex-shrink-0", action.color)} />
                  {action.label}
                  <ArrowUpRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </CardContent>
          </Card>

          {/* Recent drafts */}
          <Card className="glass border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Recent Drafts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentPosts && recentPosts.length > 0 ? (
                <div className="space-y-2">
                  {recentPosts.map((post) => (
                    <div key={post.id} className="p-2.5 rounded-lg bg-muted/40">
                      <p className="text-xs text-foreground line-clamp-2">{post.content}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0 border",
                            post.status === "scheduled"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {post.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {post.content.length}/280
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No drafts yet — generate your first tweet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
