import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUpSchema = loginSchema.extend({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(80),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ── Content generation ────────────────────────────────────────────────────────
export const contentGenerationSchema = z.object({
  topic: z
    .string()
    .min(3, "Topic must be at least 3 characters")
    .max(200, "Topic too long")
    .transform((s) => s.trim()),
  tone: z.enum(["professional", "casual", "viral", "educational", "controversial"]),
  format: z.enum(["single", "thread"]),
  includeHashtags: z.boolean().default(true),
  includeEmojis: z.boolean().default(false),
  targetAudience: z.string().max(100).optional(),
  accountId: z.string().uuid().optional(),
});

export type ContentGenerationInput = z.infer<typeof contentGenerationSchema>;

// ── Reply generation ──────────────────────────────────────────────────────────
export const replyGenerationSchema = z.object({
  originalTweet: z
    .string()
    .min(5, "Tweet is too short")
    .max(560, "Paste the full tweet (max 560 chars)")
    .transform((s) => s.trim()),
  tone: z.enum(["agree", "disagree", "add-value", "funny", "question"]),
  accountId: z.string().uuid().optional(),
});

export type ReplyGenerationInput = z.infer<typeof replyGenerationSchema>;

// ── Scheduler ─────────────────────────────────────────────────────────────────
export const schedulePostSchema = z.object({
  content: z.string().min(1).max(280),
  scheduledAt: z.string().datetime(),
  accountId: z.string().uuid(),
  isThread: z.boolean().default(false),
  threadParts: z.array(z.string().max(280)).optional(),
});

// ── Account ───────────────────────────────────────────────────────────────────
export const addAccountSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(15)
    .regex(/^[A-Za-z0-9_]+$/, "Handle can only contain letters, numbers and underscores")
    .transform((s) => s.replace(/^@/, "")),
  displayName: z.string().min(1).max(50),
});
