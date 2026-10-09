export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      brain_members: {
        Row: {
          actor_id: string;
          brain_id: string;
          role: string;
        };
        Insert: {
          actor_id: string;
          brain_id: string;
          role: string;
        };
        Update: {
          actor_id?: string;
          brain_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brain_members_brain_id_fkey";
            columns: ["brain_id"];
            isOneToOne: false;
            referencedRelation: "brains";
            referencedColumns: ["id"];
          },
        ];
      };
      brains: {
        Row: {
          created_at: string;
          id: string;
          is_global: boolean;
          name: string;
          overview: string;
          retention_days: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_global?: boolean;
          name: string;
          overview?: string;
          retention_days?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_global?: boolean;
          name?: string;
          overview?: string;
          retention_days?: number;
        };
        Relationships: [];
      };
      memories: {
        Row: {
          actor_id: string;
          brain_id: string;
          content: string;
          created_at: string;
          fingerprint: string;
          id: string;
          layer: string;
          provenance: string;
          search_document: unknown;
          status: string;
          topic: string;
          type: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          actor_id: string;
          brain_id: string;
          content: string;
          created_at?: string;
          fingerprint: string;
          id?: string;
          layer?: string;
          provenance: string;
          search_document?: unknown;
          status?: string;
          topic: string;
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          actor_id?: string;
          brain_id?: string;
          content?: string;
          created_at?: string;
          fingerprint?: string;
          id?: string;
          layer?: string;
          provenance?: string;
          search_document?: unknown;
          status?: string;
          topic?: string;
          type?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "memories_brain_id_fkey";
            columns: ["brain_id"];
            isOneToOne: false;
            referencedRelation: "brains";
            referencedColumns: ["id"];
          },
        ];
      };
      memory_revisions: {
        Row: {
          actor_id: string;
          brain_id: string;
          created_at: string;
          id: string;
          memory_id: string;
          snapshot: Json;
          version: number;
        };
        Insert: {
          actor_id: string;
          brain_id: string;
          created_at?: string;
          id?: string;
          memory_id: string;
          snapshot: Json;
          version: number;
        };
        Update: {
          actor_id?: string;
          brain_id?: string;
          created_at?: string;
          id?: string;
          memory_id?: string;
          snapshot?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "memory_revisions_brain_id_memory_id_fkey";
            columns: ["brain_id", "memory_id"];
            isOneToOne: false;
            referencedRelation: "memories";
            referencedColumns: ["brain_id", "id"];
          },
        ];
      };
      memory_sources: {
        Row: {
          brain_id: string;
          commit_ref: string | null;
          file: string | null;
          id: string;
          memory_id: string;
        };
        Insert: {
          brain_id: string;
          commit_ref?: string | null;
          file?: string | null;
          id?: string;
          memory_id: string;
        };
        Update: {
          brain_id?: string;
          commit_ref?: string | null;
          file?: string | null;
          id?: string;
          memory_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memory_sources_brain_id_memory_id_fkey";
            columns: ["brain_id", "memory_id"];
            isOneToOne: false;
            referencedRelation: "memories";
            referencedColumns: ["brain_id", "id"];
          },
        ];
      };
      privacy_reports: {
        Row: {
          actor_id: string;
          brain_id: string;
          created_at: string;
          id: string;
          memory_id: string;
          reason: string;
          request_deletion: boolean;
        };
        Insert: {
          actor_id: string;
          brain_id: string;
          created_at?: string;
          id?: string;
          memory_id: string;
          reason: string;
          request_deletion?: boolean;
        };
        Update: {
          actor_id?: string;
          brain_id?: string;
          created_at?: string;
          id?: string;
          memory_id?: string;
          reason?: string;
          request_deletion?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_reports_brain_id_memory_id_fkey";
            columns: ["brain_id", "memory_id"];
            isOneToOne: false;
            referencedRelation: "memories";
            referencedColumns: ["brain_id", "id"];
          },
        ];
      };
      session_handoffs: {
        Row: {
          brain_id: string;
          created_at: string;
          id: string;
          memory_id: string;
          session_id: string;
        };
        Insert: {
          brain_id: string;
          created_at?: string;
          id?: string;
          memory_id: string;
          session_id: string;
        };
        Update: {
          brain_id?: string;
          created_at?: string;
          id?: string;
          memory_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_handoffs_brain_id_memory_id_fkey";
            columns: ["brain_id", "memory_id"];
            isOneToOne: false;
            referencedRelation: "memories";
            referencedColumns: ["brain_id", "id"];
          },
          {
            foreignKeyName: "session_handoffs_brain_id_session_id_fkey";
            columns: ["brain_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["brain_id", "id"];
          },
        ];
      };
      sessions: {
        Row: {
          actor_id: string;
          brain_id: string;
          client: string;
          ended_at: string | null;
          id: string;
          session_key: string;
          started_at: string;
        };
        Insert: {
          actor_id: string;
          brain_id: string;
          client: string;
          ended_at?: string | null;
          id?: string;
          session_key: string;
          started_at?: string;
        };
        Update: {
          actor_id?: string;
          brain_id?: string;
          client?: string;
          ended_at?: string | null;
          id?: string;
          session_key?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_brain_id_fkey";
            columns: ["brain_id"];
            isOneToOne: false;
            referencedRelation: "brains";
            referencedColumns: ["id"];
          },
        ];
      };
      synchronization_events: {
        Row: {
          actor_id: string;
          attempts: number;
          brain_id: string;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          event_key: string;
          id: string;
          next_attempt_at: string;
          payload: Json | null;
          payload_hash: string;
          status: string;
        };
        Insert: {
          actor_id: string;
          attempts?: number;
          brain_id: string;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          event_key: string;
          id?: string;
          next_attempt_at?: string;
          payload?: Json | null;
          payload_hash: string;
          status?: string;
        };
        Update: {
          actor_id?: string;
          attempts?: number;
          brain_id?: string;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          event_key?: string;
          id?: string;
          next_attempt_at?: string;
          payload?: Json | null;
          payload_hash?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "synchronization_events_brain_id_fkey";
            columns: ["brain_id"];
            isOneToOne: false;
            referencedRelation: "brains";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_retention: { Args: never; Returns: number };
      drain_sync_events: { Args: { p_batch_size?: number }; Returns: number };
      hivemind_mutate: {
        Args: { action: string; payload: Json };
        Returns: Json;
      };
      process_sync_event: { Args: { p_event_id: string }; Returns: Json };
      search_memories: {
        Args: {
          p_brain_id: string;
          p_layer?: string;
          p_limit?: number;
          p_query?: string;
          p_recent?: boolean;
          p_status?: string;
          p_type?: string;
        };
        Returns: {
          actor_id: string;
          brain_id: string;
          content: string;
          created_at: string;
          id: string;
          layer: string;
          provenance: string;
          score: number;
          source: Json;
          status: string;
          topic: string;
          type: string;
          updated_at: string;
          version: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
