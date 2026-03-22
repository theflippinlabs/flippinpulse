export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      x_accounts: {
        Row: {
          id: string;
          user_id: string;
          handle: string;
          display_name: string;
          avatar_url: string | null;
          followers_count: number;
          following_count: number;
          tweets_count: number;
          is_connected: boolean;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          handle: string;
          display_name: string;
          avatar_url?: string | null;
          followers_count?: number;
          following_count?: number;
          tweets_count?: number;
          is_connected?: boolean;
          last_synced_at?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          followers_count?: number;
          following_count?: number;
          tweets_count?: number;
          is_connected?: boolean;
          last_synced_at?: string | null;
        };
        Relationships: [];
      };

      content_drafts: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          content: string;
          hashtags: string[];
          tone: string;
          is_thread: boolean;
          thread_parts: string[] | null;
          status: "draft" | "scheduled" | "published" | "failed";
          scheduled_at: string | null;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id?: string | null;
          content: string;
          hashtags?: string[];
          tone: string;
          is_thread?: boolean;
          thread_parts?: string[] | null;
          status?: "draft" | "scheduled" | "published" | "failed";
          scheduled_at?: string | null;
          published_at?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          hashtags?: string[];
          status?: "draft" | "scheduled" | "published" | "failed";
          scheduled_at?: string | null;
          published_at?: string | null;
        };
        Relationships: [];
      };

      analytics_snapshots: {
        Row: {
          id: string;
          account_id: string;
          date: string;
          followers_count: number;
          followers_delta: number;
          impressions: number;
          engagements: number;
          engagement_rate: number;
          profile_visits: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          date: string;
          followers_count: number;
          followers_delta?: number;
          impressions?: number;
          engagements?: number;
          engagement_rate?: number;
          profile_visits?: number;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };

      generation_logs: {
        Row: {
          id: string;
          user_id: string;
          type: "content" | "reply";
          input_tokens: number;
          output_tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "content" | "reply";
          input_tokens?: number;
          output_tokens?: number;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
