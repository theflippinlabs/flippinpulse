export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          channel_id: string | null
          created_at: string
          discord_id: string
          id: string
          metadata_json: Json | null
          points_awarded: number
          type: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          discord_id: string
          id?: string
          metadata_json?: Json | null
          points_awarded?: number
          type: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          discord_id?: string
          id?: string
          metadata_json?: Json | null
          points_awarded?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_discord_id_fkey"
            columns: ["discord_id"]
            isOneToOne: false
            referencedRelation: "discord_users"
            referencedColumns: ["discord_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_discord_id: string | null
          admin_user_id: string | null
          created_at: string
          id: string
          payload_json: Json | null
          target_discord_id: string | null
        }
        Insert: {
          action: string
          admin_discord_id?: string | null
          admin_user_id?: string | null
          created_at?: string
          id?: string
          payload_json?: Json | null
          target_discord_id?: string | null
        }
        Update: {
          action?: string
          admin_discord_id?: string | null
          admin_user_id?: string | null
          created_at?: string
          id?: string
          payload_json?: Json | null
          target_discord_id?: string | null
        }
        Relationships: []
      }
      discord_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          discord_id: string
          id: string
          joined_at: string | null
          last_activity_at: string | null
          points_month: number
          points_total: number
          points_week: number
          rank_name: string | null
          streak: number
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          discord_id: string
          id?: string
          joined_at?: string | null
          last_activity_at?: string | null
          points_month?: number
          points_total?: number
          points_week?: number
          rank_name?: string | null
          streak?: number
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          discord_id?: string
          id?: string
          joined_at?: string | null
          last_activity_at?: string | null
          points_month?: number
          points_total?: number
          points_week?: number
          rank_name?: string | null
          streak?: number
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      mission_completions: {
        Row: {
          completed_at: string | null
          created_at: string
          discord_id: string
          id: string
          mission_id: string
          proof_json: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          discord_id: string
          id?: string
          mission_id: string
          proof_json?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          discord_id?: string
          id?: string
          mission_id?: string
          proof_json?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_completions_discord_id_fkey"
            columns: ["discord_id"]
            isOneToOne: false
            referencedRelation: "discord_users"
            referencedColumns: ["discord_id"]
          },
          {
            foreignKeyName: "mission_completions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          created_at: string
          description: string
          end_at: string
          id: string
          is_active: boolean
          reward_points: number
          rules_json: Json | null
          start_at: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description: string
          end_at: string
          id?: string
          is_active?: boolean
          reward_points?: number
          rules_json?: Json | null
          start_at?: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string
          end_at?: string
          id?: string
          is_active?: boolean
          reward_points?: number
          rules_json?: Json | null
          start_at?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      roles_config: {
        Row: {
          color: string | null
          discord_role_id: string | null
          id: string
          rank_name: string
          sort_order: number
          threshold: number
        }
        Insert: {
          color?: string | null
          discord_role_id?: string | null
          id?: string
          rank_name: string
          sort_order?: number
          threshold?: number
        }
        Update: {
          color?: string | null
          discord_role_id?: string | null
          id?: string
          rank_name?: string
          sort_order?: number
          threshold?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value_json: Json
        }
        Insert: {
          key: string
          value_json?: Json
        }
        Update: {
          key?: string
          value_json?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
