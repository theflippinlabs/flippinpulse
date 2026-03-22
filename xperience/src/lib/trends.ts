/**
 * Trend system with scoring algorithm.
 *
 * In production: replace fetchRawTrends() with real X API v2 calls
 * routed through the Supabase Edge Function `fetch-trends`.
 *
 * Score = 0–100, weighted composite of:
 *   - Volume (40%)       – raw mention/tweet count
 *   - Velocity (30%)     – rate of growth in last hour
 *   - Engagement Rate (20%) – likes+retweets per tweet
 *   - Recency (10%)      – how recently it spiked
 */

export type TrendCategory =
  | "tech"
  | "ai"
  | "crypto"
  | "business"
  | "entertainment"
  | "sports"
  | "politics"
  | "science";

export interface RawTrend {
  id: string;
  hashtag: string;
  topic: string;
  category: TrendCategory;
  tweetCount: number;
  tweetCountPrev: number; // count 1h ago
  avgEngagementRate: number; // 0–1
  firstSeen: Date;
  lastSpiked: Date;
  sampleTweets: string[];
}

export interface ScoredTrend extends RawTrend {
  score: number;
  scoreBreakdown: {
    volume: number;
    velocity: number;
    engagement: number;
    recency: number;
  };
  momentum: "rising" | "stable" | "falling";
}

// ── Scoring algorithm ─────────────────────────────────────────────────────────

