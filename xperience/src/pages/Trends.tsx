import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Sparkles, RefreshCw, Flame, ArrowUp, ArrowRight, ArrowDown, Filter } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTrends, getCategoryColor, type TrendCategory, type ScoredTrend } from "@/lib/trends";
import { formatNumber, cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type TimeRange = "1h" | "24h" | "7d";

const CATEGORIES: { value: TrendCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI" },
  { value: "tech", label: "Tech" },
  { value: "business", label: "Business" },
  { value: "crypto", label: "Crypto" },
  { value: "science", label: "Science" },
  { value: "entertainment", label: "Entertainment" },
  { value: "sports", label: "Sports" },
];

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
];

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="score-bar">
        <div className={cn("score-fill", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MomentumIcon({ momentum }: { momentum: ScoredTrend["momentum"] }) {
  if (momentum === "rising") return <ArrowUp className="w-3 h-3 text-green-400" />;
  if (momentum === "falling") return <ArrowDown className="w-3 h-3 text-red-400" />;
  return <ArrowRight className="w-3 h-3 text-muted-foreground" />;
}

function TrendCard({ trend, rank, onGenerateContent }: {
  trend: ScoredTrend;
  rank: number;
  onGenerateContent: (hashtag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={cn(
      "glass border-border/50 hover:border-border transition-all duration-200",
      rank <= 3 && "border-primary/20"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Rank */}
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5",
            rank === 1 ? "gradient-brand text-white" :
            rank === 2 ? "gradient-x text-white" :
            rank === 3 ? "gradient-growth text-white" :
            "bg-muted text-muted-foreground"
          )}>
            {rank}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{trend.hashtag}</h3>
                <MomentumIcon momentum={trend.momentum} />
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className={cn("text-[10px] px-2 py-0 border", getCategoryColor(trend.category))}>
                  {trend.category}
                </Badge>
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono",
                  trend.score >= 80 ? "bg-yellow-500/10 text-yellow-400" :
                  trend.score >= 60 ? "bg-green-500/10 text-green-400" :
                  "bg-muted text-muted-foreground"
                )}>
                  {trend.score >= 80 && <Flame className="w-2.5 h-2.5" />}
                  {trend.score}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-0.5 truncate">{trend.topic}</p>

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">{formatNumber(trend.tweetCount)} posts</span>
              <span>{(trend.avgEngagementRate * 100).toFixed(1)}% engagement</span>
              <span className={cn(
                "font-medium",
                trend.momentum === "rising" ? "text-green-400" :
                trend.momentum === "falling" ? "text-red-400" : "text-muted-foreground"
              )}>
                {trend.momentum}
              </span>
            </div>

            {/* Expanded: score breakdown + samples */}
            {expanded && (
              <div className="mt-4 space-y-3 pt-3 border-t border-border">
                {/* Score breakdown */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Score Breakdown
                  </p>
                  <div className="space-y-1.5">
                    <ScoreBar label="Volume" value={trend.scoreBreakdown.volume} color="bg-blue-400" />
                    <ScoreBar label="Velocity" value={trend.scoreBreakdown.velocity} color="bg-green-400" />
                    <ScoreBar label="Engagement" value={trend.scoreBreakdown.engagement} color="bg-purple-400" />
                    <ScoreBar label="Recency" value={trend.scoreBreakdown.recency} color="bg-orange-400" />
                  </div>
                </div>

                {/* Sample tweets */}
                {trend.sampleTweets.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Sample Tweets
                    </p>
                    <div className="space-y-2">
                      {trend.sampleTweets.map((tweet, i) => (
                        <div key={i} className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
                          "{tweet}"
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? "Show less ↑" : "Details ↓"}
              </button>
              <span className="text-border">·</span>
              <button
                onClick={() => onGenerateContent(trend.hashtag)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                <Sparkles className="w-3 h-3" />
                Generate content
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Trends() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<TrendCategory | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  const { data: trends, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["trends", category, timeRange],
    queryFn: () => fetchTrends(category, timeRange),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const handleGenerateContent = (hashtag: string) => {
    navigate(`/content?topic=${encodeURIComponent(hashtag)}`);
    toast.info(`Opening Content Generator for ${hashtag}`);
  };

  const handleRefresh = () => {
    refetch();
    toast.info("Refreshing trends…");
  };

  const topTrend = trends?.[0];

  return (
    <AppLayout
      title="Trend Explorer"
      subtitle="Real-time trending topics with scoring algorithm"
      actions={
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching} className="gap-2">
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {/* Top trend spotlight */}
      {topTrend && !isLoading && (
        <Card className="glass border-primary/20 glow-primary mb-6">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 gradient-brand rounded-xl flex items-center justify-center">
                  <Flame className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    🔥 Top Trend Right Now
                  </p>
                  <h2 className="text-xl font-bold text-foreground">{topTrend.hashtag}</h2>
                  <p className="text-sm text-muted-foreground">{topTrend.topic}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary font-mono">{topTrend.score}</p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground font-mono">
                    {formatNumber(topTrend.tweetCount)}
                  </p>
                  <p className="text-xs text-muted-foreground">Tweets</p>
                </div>
                <Button
                  onClick={() => handleGenerateContent(topTrend.hashtag)}
                  className="gradient-ai text-white border-0 hover:opacity-90"
                  size="sm"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Generate Content
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Filter:</span>
        </div>

        {/* Categories */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all border",
                category === cat.value
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium font-mono transition-all",
                timeRange === tr.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trends list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="glass border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : trends && trends.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{trends.length} trending topics · Sorted by score</span>
          </div>
          {trends.map((trend, i) => (
            <TrendCard
              key={trend.id}
              trend={trend}
              rank={i + 1}
              onGenerateContent={handleGenerateContent}
            />
          ))}
        </div>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="p-12 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">No trends found for this category</p>
          </CardContent>
        </Card>
      )}

      {/* Algorithm info */}
      <Card className="glass border-border/50 mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Scoring Algorithm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Volume", weight: "40%", desc: "Total tweet count", color: "bg-blue-400" },
              { label: "Velocity", weight: "30%", desc: "Hour-over-hour growth", color: "bg-green-400" },
              { label: "Engagement", weight: "20%", desc: "Likes + RT per tweet", color: "bg-purple-400" },
              { label: "Recency", weight: "10%", desc: "Time since last spike", color: "bg-orange-400" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2">
                <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", item.color)} />
                <div>
                  <p className="text-xs font-semibold text-foreground">{item.label} <span className="text-muted-foreground font-normal">({item.weight})</span></p>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
