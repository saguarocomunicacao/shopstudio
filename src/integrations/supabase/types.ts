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
          onboarding_banner_hidden: boolean
          onboarding_seen: boolean
          onboarding_step: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name?: string
          onboarding_banner_hidden?: boolean
          onboarding_seen?: boolean
          onboarding_step?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          onboarding_banner_hidden?: boolean
          onboarding_seen?: boolean
          onboarding_step?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistente_consultas: {
        Row: {
          consultas: Json
          created_at: string
          id: string
          pergunta: string
          profile_id: string | null
          resposta: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          consultas?: Json
          created_at?: string
          id?: string
          pergunta: string
          profile_id?: string | null
          resposta?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          consultas?: Json
          created_at?: string
          id?: string
          pergunta?: string
          profile_id?: string | null
          resposta?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      assistente_conversas: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          tenant_id: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          tenant_id?: string | null
          titulo?: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          tenant_id?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      assistente_mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          criado_em: string
          id: string
          papel: string
          tools_log: Json | null
        }
        Insert: {
          conteudo: string
          conversa_id: string
          criado_em?: string
          id?: string
          papel: string
          tools_log?: Json | null
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          criado_em?: string
          id?: string
          papel?: string
          tools_log?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assistente_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "assistente_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      assistente_uso: {
        Row: {
          created_at: string
          id: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          created_at: string
          custo_estimado_cents: number | null
          dia: string
          horario: string
          id: string
          job_id: string | null
          mensagem: string | null
          profile_id: string
          schedule_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custo_estimado_cents?: number | null
          dia: string
          horario: string
          id?: string
          job_id?: string | null
          mensagem?: string | null
          profile_id: string
          schedule_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custo_estimado_cents?: number | null
          dia?: string
          horario?: string
          id?: string
          job_id?: string | null
          mensagem?: string | null
          profile_id?: string
          schedule_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "automation_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_schedules: {
        Row: {
          ativa: boolean
          avatar_id: string | null
          avatar_modo: string
          cenas_count: number | null
          created_at: string
          created_by: string | null
          filtros: Json
          fonte: string
          horarios: Json
          id: string
          nome: string
          pausada_motivo: string | null
          profile_id: string
          qualidade: string | null
          take_duration: number | null
          tenant_id: string
          teto_diario_cents: number | null
          teto_mensal_cents: number | null
          ultimo_disparo_em: string | null
          updated_at: string
          videos_por_dia: number
          voice_ref: string | null
        }
        Insert: {
          ativa?: boolean
          avatar_id?: string | null
          avatar_modo?: string
          cenas_count?: number | null
          created_at?: string
          created_by?: string | null
          filtros?: Json
          fonte?: string
          horarios?: Json
          id?: string
          nome?: string
          pausada_motivo?: string | null
          profile_id: string
          qualidade?: string | null
          take_duration?: number | null
          tenant_id?: string
          teto_diario_cents?: number | null
          teto_mensal_cents?: number | null
          ultimo_disparo_em?: string | null
          updated_at?: string
          videos_por_dia?: number
          voice_ref?: string | null
        }
        Update: {
          ativa?: boolean
          avatar_id?: string | null
          avatar_modo?: string
          cenas_count?: number | null
          created_at?: string
          created_by?: string | null
          filtros?: Json
          fonte?: string
          horarios?: Json
          id?: string
          nome?: string
          pausada_motivo?: string | null
          profile_id?: string
          qualidade?: string | null
          take_duration?: number | null
          tenant_id?: string
          teto_diario_cents?: number | null
          teto_mensal_cents?: number | null
          ultimo_disparo_em?: string | null
          updated_at?: string
          videos_por_dia?: number
          voice_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_schedules_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "profile_avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_schedules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_schedules_voice_ref_fkey"
            columns: ["voice_ref"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_actions: {
        Row: {
          action_type: string
          label: string
          sort_order: number
        }
        Insert: {
          action_type: string
          label: string
          sort_order?: number
        }
        Update: {
          action_type?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      buscas_produto: {
        Row: {
          consumo_evento_id: string | null
          created_at: string
          filtros: Json
          id: string
          origem: string
          profile_id: string | null
          resultados: Json
          tenant_id: string
          termo: string | null
          total: number
          user_id: string | null
        }
        Insert: {
          consumo_evento_id?: string | null
          created_at?: string
          filtros?: Json
          id?: string
          origem?: string
          profile_id?: string | null
          resultados?: Json
          tenant_id: string
          termo?: string | null
          total?: number
          user_id?: string | null
        }
        Update: {
          consumo_evento_id?: string | null
          created_at?: string
          filtros?: Json
          id?: string
          origem?: string
          profile_id?: string | null
          resultados?: Json
          tenant_id?: string
          termo?: string | null
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buscas_produto_consumo_evento_id_fkey"
            columns: ["consumo_evento_id"]
            isOneToOne: false
            referencedRelation: "consumo_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buscas_produto_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buscas_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          action_type: string | null
          billing_mode: string
          created_at: string
          credito_consumido: number | null
          credito_origem: string | null
          credito_unidade: string | null
          etapa: Database["public"]["Enums"]["etapa_consumo"]
          id: string
          job_id: string | null
          metadados: Json
          modelo: string
          profile_id: string | null
          quantidade: number | null
          tenant_id: string
          tool_price_cents: number
          unidade: Database["public"]["Enums"]["unidade_tarifa"]
          wallet_movement_id: string | null
        }
        Insert: {
          action_type?: string | null
          billing_mode?: string
          created_at?: string
          credito_consumido?: number | null
          credito_origem?: string | null
          credito_unidade?: string | null
          etapa: Database["public"]["Enums"]["etapa_consumo"]
          id?: string
          job_id?: string | null
          metadados?: Json
          modelo?: string
          profile_id?: string | null
          quantidade?: number | null
          tenant_id?: string
          tool_price_cents?: number
          unidade: Database["public"]["Enums"]["unidade_tarifa"]
          wallet_movement_id?: string | null
        }
        Update: {
          action_type?: string | null
          billing_mode?: string
          created_at?: string
          credito_consumido?: number | null
          credito_origem?: string | null
          credito_unidade?: string | null
          etapa?: Database["public"]["Enums"]["etapa_consumo"]
          id?: string
          job_id?: string | null
          metadados?: Json
          modelo?: string
          profile_id?: string | null
          quantidade?: number | null
          tenant_id?: string
          tool_price_cents?: number
          unidade?: Database["public"]["Enums"]["unidade_tarifa"]
          wallet_movement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumo_eventos_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "billable_actions"
            referencedColumns: ["action_type"]
          },
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
          {
            foreignKeyName: "consumo_eventos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_eventos_wallet_movement_id_fkey"
            columns: ["wallet_movement_id"]
            isOneToOne: false
            referencedRelation: "wallet_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      credito_taxas: {
        Row: {
          action_type: string
          ativo: boolean
          created_at: string
          credito_por_unidade: number
          fornecedor: string
          id: string
          regra: string
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          action_type: string
          ativo?: boolean
          created_at?: string
          credito_por_unidade?: number
          fornecedor: string
          id?: string
          regra: string
          updated_at?: string
          vigente_desde?: string
        }
        Update: {
          action_type?: string
          ativo?: boolean
          created_at?: string
          credito_por_unidade?: number
          fornecedor?: string
          id?: string
          regra?: string
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "credito_taxas_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "billable_actions"
            referencedColumns: ["action_type"]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          unidade?: string | null
          unidades?: number | null
          valor_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_aportes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedor_planos: {
        Row: {
          ativo: boolean
          creditos_mes: number
          dia_renovacao: number
          fornecedor: string
          tenant_id: string
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          creditos_mes?: number
          dia_renovacao?: number
          fornecedor: string
          tenant_id?: string
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          ativo?: boolean
          creditos_mes?: number
          dia_renovacao?: number
          fornecedor?: string
          tenant_id?: string
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_planos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_eventos: {
        Row: {
          ator: string | null
          created_at: string
          de_status: string | null
          id: string
          job_id: string
          mensagem: string | null
          para_status: string | null
          profile_id: string
          tenant_id: string
          tipo: string
        }
        Insert: {
          ator?: string | null
          created_at?: string
          de_status?: string | null
          id?: string
          job_id: string
          mensagem?: string | null
          para_status?: string | null
          profile_id: string
          tenant_id: string
          tipo: string
        }
        Update: {
          ator?: string | null
          created_at?: string
          de_status?: string | null
          id?: string
          job_id?: string
          mensagem?: string | null
          para_status?: string | null
          profile_id?: string
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_eventos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_eventos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_shares: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          job_id: string
          tenant_id: string
          token: string
          views: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          job_id: string
          tenant_id?: string
          token: string
          views?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string
          tenant_id?: string
          token?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_shares_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_stage_events: {
        Row: {
          entered_at: string
          exited_at: string | null
          id: string
          job_id: string
          profile_id: string
          status: Database["public"]["Enums"]["job_status"]
          tenant_id: string
        }
        Insert: {
          entered_at?: string
          exited_at?: string | null
          id?: string
          job_id: string
          profile_id: string
          status: Database["public"]["Enums"]["job_status"]
          tenant_id?: string
        }
        Update: {
          entered_at?: string
          exited_at?: string | null
          id?: string
          job_id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          tenant_id?: string
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
          {
            foreignKeyName: "job_stage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_render_error: string | null
          ai_render_id: string | null
          ai_render_stage: string | null
          ai_render_started_at: string | null
          ai_status: string | null
          ai_video_duracao: number | null
          ai_video_path: string | null
          ai_video_storage_error: string | null
          ai_video_storage_status: string | null
          ai_video_thumbnail_path: string | null
          ai_video_thumbnail_url: string | null
          ai_video_url: string | null
          approved_at: string | null
          automation_schedule_id: string | null
          avatar_description: string | null
          avatar_id: string | null
          avatar_reference_urls: Json
          caption: string | null
          cenas_count: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_from_status: Database["public"]["Enums"]["job_status"] | null
          favorito: boolean
          formato: string
          gemini_images_count: number
          hashtags: string[] | null
          hook: string | null
          id: string
          notes: string | null
          post_cta: string | null
          product_id: string | null
          profile_id: string
          published_at: string | null
          published_url: string | null
          recorded_at: string | null
          rejection_reason: string | null
          render_error: string | null
          render_id: string | null
          render_stage: string | null
          render_started_at: string | null
          roteiro_blocos: Json
          roteiro_modo: string
          roteiro_origem: string | null
          scenes: Json
          script: string | null
          script_refs: Json
          status: Database["public"]["Enums"]["job_status"]
          take_duration: number | null
          tenant_id: string
          texto_tela: string | null
          tiktok_video_id: string | null
          tiktok_video_url: string | null
          title: string
          updated_at: string
          veo_takes_count: number
          video_choice: string
          video_edited_duracao: number | null
          video_edited_path: string | null
          video_edits: Json | null
          video_original_duracao: number | null
          video_original_path: string | null
          video_path: string | null
          video_storage_attempts: number
          video_storage_error: string | null
          video_storage_status: string
          video_storage_updated_at: string | null
          video_thumbnail_path: string | null
          video_thumbnail_url: string | null
          video_url: string | null
          visual_style_custom: string | null
          visual_style_override: string | null
          voice_ref: string | null
        }
        Insert: {
          ai_render_error?: string | null
          ai_render_id?: string | null
          ai_render_stage?: string | null
          ai_render_started_at?: string | null
          ai_status?: string | null
          ai_video_duracao?: number | null
          ai_video_path?: string | null
          ai_video_storage_error?: string | null
          ai_video_storage_status?: string | null
          ai_video_thumbnail_path?: string | null
          ai_video_thumbnail_url?: string | null
          ai_video_url?: string | null
          approved_at?: string | null
          automation_schedule_id?: string | null
          avatar_description?: string | null
          avatar_id?: string | null
          avatar_reference_urls?: Json
          caption?: string | null
          cenas_count?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_from_status?: Database["public"]["Enums"]["job_status"] | null
          favorito?: boolean
          formato?: string
          gemini_images_count?: number
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          notes?: string | null
          post_cta?: string | null
          product_id?: string | null
          profile_id: string
          published_at?: string | null
          published_url?: string | null
          recorded_at?: string | null
          rejection_reason?: string | null
          render_error?: string | null
          render_id?: string | null
          render_stage?: string | null
          render_started_at?: string | null
          roteiro_blocos?: Json
          roteiro_modo?: string
          roteiro_origem?: string | null
          scenes?: Json
          script?: string | null
          script_refs?: Json
          status?: Database["public"]["Enums"]["job_status"]
          take_duration?: number | null
          tenant_id?: string
          texto_tela?: string | null
          tiktok_video_id?: string | null
          tiktok_video_url?: string | null
          title?: string
          updated_at?: string
          veo_takes_count?: number
          video_choice?: string
          video_edited_duracao?: number | null
          video_edited_path?: string | null
          video_edits?: Json | null
          video_original_duracao?: number | null
          video_original_path?: string | null
          video_path?: string | null
          video_storage_attempts?: number
          video_storage_error?: string | null
          video_storage_status?: string
          video_storage_updated_at?: string | null
          video_thumbnail_path?: string | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          visual_style_custom?: string | null
          visual_style_override?: string | null
          voice_ref?: string | null
        }
        Update: {
          ai_render_error?: string | null
          ai_render_id?: string | null
          ai_render_stage?: string | null
          ai_render_started_at?: string | null
          ai_status?: string | null
          ai_video_duracao?: number | null
          ai_video_path?: string | null
          ai_video_storage_error?: string | null
          ai_video_storage_status?: string | null
          ai_video_thumbnail_path?: string | null
          ai_video_thumbnail_url?: string | null
          ai_video_url?: string | null
          approved_at?: string | null
          automation_schedule_id?: string | null
          avatar_description?: string | null
          avatar_id?: string | null
          avatar_reference_urls?: Json
          caption?: string | null
          cenas_count?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_from_status?: Database["public"]["Enums"]["job_status"] | null
          favorito?: boolean
          formato?: string
          gemini_images_count?: number
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          notes?: string | null
          post_cta?: string | null
          product_id?: string | null
          profile_id?: string
          published_at?: string | null
          published_url?: string | null
          recorded_at?: string | null
          rejection_reason?: string | null
          render_error?: string | null
          render_id?: string | null
          render_stage?: string | null
          render_started_at?: string | null
          roteiro_blocos?: Json
          roteiro_modo?: string
          roteiro_origem?: string | null
          scenes?: Json
          script?: string | null
          script_refs?: Json
          status?: Database["public"]["Enums"]["job_status"]
          take_duration?: number | null
          tenant_id?: string
          texto_tela?: string | null
          tiktok_video_id?: string | null
          tiktok_video_url?: string | null
          title?: string
          updated_at?: string
          veo_takes_count?: number
          video_choice?: string
          video_edited_duracao?: number | null
          video_edited_path?: string | null
          video_edits?: Json | null
          video_original_duracao?: number | null
          video_original_path?: string | null
          video_path?: string | null
          video_storage_attempts?: number
          video_storage_error?: string | null
          video_storage_status?: string
          video_storage_updated_at?: string | null
          video_thumbnail_path?: string | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          visual_style_custom?: string | null
          visual_style_override?: string | null
          voice_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_automation_schedule_id_fkey"
            columns: ["automation_schedule_id"]
            isOneToOne: false
            referencedRelation: "automation_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "profile_avatars"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      kalodata_video_refs: {
        Row: {
          category_id: string
          fetched_at: string
          videos: Json
        }
        Insert: {
          category_id: string
          fetched_at?: string
          videos?: Json
        }
        Update: {
          category_id?: string
          fetched_at?: string
          videos?: Json
        }
        Relationships: []
      }
      metricas_coleta: {
        Row: {
          iniciado_em: string | null
          profile_id: string
          run_id: string | null
          status: string
          tenant_id: string
          ultima_coleta_em: string | null
          ultimo_erro: string | null
          ultimo_manual_em: string | null
          updated_at: string
        }
        Insert: {
          iniciado_em?: string | null
          profile_id: string
          run_id?: string | null
          status?: string
          tenant_id: string
          ultima_coleta_em?: string | null
          ultimo_erro?: string | null
          ultimo_manual_em?: string | null
          updated_at?: string
        }
        Update: {
          iniciado_em?: string | null
          profile_id?: string
          run_id?: string | null
          status?: string
          tenant_id?: string
          ultima_coleta_em?: string | null
          ultimo_erro?: string | null
          ultimo_manual_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metricas_coleta_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_coleta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          lida: boolean
          origem: string
          tenant_id: string
          texto: string
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          lida?: boolean
          origem?: string
          tenant_id: string
          texto: string
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          lida?: boolean
          origem?: string
          tenant_id?: string
          texto?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_metricas: {
        Row: {
          created_at: string
          curtidas_total: number | null
          data: string
          id: string
          profile_id: string
          seguidores: number | null
          seguindo: number | null
          tenant_id: string
          videos_total: number | null
        }
        Insert: {
          created_at?: string
          curtidas_total?: number | null
          data: string
          id?: string
          profile_id: string
          seguidores?: number | null
          seguindo?: number | null
          tenant_id: string
          videos_total?: number | null
        }
        Update: {
          created_at?: string
          curtidas_total?: number | null
          data?: string
          id?: string
          profile_id?: string
          seguidores?: number | null
          seguindo?: number | null
          tenant_id?: string
          videos_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "perfil_metricas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_metricas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      plan_action_prices: {
        Row: {
          action_type: string
          included_qty: number
          overage_price_cents: number
          package_price_cents: number
          package_qty: number
          plan_id: string
          price_cents: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          action_type: string
          included_qty?: number
          overage_price_cents?: number
          package_price_cents?: number
          package_qty?: number
          plan_id: string
          price_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          included_qty?: number
          overage_price_cents?: number
          package_price_cents?: number
          package_qty?: number
          plan_id?: string
          price_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_action_prices_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "billable_actions"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "plan_action_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_model: string
          created_at: string
          fallback_cap_cents: number
          id: string
          is_active: boolean
          key_source: string
          name: string
          price_cents: number
        }
        Insert: {
          billing_model?: string
          created_at?: string
          fallback_cap_cents?: number
          id?: string
          is_active?: boolean
          key_source: string
          name: string
          price_cents?: number
        }
        Update: {
          billing_model?: string
          created_at?: string
          fallback_cap_cents?: number
          id?: string
          is_active?: boolean
          key_source?: string
          name?: string
          price_cents?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          commission: number
          created_at: string
          created_by: string | null
          description: string | null
          description_origem: string | null
          external_id: string | null
          extra_image_urls: Json
          growth_rate: number
          hype: number
          id: string
          image_url: string
          name: string
          niche: string
          origin: string
          pri_cate_id: string | null
          price: number
          profile_id: string | null
          revenue: number
          sales_volume: number
          sec_cate_id: string | null
          seller_name: string
          source: string | null
          status: string
          tenant_id: string
          ter_cate_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          category_id?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_origem?: string | null
          external_id?: string | null
          extra_image_urls?: Json
          growth_rate?: number
          hype?: number
          id?: string
          image_url?: string
          name: string
          niche?: string
          origin?: string
          pri_cate_id?: string | null
          price?: number
          profile_id?: string | null
          revenue?: number
          sales_volume?: number
          sec_cate_id?: string | null
          seller_name?: string
          source?: string | null
          status?: string
          tenant_id?: string
          ter_cate_id?: string | null
          updated_at?: string
          url?: string
        }
        Update: {
          category_id?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          description_origem?: string | null
          external_id?: string | null
          extra_image_urls?: Json
          growth_rate?: number
          hype?: number
          id?: string
          image_url?: string
          name?: string
          niche?: string
          origin?: string
          pri_cate_id?: string | null
          price?: number
          profile_id?: string | null
          revenue?: number
          sales_volume?: number
          sec_cate_id?: string | null
          seller_name?: string
          source?: string | null
          status?: string
          tenant_id?: string
          ter_cate_id?: string | null
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
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_avatars: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          primary_url: string | null
          profile_id: string
          reference_urls: Json
          tag: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          primary_url?: string | null
          profile_id: string
          reference_urls?: Json
          tag?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          primary_url?: string | null
          profile_id?: string
          reference_urls?: Json
          tag?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_avatars_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_avatars_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          language?: string
          profile_id: string
          style_notes?: string
          tenant_id?: string
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          language?: string
          profile_id?: string
          style_notes?: string
          tenant_id?: string
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
          {
            foreignKeyName: "profile_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompt_overrides: {
        Row: {
          body: string
          key: string
          origem: string
          origem_versao: string | null
          profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body: string
          key: string
          origem?: string
          origem_versao?: string | null
          profile_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          key?: string
          origem?: string
          origem_versao?: string | null
          profile_id?: string
          tenant_id?: string
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
            foreignKeyName: "profile_prompt_overrides_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "prompt_templates_visible"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "profile_prompt_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_video_settings: {
        Row: {
          avatar_description: string
          avatar_mode: string
          avatar_reference_url: string | null
          avatar_reference_urls: Json
          created_at: string
          gemini_model: string
          profile_id: string
          recording_aspect_ratio: string
          require_review: boolean
          take_duration: number
          takes_count: number
          tenant_id: string
          updated_at: string
          veo_model: string
          visual_style: string
          visual_style_custom: string | null
          voice_ref: string | null
        }
        Insert: {
          avatar_description?: string
          avatar_mode?: string
          avatar_reference_url?: string | null
          avatar_reference_urls?: Json
          created_at?: string
          gemini_model?: string
          profile_id: string
          recording_aspect_ratio?: string
          require_review?: boolean
          take_duration?: number
          takes_count?: number
          tenant_id?: string
          updated_at?: string
          veo_model?: string
          visual_style?: string
          visual_style_custom?: string | null
          voice_ref?: string | null
        }
        Update: {
          avatar_description?: string
          avatar_mode?: string
          avatar_reference_url?: string | null
          avatar_reference_urls?: Json
          created_at?: string
          gemini_model?: string
          profile_id?: string
          recording_aspect_ratio?: string
          require_review?: boolean
          take_duration?: number
          takes_count?: number
          tenant_id?: string
          updated_at?: string
          veo_model?: string
          visual_style?: string
          visual_style_custom?: string | null
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
            foreignKeyName: "profile_video_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          profile_image_path: string | null
          slug: string
          status: string
          tenant_id: string
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
          profile_image_path?: string | null
          slug: string
          status?: string
          tenant_id?: string
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
          profile_image_path?: string | null
          slug?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
      radar_alertas: {
        Row: {
          analise_id: string | null
          detectado_em: string
          em_alta_nicho: boolean
          engajamento_pct: number | null
          id: string
          profile_id: string
          razao: number | null
          razao_texto: string
          referencia_id: string
          status: string
          tenant_id: string
          tiktok_video_id: string
          updated_at: string
          views: number
        }
        Insert: {
          analise_id?: string | null
          detectado_em?: string
          em_alta_nicho?: boolean
          engajamento_pct?: number | null
          id?: string
          profile_id: string
          razao?: number | null
          razao_texto?: string
          referencia_id: string
          status?: string
          tenant_id: string
          tiktok_video_id: string
          updated_at?: string
          views?: number
        }
        Update: {
          analise_id?: string | null
          detectado_em?: string
          em_alta_nicho?: boolean
          engajamento_pct?: number | null
          id?: string
          profile_id?: string
          razao?: number | null
          razao_texto?: string
          referencia_id?: string
          status?: string
          tenant_id?: string
          tiktok_video_id?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "radar_alertas_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "video_analises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_alertas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_alertas_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "referencia_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_alertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referencia_perfil_metricas: {
        Row: {
          created_at: string
          curtidas_total: number | null
          data: string
          id: string
          profile_id: string
          referencia_id: string
          seguidores: number | null
          seguindo: number | null
          tenant_id: string
          videos_total: number | null
        }
        Insert: {
          created_at?: string
          curtidas_total?: number | null
          data: string
          id?: string
          profile_id: string
          referencia_id: string
          seguidores?: number | null
          seguindo?: number | null
          tenant_id: string
          videos_total?: number | null
        }
        Update: {
          created_at?: string
          curtidas_total?: number | null
          data?: string
          id?: string
          profile_id?: string
          referencia_id?: string
          seguidores?: number | null
          seguindo?: number | null
          tenant_id?: string
          videos_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referencia_perfil_metricas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_perfil_metricas_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "referencia_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_perfil_metricas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referencia_perfis: {
        Row: {
          acompanhar: boolean
          created_at: string
          created_by: string | null
          fonte_roteirista: boolean
          foto_path: string | null
          handle: string
          id: string
          iniciado_em: string | null
          insights: string | null
          insights_em: string | null
          meu_perfil_id: string | null
          nome: string | null
          profile_id: string
          qtd_videos: number
          run_id: string | null
          status: string
          tenant_id: string
          ultima_coleta_em: string | null
          ultimo_erro: string | null
          ultimo_manual_em: string | null
          updated_at: string
        }
        Insert: {
          acompanhar?: boolean
          created_at?: string
          created_by?: string | null
          fonte_roteirista?: boolean
          foto_path?: string | null
          handle: string
          id?: string
          iniciado_em?: string | null
          insights?: string | null
          insights_em?: string | null
          meu_perfil_id?: string | null
          nome?: string | null
          profile_id: string
          qtd_videos?: number
          run_id?: string | null
          status?: string
          tenant_id: string
          ultima_coleta_em?: string | null
          ultimo_erro?: string | null
          ultimo_manual_em?: string | null
          updated_at?: string
        }
        Update: {
          acompanhar?: boolean
          created_at?: string
          created_by?: string | null
          fonte_roteirista?: boolean
          foto_path?: string | null
          handle?: string
          id?: string
          iniciado_em?: string | null
          insights?: string | null
          insights_em?: string | null
          meu_perfil_id?: string | null
          nome?: string | null
          profile_id?: string
          qtd_videos?: number
          run_id?: string | null
          status?: string
          tenant_id?: string
          ultima_coleta_em?: string | null
          ultimo_erro?: string | null
          ultimo_manual_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referencia_perfis_meu_perfil_id_fkey"
            columns: ["meu_perfil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_perfis_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_perfis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referencia_video_metricas: {
        Row: {
          comentarios: number | null
          compartilhamentos: number | null
          created_at: string
          data: string
          id: string
          likes: number | null
          profile_id: string
          referencia_id: string
          reposts: number | null
          salvos: number | null
          tenant_id: string
          tiktok_video_id: string
          views: number | null
        }
        Insert: {
          comentarios?: number | null
          compartilhamentos?: number | null
          created_at?: string
          data: string
          id?: string
          likes?: number | null
          profile_id: string
          referencia_id: string
          reposts?: number | null
          salvos?: number | null
          tenant_id: string
          tiktok_video_id: string
          views?: number | null
        }
        Update: {
          comentarios?: number | null
          compartilhamentos?: number | null
          created_at?: string
          data?: string
          id?: string
          likes?: number | null
          profile_id?: string
          referencia_id?: string
          reposts?: number | null
          salvos?: number | null
          tenant_id?: string
          tiktok_video_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referencia_video_metricas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_video_metricas_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "referencia_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_video_metricas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referencia_videos: {
        Row: {
          analise_id: string | null
          capa_path: string | null
          created_at: string
          duracao: number | null
          fixado: boolean
          id: string
          legenda: string | null
          profile_id: string
          publicado_em: string | null
          referencia_id: string
          tenant_id: string
          tiktok_video_id: string
          url: string
        }
        Insert: {
          analise_id?: string | null
          capa_path?: string | null
          created_at?: string
          duracao?: number | null
          fixado?: boolean
          id?: string
          legenda?: string | null
          profile_id: string
          publicado_em?: string | null
          referencia_id: string
          tenant_id: string
          tiktok_video_id: string
          url: string
        }
        Update: {
          analise_id?: string | null
          capa_path?: string | null
          created_at?: string
          duracao?: number | null
          fixado?: boolean
          id?: string
          legenda?: string | null
          profile_id?: string
          publicado_em?: string | null
          referencia_id?: string
          tenant_id?: string
          tiktok_video_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "referencia_videos_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "video_analises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_videos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_videos_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "referencia_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencia_videos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
          tenant_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
          tenant_id?: string
        }
        Update: {
          permission_id?: string
          role_id?: string
          tenant_id?: string
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
          {
            foreignKeyName: "role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_admin?: boolean
          is_system?: boolean
          name: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_admin?: boolean
          is_system?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          modelo: string
          moeda: Database["public"]["Enums"]["moeda_tarifa"]
          preco_exato: number | null
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
          preco_exato?: number | null
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
          preco_exato?: number | null
          preco_unitario?: number
          tipo_unidade?: Database["public"]["Enums"]["unidade_tarifa"]
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: []
      }
      tenant_action_balances: {
        Row: {
          action_type: string
          saldo: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          saldo?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          saldo?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_action_balances_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "billable_actions"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "tenant_action_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_api_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          id: string
          last_test_ok: boolean | null
          last_tested_at: string | null
          provider: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          id?: string
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          provider: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          id?: string
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          provider?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_connections: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          created_at: string
          granted_scopes: string[]
          id: string
          last_error: string | null
          open_id: string | null
          profile_id: string
          refresh_token: string | null
          refresh_token_expires_at: string | null
          seller_name: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_type: number | null
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          open_id?: string | null
          profile_id: string
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          seller_name?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_type?: number | null
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          open_id?: string | null
          profile_id?: string
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          seller_name?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_type?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          profile_id: string
          redirect_to: string | null
          state: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          profile_id: string
          redirect_to?: string | null
          state: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          profile_id?: string
          redirect_to?: string | null
          state?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_oauth_states_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_oauth_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          role_id: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          role_id?: string
          tenant_id?: string
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
          {
            foreignKeyName: "user_profile_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      video_analises: {
        Row: {
          analise_iniciada_em: string | null
          apify_run_id: string | null
          arquivo_bytes: number | null
          arquivo_nome: string | null
          consumo_evento_id: string | null
          created_at: string
          created_by: string | null
          custo_cents: number
          download_iniciado_em: string | null
          duracao: number | null
          erro: string | null
          etapa: string | null
          etapa_em: string | null
          etapa_log: Json
          frames: Json
          gemini_file_name: string | null
          gemini_file_uri: string | null
          id: string
          link_url: string | null
          mime_type: string | null
          origem: string
          passo_lock: string | null
          pergunta: string | null
          profile_id: string
          rede_meta: Json | null
          referencia_id: string | null
          resultado: Json | null
          so_download: boolean
          status: string
          storage_path: string | null
          tenant_id: string
          tentativas: number
          titulo: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          analise_iniciada_em?: string | null
          apify_run_id?: string | null
          arquivo_bytes?: number | null
          arquivo_nome?: string | null
          consumo_evento_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_cents?: number
          download_iniciado_em?: string | null
          duracao?: number | null
          erro?: string | null
          etapa?: string | null
          etapa_em?: string | null
          etapa_log?: Json
          frames?: Json
          gemini_file_name?: string | null
          gemini_file_uri?: string | null
          id?: string
          link_url?: string | null
          mime_type?: string | null
          origem: string
          passo_lock?: string | null
          pergunta?: string | null
          profile_id: string
          rede_meta?: Json | null
          referencia_id?: string | null
          resultado?: Json | null
          so_download?: boolean
          status?: string
          storage_path?: string | null
          tenant_id: string
          tentativas?: number
          titulo?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          analise_iniciada_em?: string | null
          apify_run_id?: string | null
          arquivo_bytes?: number | null
          arquivo_nome?: string | null
          consumo_evento_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_cents?: number
          download_iniciado_em?: string | null
          duracao?: number | null
          erro?: string | null
          etapa?: string | null
          etapa_em?: string | null
          etapa_log?: Json
          frames?: Json
          gemini_file_name?: string | null
          gemini_file_uri?: string | null
          id?: string
          link_url?: string | null
          mime_type?: string | null
          origem?: string
          passo_lock?: string | null
          pergunta?: string | null
          profile_id?: string
          rede_meta?: Json | null
          referencia_id?: string | null
          resultado?: Json | null
          so_download?: boolean
          status?: string
          storage_path?: string | null
          tenant_id?: string
          tentativas?: number
          titulo?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_analises_consumo_evento_id_fkey"
            columns: ["consumo_evento_id"]
            isOneToOne: false
            referencedRelation: "consumo_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_analises_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_analises_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "referencia_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_analises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      video_metricas: {
        Row: {
          comentarios: number | null
          compartilhamentos: number | null
          created_at: string
          data: string
          id: string
          job_id: string | null
          likes: number | null
          profile_id: string
          reposts: number | null
          salvos: number | null
          tenant_id: string
          tiktok_video_id: string
          views: number | null
        }
        Insert: {
          comentarios?: number | null
          compartilhamentos?: number | null
          created_at?: string
          data: string
          id?: string
          job_id?: string | null
          likes?: number | null
          profile_id: string
          reposts?: number | null
          salvos?: number | null
          tenant_id: string
          tiktok_video_id: string
          views?: number | null
        }
        Update: {
          comentarios?: number | null
          compartilhamentos?: number | null
          created_at?: string
          data?: string
          id?: string
          job_id?: string | null
          likes?: number | null
          profile_id?: string
          reposts?: number | null
          salvos?: number | null
          tenant_id?: string
          tiktok_video_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_metricas_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metricas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metricas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      videos_nao_vinculados: {
        Row: {
          capa_url: string | null
          created_at: string
          duracao: number | null
          fixado: boolean
          id: string
          legenda: string | null
          profile_id: string
          publicado_em: string | null
          tenant_id: string
          tiktok_video_id: string
          url: string
          vinculado_job_id: string | null
          visto_em: string
        }
        Insert: {
          capa_url?: string | null
          created_at?: string
          duracao?: number | null
          fixado?: boolean
          id?: string
          legenda?: string | null
          profile_id: string
          publicado_em?: string | null
          tenant_id: string
          tiktok_video_id: string
          url: string
          vinculado_job_id?: string | null
          visto_em?: string
        }
        Update: {
          capa_url?: string | null
          created_at?: string
          duracao?: number | null
          fixado?: boolean
          id?: string
          legenda?: string | null
          profile_id?: string
          publicado_em?: string | null
          tenant_id?: string
          tiktok_video_id?: string
          url?: string
          vinculado_job_id?: string | null
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_nao_vinculados_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_nao_vinculados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_nao_vinculados_vinculado_job_id_fkey"
            columns: ["vinculado_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
          owner_id: string | null
          preview_url: string | null
          profile_id: string | null
          tenant_id: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fonte: string
          genero?: string | null
          id?: string
          nome: string
          owner_id?: string | null
          preview_url?: string | null
          profile_id?: string | null
          tenant_id?: string
          voice_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fonte?: string
          genero?: string | null
          id?: string
          nome?: string
          owner_id?: string | null
          preview_url?: string | null
          profile_id?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "voices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_movements: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          job_id: string | null
          price_cents: number
          quantidade: number
          saldo_apos: number
          tenant_id: string
          tipo: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          job_id?: string | null
          price_cents?: number
          quantidade: number
          saldo_apos: number
          tenant_id: string
          tipo: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          job_id?: string | null
          price_cents?: number
          quantidade?: number
          saldo_apos?: number
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_movements_action_type_fkey"
            columns: ["action_type"]
            isOneToOne: false
            referencedRelation: "billable_actions"
            referencedColumns: ["action_type"]
          },
          {
            foreignKeyName: "wallet_movements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      prompt_templates_visible: {
        Row: {
          body: string | null
          description: string | null
          key: string | null
          placeholders: string[] | null
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body?: never
          description?: string | null
          key?: string | null
          placeholders?: string[] | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: never
          description?: string | null
          key?: string | null
          placeholders?: string[] | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_edit_pipeline: { Args: { _profile_id: string }; Returns: boolean }
      can_edit_profile: { Args: { _profile_id: string }; Returns: boolean }
      can_view_profile: { Args: { _profile_id: string }; Returns: boolean }
      credit_action_packages: {
        Args: {
          _action: string
          _descricao?: string
          _packages: number
          _tenant: string
        }
        Returns: number
      }
      debit_action_balance: {
        Args: { _action: string; _job?: string; _qty: number; _tenant: string }
        Returns: string
      }
      default_tenant_id: { Args: never; Returns: string }
      ensure_app_user: { Args: never; Returns: undefined }
      is_backoffice: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      minhas_permissoes: {
        Args: never
        Returns: {
          action: string
          module: string
          profile_id: string
        }[]
      }
      set_my_onboarding: {
        Args: { _banner_hidden?: boolean; _seen?: boolean; _step?: number }
        Returns: undefined
      }
    }
    Enums: {
      etapa_consumo:
        | "cena_gemini"
        | "animacao_veo"
        | "montagem_json2video"
        | "busca_kalodata"
        | "roteiro_texto"
        | "narracao_elevenlabs"
        | "transcricao_audio"
        | "assistente"
        | "analise_video"
        | "apify_download"
      job_status:
        | "novo"
        | "produto_escolhido"
        | "roteiro_pronto"
        | "gerando_cenas"
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
        | "minuto_audio"
        | "usd_real"
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
        "transcricao_audio",
        "assistente",
        "analise_video",
        "apify_download",
      ],
      job_status: [
        "novo",
        "produto_escolhido",
        "roteiro_pronto",
        "gerando_cenas",
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
        "minuto_audio",
        "usd_real",
      ],
    },
  },
} as const