function normalise(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function scoreTrend(raw: RawTrend, allTrends: RawTrend[]): ScoredTrend {
  const maxCount = Math.max(...allTrends.map((t) => t.tweetCount), 1);
  const maxEngagement = Math.max(...allTrends.map((t) => t.avgEngagementRate), 0.01);
  const now = Date.now();

  // Volume: normalised tweet count
  const volume = normalise(raw.tweetCount, 0, maxCount);

  // Velocity: % growth vs previous hour
  const growthRate = raw.tweetCountPrev > 0
    ? (raw.tweetCount - raw.tweetCountPrev) / raw.tweetCountPrev
    : 1;
  const velocity = normalise(Math.min(growthRate, 5), -0.5, 5); // cap at 5x

  // Engagement quality
  const engagement = normalise(raw.avgEngagementRate, 0, maxEngagement);

  // Recency: score decays over 48h
  const ageHours = (now - raw.lastSpiked.getTime()) / 3_600_000;
  const recency = normalise(Math.max(0, 48 - ageHours), 0, 48);

  const score = Math.round(
    volume * 0.4 + velocity * 0.3 + engagement * 0.2 + recency * 0.1
  );

  const velocityRaw = raw.tweetCount - raw.tweetCountPrev;
  const momentum: ScoredTrend["momentum"] =
    velocityRaw > raw.tweetCount * 0.1 ? "rising" :
    velocityRaw < -(raw.tweetCount * 0.05) ? "falling" : "stable";

  return {
    ...raw,
    score,
    scoreBreakdown: {
      volume: Math.round(volume),
      velocity: Math.round(velocity),
      engagement: Math.round(engagement),
      recency: Math.round(recency),
    },
    momentum,
  };
}

// ── Simulated data (replace with real API) ────────────────────────────────────

const SIMULATED_TRENDS: RawTrend[] = [
  {
    id: "1", hashtag: "#AIAgents", topic: "AI Agents & Autonomous Systems",
    category: "ai", tweetCount: 142_000, tweetCountPrev: 95_000,
    avgEngagementRate: 0.087, firstSeen: new Date("2026-03-20"),
    lastSpiked: new Date(Date.now() - 1_800_000),
    sampleTweets: [
      "AI agents are about to replace entire job functions. Are you ready?",
      "The next wave of AI isn't chatbots — it's autonomous agents doing real work.",
    ],
  },
  {
    id: "2", hashtag: "#BuildInPublic", topic: "Build in Public Movement",
    category: "business", tweetCount: 87_400, tweetCountPrev: 82_000,
    avgEngagementRate: 0.062, firstSeen: new Date("2026-01-05"),
    lastSpiked: new Date(Date.now() - 3_600_000),
    sampleTweets: [
      "Day 47 of building in public. Here's what I learned about product-market fit.",
      "Building in public is the best free marketing strategy. Here's why.",
    ],
  },
  {
    id: "3", hashtag: "#Web3", topic: "Web3 & Decentralization",
    category: "crypto", tweetCount: 210_000, tweetCountPrev: 240_000,
    avgEngagementRate: 0.041, firstSeen: new Date("2025-11-01"),
    lastSpiked: new Date(Date.now() - 7_200_000),
    sampleTweets: [
      "Web3 is dead. Long live Web3.",
      "Decentralized social media is finally making sense.",
    ],
  },
  {
    id: "4", hashtag: "#ClaudeAI", topic: "Anthropic Claude AI",
    category: "ai", tweetCount: 68_000, tweetCountPrev: 31_000,
    avgEngagementRate: 0.094, firstSeen: new Date("2026-03-21"),
    lastSpiked: new Date(Date.now() - 900_000),
    sampleTweets: [
      "Claude just became my primary coding assistant. The context window is insane.",
      "New Claude model dropped. Benchmarks are wild.",
    ],
  },
  {
    id: "5", hashtag: "#SaaS", topic: "SaaS Business Models",
    category: "business", tweetCount: 54_200, tweetCountPrev: 51_000,
    avgEngagementRate: 0.055, firstSeen: new Date("2026-02-01"),
    lastSpiked: new Date(Date.now() - 10_800_000),
    sampleTweets: [
      "From $0 to $10K MRR in 90 days. The exact strategy I used.",
      "Stop over-engineering your SaaS. Ship faster, iterate later.",
    ],
  },
  {
    id: "6", hashtag: "#GrowthHacking", topic: "Growth Hacking Tactics",
    category: "business", tweetCount: 38_900, tweetCountPrev: 29_000,
    avgEngagementRate: 0.071, firstSeen: new Date("2026-03-19"),
    lastSpiked: new Date(Date.now() - 2_700_000),
    sampleTweets: [
      "The growth hack that added 50K followers in 2 weeks.",
      "Nobody talks about this X algorithm secret.",
    ],
  },
  {
    id: "7", hashtag: "#ReactJS", topic: "React & Frontend Development",
    category: "tech", tweetCount: 95_600, tweetCountPrev: 91_000,
    avgEngagementRate: 0.048, firstSeen: new Date("2025-10-01"),
    lastSpiked: new Date(Date.now() - 5_400_000),
    sampleTweets: [
      "React Server Components are a game changer.",
      "You don't need Redux anymore. Here's what I use instead.",
    ],
  },
  {
    id: "8", hashtag: "#ContentCreator", topic: "Content Creator Economy",
    category: "entertainment", tweetCount: 129_000, tweetCountPrev: 105_000,
    avgEngagementRate: 0.076, firstSeen: new Date("2026-01-15"),
    lastSpiked: new Date(Date.now() - 1_200_000),
    sampleTweets: [
      "The creator economy is worth $250B. Here's how to get your slice.",
      "I quit my job to create content. 1 year later — was it worth it?",
    ],
  },
  {
    id: "9", hashtag: "#QuantumComputing", topic: "Quantum Computing Breakthroughs",
    category: "science", tweetCount: 41_200, tweetCountPrev: 18_500,
    avgEngagementRate: 0.088, firstSeen: new Date("2026-03-22"),
    lastSpiked: new Date(Date.now() - 600_000),
    sampleTweets: [
      "Google just announced a major quantum computing milestone.",
      "Quantum supremacy is real. What does this mean for encryption?",
    ],
  },
  {
    id: "10", hashtag: "#XMarketing", topic: "X Platform Marketing",
    category: "business", tweetCount: 47_800, tweetCountPrev: 42_000,
    avgEngagementRate: 0.068, firstSeen: new Date("2026-02-20"),
    lastSpiked: new Date(Date.now() - 3_000_000),
    sampleTweets: [
      "The X algorithm rewards consistency above everything.",
      "Post at these 3 exact times on X for maximum reach.",
    ],
  },
  {
    id: "11", hashtag: "#OpenSource", topic: "Open Source Software",
    category: "tech", tweetCount: 76_300, tweetCountPrev: 72_000,
    avgEngagementRate: 0.053, firstSeen: new Date("2025-09-01"),
    lastSpiked: new Date(Date.now() - 14_400_000),
    sampleTweets: [
      "Open source is eating the world — one repo at a time.",
      "This open source project just crossed 100K stars.",
    ],
  },
  {
    id: "12", hashtag: "#Startups", topic: "Startup Ecosystem",
    category: "business", tweetCount: 163_000, tweetCountPrev: 158_000,
    avgEngagementRate: 0.059, firstSeen: new Date("2025-08-01"),
    lastSpiked: new Date(Date.now() - 21_600_000),
    sampleTweets: [
      "Investors are pouring money into AI startups. Here's the list.",
      "Your startup doesn't need VC. Bootstrap to profitability instead.",
    ],
  },
];

export async function fetchTrends(
  category?: TrendCategory | "all",
  timeRange: "1h" | "24h" | "7d" = "24h"
): Promise<ScoredTrend[]> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));

  let raw = [...SIMULATED_TRENDS];

  // Filter by category
  if (category && category !== "all") {
    raw = raw.filter((t) => t.category === category);
  }

  // Adjust counts for time ranges
  if (timeRange === "1h") {
    raw = raw.map((t) => ({
      ...t,
      tweetCount: Math.round(t.tweetCount * 0.04),
      tweetCountPrev: Math.round(t.tweetCountPrev * 0.04),
    }));
  } else if (timeRange === "7d") {
    raw = raw.map((t) => ({
      ...t,
      tweetCount: t.tweetCount * 7,
      tweetCountPrev: Math.round(t.tweetCountPrev * 6.5),
    }));
  }

  // Score all trends
  const scored = raw.map((t) => scoreTrend(t, raw));

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

export function getCategoryColor(category: TrendCategory): string {
  const colors: Record<TrendCategory, string> = {
    ai: "text-purple-400 bg-purple-400/10",
    tech: "text-blue-400 bg-blue-400/10",
    crypto: "text-yellow-400 bg-yellow-400/10",
    business: "text-green-400 bg-green-400/10",
    entertainment: "text-pink-400 bg-pink-400/10",
    sports: "text-orange-400 bg-orange-400/10",
    politics: "text-red-400 bg-red-400/10",
    science: "text-cyan-400 bg-cyan-400/10",
  };
  return colors[category] ?? "text-muted-foreground bg-muted";
}

export function getMomentumIcon(momentum: ScoredTrend["momentum"]): string {
  return momentum === "rising" ? "↑" : momentum === "falling" ? "↓" : "→";
}
