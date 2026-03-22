import type { Database } from "./database";

export type XAccount = Database["public"]["Tables"]["x_accounts"]["Row"];
export type ContentDraft = Database["public"]["Tables"]["content_drafts"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AnalyticsSnapshot = Database["public"]["Tables"]["analytics_snapshots"]["Row"];
export type GenerationLog = Database["public"]["Tables"]["generation_logs"]["Row"];
