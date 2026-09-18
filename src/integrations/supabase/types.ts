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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_id: string
          category_name: string
          created_at: string
          level: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          category_name: string
          created_at?: string
          level?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          category_name?: string
          created_at?: string
          level?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consumo_eventos: {
        Row: {
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_consumo"]
          id: string
          job_id: string | null
          metadados: Json
          modelo: string
          profile_id: string | null
          quantidade: number | null
          unidade: Database["public"]["Enums"]["unidade_tarifa"]
        }
        Insert: {
          created_at?: string
          etapa: Database["public"]["Enums"]["etapa_consumo"]
          id?: string
          job_id?: string | null
          metadados?: Json
          modelo?: string
          profile_id?: string | null
          quantidade?: number | null
          unidade: Database["public"]["Enums"]["unidade_tarifa"]
        }
        Update: {
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_consumo"]
          id?: string
          job_id?: string | null
          metadados?: Json
          modelo?: string
          profile_id?: string | null
          quantidade?: number | null
          unidade?: Database["public"]["Enums"]["unidade_tarifa"]
        }
        Relationships: [
          {
            foreignKeyName: "consumo_eventos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_eventos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedor_aportes: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          fornecedor: string
          id: string
          observacao: string | null
          unidade: string | null
          unidades: number | null
          valor_brl: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          fornecedor: string
          id?: string
          observacao?: string | null
          unidade?: string | null
          unidades?: number | null
          valor_brl?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          fornecedor?: string
          id?: string
          observacao?: string | null
          unidade?: string | null
          unidades?: number | null
          valor_brl?: number
        }
        Relationships: []
      }
      fornecedor_planos: {
        Row: {
          ativo: boolean
          creditos_mes: number
          dia_renovacao: number
          fornecedor: string
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          creditos_mes?: number
          dia_renovacao?: number
          fornecedor: string
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          ativo?: boolean
          creditos_mes?: number
          dia_renovacao?: number
          fornecedor?: string
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: []
      }
      job_stage_events: {
        Row: {
          entered_at: string
          exited_at: string | null
          id: string
          job_id: string
          profile_id: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          entered_at?: string
          exited_at?: string | null
          id?: string
          job_id: string
          profile_id: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          entered_at?: string
          exited_at?: string | null
          id?: string
          job_id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "job_stage_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_stage_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          gemini_images_count: number
          hashtags: string[] | null
          id: string
          notes: string | null
          product_id: string | null
          profile_id: string
          render_error: string | null
          render_id: string | null
          render_stage: string | null
          render_started_at: string | null
          scenes: Json
          script: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          veo_takes_count: number
          video_thumbnail_url: string | null
          video_url: string | null
          voice_ref: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          gemini_images_count?: number
          hashtags?: string[] | null
          id?: string
          notes?: string | null
          product_id?: string | null
          profile_id: string
          render_error?: string | null
          render_id?: string | null
          render_stage?: string | null
          render_started_at?: string | null
          scenes?: Json
          script?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          veo_takes_count?: number
          video_thumbnail_url?: string | null
          video_url?: string | null
          voice_ref?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          gemini_images_count?: number
          hashtags?: string[] | null
          id?: string
          notes?: string | null
          product_id?: string | null
          profile_id?: string
          render_error?: string | null
          render_id?: string | null
          render_stage?: string | null
          render_started_at?: string | null
          scenes?: Json
          script?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          veo_takes_count?: number
          video_thumbnail_url?: string | null
          video_url?: string | null
          voice_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_voice_ref_fkey"
            columns: ["voice_ref"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          id: string
          module: string
        }
        Insert: {
          action: string
          id?: string
          module: string
        }
        Update: {
          action?: string
          id?: string
          module?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          commission: number
          created_at: string
          created_by: string | null
          external_id: string | null
          growth_rate: number
          hype: number
          id: string
          image_url: string
          name: string
          niche: string
          origin: string
          price: number
          profile_id: string | null
          revenue: number
          sales_volume: number
          seller_name: string
          source: string | null
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          category_id?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          growth_rate?: number
          hype?: number
          id?: string
          image_url?: string
          name: string
          niche?: string
          origin?: string
          price?: number
          profile_id?: string | null
          revenue?: number
          sales_volume?: number
          seller_name?: string
          source?: string | null
          status?: string
          updated_at?: string
          url?: string
        }
        Update: {
          category_id?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          growth_rate?: number
          hype?: number
          id?: string
          image_url?: string
          name?: string
          niche?: string
          origin?: string
          price?: number
          profile_id?: string | null
          revenue?: number
          sales_volume?: number
          seller_name?: string
          source?: string | null
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "products_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_identities: {
        Row: {
          created_at: string
          language: string
          profile_id: string
          style_notes: string
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          language?: string
          profile_id: string
          style_notes?: string
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          language?: string
          profile_id?: string
          style_notes?: string
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_identities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompt_overrides: {
        Row: {
          body: string
          key: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          body: string
          key: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          key?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompt_overrides_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "profile_prompt_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_video_settings: {
        Row: {
          avatar_mode: string
          avatar_reference_url: string | null
          avatar_reference_urls: Json
          created_at: string
          gemini_model: string
          profile_id: string
          take_duration: number
          takes_count: number
          updated_at: string
          veo_model: string
          voice_ref: string | null
        }
        Insert: {
          avatar_mode?: string
          avatar_reference_url?: string | null
          avatar_reference_urls?: Json
          created_at?: string
          gemini_model?: string
          profile_id: string
          take_duration?: number
          takes_count?: number
          updated_at?: string
          veo_model?: string
          voice_ref?: string | null
        }
        Update: {
          avatar_mode?: string
          avatar_reference_url?: string | null
          avatar_reference_urls?: Json
          created_at?: string
          gemini_model?: string
          profile_id?: string
          take_duration?: number
          takes_count?: number
          updated_at?: string
          veo_model?: string
          voice_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_video_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_video_settings_voice_ref_fkey"
            columns: ["voice_ref"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          followers: number
          handle: string
          id: string
          initials: string
          name: string
          niche: string
          slug: string
          status: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          followers?: number
          handle?: string
          id?: string
          initials?: string
          name: string
          niche?: string
          slug: string
          status?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          followers?: number
          handle?: string
          id?: string
          initials?: string
          name?: string
          niche?: string
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          body: string
          description: string
          key: string
          placeholders: string[]
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          description?: string
          key: string
          placeholders?: string[]
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          description?: string
          key?: string
          placeholders?: string[]
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string
          id: string
          is_admin: boolean
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_admin?: boolean
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_admin?: boolean
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      tarifas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          modelo: string
          moeda: Database["public"]["Enums"]["moeda_tarifa"]
          preco_unitario: number
          tipo_unidade: Database["public"]["Enums"]["unidade_tarifa"]
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          modelo: string
          moeda?: Database["public"]["Enums"]["moeda_tarifa"]
          preco_unitario?: number
          tipo_unidade: Database["public"]["Enums"]["unidade_tarifa"]
          updated_at?: string
          vigente_desde?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          modelo?: string
          moeda?: Database["public"]["Enums"]["moeda_tarifa"]
          preco_unitario?: number
          tipo_unidade?: Database["public"]["Enums"]["unidade_tarifa"]
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: []
      }
      user_invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      user_profile_roles: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profile_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          created_at: string
          created_by: string | null
          fonte: string
          genero: string | null
          id: string
          nome: string
          preview_url: string | null
          profile_id: string | null
          voice_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fonte: string
          genero?: string | null
          id?: string
          nome: string
          preview_url?: string | null
          profile_id?: string | null
          voice_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fonte?: string
          genero?: string | null
          id?: string
          nome?: string
          preview_url?: string | null
          profile_id?: string | null
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_pipeline: { Args: { _profile_id: string }; Returns: boolean }
      ensure_app_user: { Args: never; Returns: undefined }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      etapa_consumo:
        | "cena_gemini"
        | "animacao_veo"
        | "montagem_json2video"
        | "busca_kalodata"
        | "roteiro_texto"
        | "narracao_elevenlabs"
      job_status:
        | "novo"
        | "produto_escolhido"
        | "roteiro_pronto"
        | "cenas_geradas"
        | "gerando_video"
        | "video_pronto"
        | "rascunho_enviado"
        | "publicado"
      moeda_tarifa: "USD" | "BRL"
      unidade_tarifa:
        | "imagem"
        | "segundo_video"
        | "credito_montagem"
        | "bloco_linhas_kalodata"
        | "token_input"
        | "token_output"
        | "mil_caracteres"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      etapa_consumo: [
        "cena_gemini",
        "animacao_veo",
        "montagem_json2video",
        "busca_kalodata",
        "roteiro_texto",
        "narracao_elevenlabs",
      ],
      job_status: [
        "novo",
        "produto_escolhido",
        "roteiro_pronto",
        "cenas_geradas",
        "gerando_video",
        "video_pronto",
        "rascunho_enviado",
        "publicado",
      ],
      moeda_tarifa: ["USD", "BRL"],
      unidade_tarifa: [
        "imagem",
        "segundo_video",
        "credito_montagem",
        "bloco_linhas_kalodata",
        "token_input",
        "token_output",
        "mil_caracteres",
      ],
    },
  },
} as const
