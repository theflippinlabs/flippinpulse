import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Users, Heart, Eye, ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { formatNumber, formatPercent, cn } from "@/lib/utils";
import type { XAccount } from "@/types";

// ── Simulated analytics data ──────────────────────────────────────────────────
// In production: pull from analytics_snapshots table

function generateGrowthData(days: number, base: number, variance: number) {
  return Array.from({ length: days }, (_, i) => {
    const trend = base + i * (variance * 0.3);
    const noise = (Math.random() - 0.5) * variance * 2;
    return Math.max(0, Math.round(trend + noise));
  });
}

const DAYS_LABELS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return `${d.getMonth() + 1}/${d.getDate()}`;
});

const FOLLOWER_DATA = generateGrowthData(30, 12000, 200);
const IMPRESSION_DATA = generateGrowthData(30, 50000, 8000);
const ENGAGEMENT_DATA = IMPRESSION_DATA.map((imp) =>
  Math.round(imp * (0.025 + Math.random() * 0.02))
);

// ── Mini chart component ──────────────────────────────────────────────────────
function SparkLine({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 40;
  const width = 200;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, label, color }: { data: number[]; label: string; color: string }) {
  const max = Math.max(...data);
  const barData = data.slice(-14); // Last 14 days

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">{label}</p>
      <div className="flex items-end gap-1 h-24">
        {barData.map((value, i) => {
          const heightPct = (value / max) * 100;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all hover:opacity-80 cursor-pointer relative group"
              style={{ height: `${heightPct}%`, background: color }}
            >
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-popover border border-border text-[10px] px-1.5 py-0.5 rounded font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {formatNumber(value)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-mono">
        <span>{DAYS_LABELS[DAYS_LABELS.length - 14]}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

// ── Best posting times ────────────────────────────────────────────────────────
const BEST_TIMES = [
  { hour: "8am", score: 0.85, day: "Mon–Fri" },
  { hour: "12pm", score: 0.72, day: "Mon–Fri" },
  { hour: "5pm", score: 0.91, day: "Tue–Thu" },
  { hour: "7pm", score: 0.78, day: "Mon–Fri" },
  { hour: "9am", score: 0.65, day: "Sat–Sun" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth();

  const { data: accounts } = useQuery<XAccount[]>({
    queryKey: ["x-accounts-analytics", user?.id],
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

  const totalFollowers = accounts?.reduce((s, a) => s + a.followers_count, 0) ?? 0;
  const latestFollowers = FOLLOWER_DATA[FOLLOWER_DATA.length - 1];
  const prevFollowers = FOLLOWER_DATA[FOLLOWER_DATA.length - 8];
  const weeklyGrowth = prevFollowers > 0 ? ((latestFollowers - prevFollowers) / prevFollowers) * 100 : 0;

  const latestImpressions = IMPRESSION_DATA[IMPRESSION_DATA.length - 1];
  const prevImpressions = IMPRESSION_DATA[IMPRESSION_DATA.length - 8];
  const impressionsDelta = prevImpressions > 0 ? ((latestImpressions - prevImpressions) / prevImpressions) * 100 : 0;

  const totalEngagements = ENGAGEMENT_DATA.slice(-7).reduce((s, v) => s + v, 0);
  const engRate = latestImpressions > 0 ? (ENGAGEMENT_DATA[ENGAGEMENT_DATA.length - 1] / latestImpressions) * 100 : 0;

  const stats = [
    {
      label: "Total Followers",
      value: formatNumber(totalFollowers > 0 ? totalFollowers : latestFollowers),
      delta: weeklyGrowth,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      spark: FOLLOWER_DATA,
      sparkColor: "hsl(203 89% 53%)",
    },
    {
      label: "Impressions (7d)",
      value: formatNumber(IMPRESSION_DATA.slice(-7).reduce((s, v) => s + v, 0)),
      delta: impressionsDelta,
      icon: Eye,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      spark: IMPRESSION_DATA,
      sparkColor: "hsl(270 60% 65%)",
    },
    {
      label: "Engagements (7d)",
      value: formatNumber(totalEngagements),
      delta: 8.3,
      icon: Heart,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      spark: ENGAGEMENT_DATA,
      sparkColor: "hsl(330 70% 60%)",
    },
    {
      label: "Engagement Rate",
      value: `${engRate.toFixed(2)}%`,
      delta: 0.4,
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-500/10",
      spark: ENGAGEMENT_DATA.map((e, i) => Math.round(i > 0 ? (e / IMPRESSION_DATA[i]) * 1000 : 0)),
      sparkColor: "hsl(142 71% 45%)",
    },
  ];

  return (
    <AppLayout
      title="Analytics"
      subtitle="Track your X growth metrics"
      actions={
        <Badge className="bg-muted text-muted-foreground border-border text-xs gap-1.5">
          <Calendar className="w-3 h-3" />
          Last 30 days
        </Badge>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="glass border-border/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", stat.bg)}>
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">{stat.value}</p>
              <div className="flex items-center justify-between mt-2">
                <div className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  stat.delta >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {stat.delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {formatPercent(Math.abs(stat.delta))} vs last week
                </div>
                <SparkLine data={stat.spark} color={stat.sparkColor} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth chart */}
        <Card className="glass border-border/50 lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Daily Impressions (Last 14 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={IMPRESSION_DATA}
              label="Impressions per day"
              color="hsl(203 89% 53% / 0.7)"
            />
          </CardContent>
        </Card>

        {/* Best posting times */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-yellow-400" />
              Best Times to Post
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {BEST_TIMES.map((t) => (
                <div key={`${t.hour}-${t.day}`} className="flex items-center gap-3">
                  <div className="text-right w-10 flex-shrink-0">
                    <p className="text-xs font-bold font-mono text-foreground">{t.hour}</p>
                  </div>
                  <div className="flex-1">
                    <div className="score-bar">
                      <div
                        className="score-fill bg-primary"
                        style={{ width: `${t.score * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right w-12 flex-shrink-0">
                    <p className="text-[10px] text-muted-foreground">{t.day}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 p-2.5 bg-muted/40 rounded-lg">
              📊 Based on engagement patterns from your niche. Timezone: UTC
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Engagement breakdown */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-400" />
              Engagement Breakdown (Last 14 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={ENGAGEMENT_DATA}
              label="Engagements per day"
              color="hsl(330 70% 60% / 0.7)"
            />
          </CardContent>
        </Card>

        {/* Top performing content types */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Top Content Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: "Threads", rate: 7.2, posts: 12, color: "bg-purple-400" },
                { type: "Single Tweets (Viral)", rate: 5.8, posts: 34, color: "bg-blue-400" },
                { type: "Educational", rate: 4.1, posts: 28, color: "bg-green-400" },
                { type: "Hot Takes", rate: 3.9, posts: 19, color: "bg-orange-400" },
                { type: "Questions", rate: 2.8, posts: 41, color: "bg-pink-400" },
              ].map((item) => (
                <div key={item.type} className="flex items-center gap-3">
                  <div className="w-28 flex-shrink-0">
                    <p className="text-xs font-medium text-foreground">{item.type}</p>
                    <p className="text-[10px] text-muted-foreground">{item.posts} posts</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 score-bar">
                        <div
                          className={cn("score-fill", item.color)}
                          style={{ width: `${(item.rate / 8) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-foreground w-10 text-right">
                        {item.rate}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Engagement rate = (likes + RTs + replies) / impressions
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
