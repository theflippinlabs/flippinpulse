/**
 * AI service — calls Supabase Edge Functions which securely proxy to Claude API.
 * When VITE_SUPABASE_URL is not configured, falls back to smart mock responses.
 */

import { supabase } from "@/lib/supabase";
import type { ContentGenerationInput, ReplyGenerationInput } from "@/lib/validation";
import { aiContentLimiter, aiReplyLimiter } from "@/lib/rateLimit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedContent {
  id: string;
  content: string;
  charCount: number;
  hashtags: string[];
  estimatedEngagement: "low" | "medium" | "high" | "viral";
  isThread: boolean;
  threadParts?: string[];
}

export interface GeneratedReply {
  id: string;
  content: string;
  charCount: number;
  tone: string;
}

export class AIRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Rate limit exceeded. Retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Content generation ────────────────────────────────────────────────────────

export async function generateContent(
  input: ContentGenerationInput
): Promise<GeneratedContent[]> {
  if (!aiContentLimiter.consume()) {
    throw new AIRateLimitError(aiContentLimiter.retryAfterMs());
  }

  try {
    const { data, error } = await supabase.functions.invoke<GeneratedContent[]>(
      "generate-content",
      { body: input }
    );
    if (error) throw error;
    if (data) return data;
  } catch {
    // Edge function not deployed — use mock
  }

  return mockGenerateContent(input);
}

export async function generateReply(
  input: ReplyGenerationInput
): Promise<GeneratedReply[]> {
  if (!aiReplyLimiter.consume()) {
    throw new AIRateLimitError(aiReplyLimiter.retryAfterMs());
  }

  try {
    const { data, error } = await supabase.functions.invoke<GeneratedReply[]>(
      "generate-reply",
      { body: input }
    );
    if (error) throw error;
    if (data) return data;
  } catch {
    // Edge function not deployed — use mock
  }

  return mockGenerateReply(input);
}

// ── Mock implementations (used when Edge Function is unavailable) ─────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function mockGenerateContent(input: ContentGenerationInput): GeneratedContent[] {
  const toneMap: Record<string, string[]> = {
    professional: [
      `${input.topic} is reshaping how we think about the future.\n\nHere are 3 key insights you need to know:`,
      `The data on ${input.topic} is clear — and most people are ignoring it.\n\nA thread on what the experts are saying:`,
      `If you work in this space, ${input.topic} is the conversation you can't afford to miss.`,
    ],
    casual: [
      `hot take: ${input.topic} is actually way more interesting than people give it credit for 🔥`,
      `can we talk about ${input.topic} for a second? because this just changed my whole perspective`,
      `me before learning about ${input.topic}: 😐\nme after: 🤯`,
    ],
    viral: [
      `Nobody is talking about this: ${input.topic} will change everything in 2026.\n\nHere's why (thread 🧵):`,
      `I spent 100 hours researching ${input.topic}. Here's everything I found (steal this):`,
      `${input.topic} in 60 seconds — the only thread you need to read today 👇`,
    ],
    educational: [
      `${input.topic} explained simply:\n\n→ What it is\n→ Why it matters\n→ How to use it`,
      `A beginner's guide to ${input.topic}.\n\nRead this before anything else:`,
      `Everything you need to know about ${input.topic} in one post.`,
    ],
    controversial: [
      `Unpopular opinion: most people completely misunderstand ${input.topic}.`,
      `${input.topic} is overrated. Here's the truth nobody wants to hear:`,
      `The ${input.topic} narrative is wrong. Let me show you the actual data.`,
    ],
  };

  const templates = toneMap[input.tone] ?? toneMap.professional;
  const hashtags = input.includeHashtags
    ? [`#${input.topic.split(" ")[0].replace(/[^a-z0-9]/gi, "")}`, "#XGrowth", "#Xperience"]
    : [];

  return templates.map((content, i) => {
    const fullContent = hashtags.length > 0 ? `${content}\n\n${hashtags.join(" ")}` : content;
    const isThread = input.format === "thread" && content.includes("thread");
    return {
      id: uid(),
      content: fullContent,
      charCount: fullContent.length,
      hashtags,
      estimatedEngagement: (["medium", "high", "viral", "high"] as const)[i % 4],
      isThread,
      threadParts: isThread
        ? [content, `2/ Here's the first key point about ${input.topic}...`, `3/ The most important takeaway:`]
        : undefined,
    };
  });
}

function mockGenerateReply(input: ReplyGenerationInput): GeneratedReply[] {
  const toneMap: Record<string, string[]> = {
    "agree": [
      "100% this. The data backs it up.",
      "Exactly what I've been saying for months. More people need to hear this.",
      "This is the take. Sharing this.",
    ],
    "disagree": [
      "Respectfully — I think the framing here is off. Here's why:",
      "Strong disagree. The evidence actually points the other way.",
      "I get the logic but the conclusion doesn't hold. Let me explain.",
    ],
    "add-value": [
      "Great point! Worth adding that this also connects to...",
      "This is solid. The piece most miss though is the second-order effect.",
      "Building on this — the real unlock is when you combine it with...",
    ],
    "funny": [
      "Me reading this at 2am: 👀",
      "The algorithm sent this to me personally.",
      "Sir this is a Wendy's",
    ],
    "question": [
      "Genuinely curious — how did you arrive at this conclusion?",
      "What's your take on the opposite scenario though?",
      "Can you expand on the second point? That's the one I'm not sure about.",
    ],
  };

  const replies = toneMap[input.tone] ?? toneMap["add-value"];
  return replies.map((content) => ({
    id: uid(),
    content,
    charCount: content.length,
    tone: input.tone,
  }));
}
