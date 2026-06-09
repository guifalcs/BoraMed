export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_impersonation_log: {
        Row: {
          admin_email: string
          admin_id: string | null
          criado_em: string
          id: string
          ip: string | null
          target_email: string
          target_id: string | null
          target_name: string | null
          user_agent: string | null
        }
        Insert: {
          admin_email: string
          admin_id?: string | null
          criado_em?: string
          id?: string
          ip?: string | null
          target_email: string
          target_id?: string | null
          target_name?: string | null
          user_agent?: string | null
        }
        Update: {
          admin_email?: string
          admin_id?: string | null
          criado_em?: string
          id?: string
          ip?: string | null
          target_email?: string
          target_id?: string | null
          target_name?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      alternativa: {
        Row: {
          correta: boolean
          id: string
          imagem_url: string | null
          letra: string
          ordem: number
          questao_id: string
          texto: string
        }
        Insert: {
          correta?: boolean
          id?: string
          imagem_url?: string | null
          letra: string
          ordem: number
          questao_id: string
          texto: string
        }
        Update: {
          correta?: boolean
          id?: string
          imagem_url?: string | null
          letra?: string
          ordem?: number
          questao_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "alternativa_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
        ]
      }
      conquista_catalogo: {
        Row: {
          ativa: boolean
          categoria: string
          criado_em: string
          descricao: string
          icone: string
          id: string
          nome: string
          ordem: number
          secreta: boolean
          xp_recompensa: number
        }
        Insert: {
          ativa?: boolean
          categoria: string
          criado_em?: string
          descricao: string
          icone: string
          id: string
          nome: string
          ordem?: number
          secreta?: boolean
          xp_recompensa?: number
        }
        Update: {
          ativa?: boolean
          categoria?: string
          criado_em?: string
          descricao?: string
          icone?: string
          id?: string
          nome?: string
          ordem?: number
          secreta?: boolean
          xp_recompensa?: number
        }
        Relationships: []
      }
      desafio_diario: {
        Row: {
          criado_em: string
          data: string
          questao_id: string
        }
        Insert: {
          criado_em?: string
          data: string
          questao_id: string
        }
        Update: {
          criado_em?: string
          data?: string
          questao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desafio_diario_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
        ]
      }
      desafio_diario_resposta: {
        Row: {
          alternativa_id: string | null
          correta: boolean
          data: string
          respondido_em: string
          tempo_segundos: number | null
          user_id: string
          xp_ganho: number
        }
        Insert: {
          alternativa_id?: string | null
          correta: boolean
          data: string
          respondido_em?: string
          tempo_segundos?: number | null
          user_id: string
          xp_ganho?: number
        }
        Update: {
          alternativa_id?: string | null
          correta?: boolean
          data?: string
          respondido_em?: string
          tempo_segundos?: number | null
          user_id?: string
          xp_ganho?: number
        }
        Relationships: [
          {
            foreignKeyName: "desafio_diario_resposta_alternativa_id_fkey"
            columns: ["alternativa_id"]
            isOneToOne: false
            referencedRelation: "alternativa"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplina: {
        Row: {
          ativa: boolean
          criado_em: string
          id: string
          nome: string | null
          periodo: number
          sigla: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          id?: string
          nome?: string | null
          periodo: number
          sigla: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          id?: string
          nome?: string | null
          periodo?: number
          sigla?: string
        }
        Relationships: []
      }
      faculdade: {
        Row: {
          ativa: boolean
          criado_em: string
          id: string
          logo_url: string | null
          nome: string
          rede: string
          sigla: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          id?: string
          logo_url?: string | null
          nome: string
          rede: string
          sigla: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          id?: string
          logo_url?: string | null
          nome?: string
          rede?: string
          sigla?: string
        }
        Relationships: []
      }
      gamificacao_evento: {
        Row: {
          criado_em: string
          id: string
          idempotency_key: string
          metadata: Json
          tipo: string
          user_id: string
          xp: number
        }
        Insert: {
          criado_em?: string
          id?: string
          idempotency_key: string
          metadata?: Json
          tipo: string
          user_id: string
          xp: number
        }
        Update: {
          criado_em?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          tipo?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          competir_publico: boolean
          criado_em: string
          email: string
          faculdade_rede: string | null
          id: string
          papel: string
          tipo_usuario: string | null
        }
        Insert: {
          competir_publico?: boolean
          criado_em?: string
          email: string
          faculdade_rede?: string | null
          id: string
          papel?: string
          tipo_usuario?: string | null
        }
        Update: {
          competir_publico?: boolean
          criado_em?: string
          email?: string
          faculdade_rede?: string | null
          id?: string
          papel?: string
          tipo_usuario?: string | null
        }
        Relationships: []
      }
      prova: {
        Row: {
          arquivada: boolean
          criado_em: string
          faculdade_id: string | null
          formato: string | null
          id: string
          nome: string
          origem: string
          periodo: number
          publicada: boolean
          qtd_questoes: number
          rede: string | null
          subtipo: string | null
          subtipo_nacional: string | null
          tipo: string
        }
        Insert: {
          arquivada?: boolean
          criado_em?: string
          faculdade_id?: string | null
          formato?: string | null
          id?: string
          nome: string
          origem?: string
          periodo: number
          publicada?: boolean
          qtd_questoes?: number
          rede?: string | null
          subtipo?: string | null
          subtipo_nacional?: string | null
          tipo: string
        }
        Update: {
          arquivada?: boolean
          criado_em?: string
          faculdade_id?: string | null
          formato?: string | null
          id?: string
          nome?: string
          origem?: string
          periodo?: number
          publicada?: boolean
          qtd_questoes?: number
          rede?: string | null
          subtipo?: string | null
          subtipo_nacional?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prova_faculdade_id_fkey"
            columns: ["faculdade_id"]
            isOneToOne: false
            referencedRelation: "faculdade"
            referencedColumns: ["id"]
          },
        ]
      }
      prova_questao: {
        Row: {
          ordem: number
          prova_id: string
          questao_id: string
        }
        Insert: {
          ordem?: number
          prova_id: string
          questao_id: string
        }
        Update: {
          ordem?: number
          prova_id?: string
          questao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prova_questao_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "prova"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prova_questao_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
        ]
      }
      questao: {
        Row: {
          aprovada_em: string | null
          apto_desafio_diario: boolean
          atualizado_em: string
          autor_id: string | null
          codigo_externo: string | null
          criado_em: string
          disciplina_id: string | null
          enunciado: string
          enunciado_apoio: string | null
          explicacao: string | null
          explicacao_alternativas: Json | null
          fonte: string | null
          formato: string
          formato_prova: string | null
          id: string
          imagem_legenda: string | null
          imagem_url: string | null
          nivel_bloom: number | null
          ordem_na_prova: number | null
          origem_geracao: string
          prova_id: string | null
          publicada_em: string | null
          referencia: string | null
          resposta_correta_texto: string | null
          respostas_aceitas: string[] | null
          revisado: boolean
          revisor_id: string | null
          status: string
          taxa_acerto: number | null
          tipo_questao: string
          vezes_acertada: number
          vezes_respondida: number
        }
        Insert: {
          aprovada_em?: string | null
          apto_desafio_diario?: boolean
          atualizado_em?: string
          autor_id?: string | null
          codigo_externo?: string | null
          criado_em?: string
          disciplina_id?: string | null
          enunciado: string
          enunciado_apoio?: string | null
          explicacao?: string | null
          explicacao_alternativas?: Json | null
          fonte?: string | null
          formato: string
          formato_prova?: string | null
          id?: string
          imagem_legenda?: string | null
          imagem_url?: string | null
          nivel_bloom?: number | null
          ordem_na_prova?: number | null
          origem_geracao?: string
          prova_id?: string | null
          publicada_em?: string | null
          referencia?: string | null
          resposta_correta_texto?: string | null
          respostas_aceitas?: string[] | null
          revisado?: boolean
          revisor_id?: string | null
          status?: string
          taxa_acerto?: number | null
          tipo_questao?: string
          vezes_acertada?: number
          vezes_respondida?: number
        }
        Update: {
          aprovada_em?: string | null
          apto_desafio_diario?: boolean
          atualizado_em?: string
          autor_id?: string | null
          codigo_externo?: string | null
          criado_em?: string
          disciplina_id?: string | null
          enunciado?: string
          enunciado_apoio?: string | null
          explicacao?: string | null
          explicacao_alternativas?: Json | null
          fonte?: string | null
          formato?: string
          formato_prova?: string | null
          id?: string
          imagem_legenda?: string | null
          imagem_url?: string | null
          nivel_bloom?: number | null
          ordem_na_prova?: number | null
          origem_geracao?: string
          prova_id?: string | null
          publicada_em?: string | null
          referencia?: string | null
          resposta_correta_texto?: string | null
          respostas_aceitas?: string[] | null
          revisado?: boolean
          revisor_id?: string | null
          status?: string
          taxa_acerto?: number | null
          tipo_questao?: string
          vezes_acertada?: number
          vezes_respondida?: number
        }
        Relationships: [
          {
            foreignKeyName: "questao_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "prova"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_revisor_id_fkey"
            columns: ["revisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questao_tema: {
        Row: {
          principal: boolean
          questao_id: string
          tema_id: string
        }
        Insert: {
          principal?: boolean
          questao_id: string
          tema_id: string
        }
        Update: {
          principal?: boolean
          questao_id?: string
          tema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questao_tema_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_tema_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "tema"
            referencedColumns: ["id"]
          },
        ]
      }
      tema: {
        Row: {
          criado_em: string
          disciplina_id: string | null
          id: string
          nome: string
          parent_id: string | null
        }
        Insert: {
          criado_em?: string
          disciplina_id?: string | null
          id?: string
          nome: string
          parent_id?: string | null
        }
        Update: {
          criado_em?: string
          disciplina_id?: string | null
          id?: string
          nome?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tema_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tema_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tema"
            referencedColumns: ["id"]
          },
        ]
      }
      tentativa: {
        Row: {
          acertos: number
          criado_em: string
          finalizada_em: string | null
          id: string
          iniciada_em: string
          modo: string
          nota: number | null
          pausada_em: string | null
          prova_id: string
          status: string
          tempo_acumulado_segundos: number
          total_questoes: number
          total_respondidas: number
          user_id: string
        }
        Insert: {
          acertos?: number
          criado_em?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          modo: string
          nota?: number | null
          pausada_em?: string | null
          prova_id: string
          status?: string
          tempo_acumulado_segundos?: number
          total_questoes: number
          total_respondidas?: number
          user_id: string
        }
        Update: {
          acertos?: number
          criado_em?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          modo?: string
          nota?: number | null
          pausada_em?: string | null
          prova_id?: string
          status?: string
          tempo_acumulado_segundos?: number
          total_questoes?: number
          total_respondidas?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tentativa_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "prova"
            referencedColumns: ["id"]
          },
        ]
      }
      tentativa_resposta: {
        Row: {
          alternativa_id: string | null
          correta: boolean | null
          id: string
          ordem_na_tentativa: number | null
          questao_id: string
          respondida_em: string | null
          resposta_texto: string | null
          tempo_gasto_segundos: number | null
          tentativa_id: string
        }
        Insert: {
          alternativa_id?: string | null
          correta?: boolean | null
          id?: string
          ordem_na_tentativa?: number | null
          questao_id: string
          respondida_em?: string | null
          resposta_texto?: string | null
          tempo_gasto_segundos?: number | null
          tentativa_id: string
        }
        Update: {
          alternativa_id?: string | null
          correta?: boolean | null
          id?: string
          ordem_na_tentativa?: number | null
          questao_id?: string
          respondida_em?: string | null
          resposta_texto?: string | null
          tempo_gasto_segundos?: number | null
          tentativa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tentativa_resposta_alternativa_id_fkey"
            columns: ["alternativa_id"]
            isOneToOne: false
            referencedRelation: "alternativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tentativa_resposta_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tentativa_resposta_tentativa_id_fkey"
            columns: ["tentativa_id"]
            isOneToOne: false
            referencedRelation: "tentativa"
            referencedColumns: ["id"]
          },
        ]
      }
      user_conquista: {
        Row: {
          conquista_id: string
          desbloqueada_em: string
          user_id: string
        }
        Insert: {
          conquista_id: string
          desbloqueada_em?: string
          user_id: string
        }
        Update: {
          conquista_id?: string
          desbloqueada_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_conquista_conquista_id_fkey"
            columns: ["conquista_id"]
            isOneToOne: false
            referencedRelation: "conquista_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gamificacao_stats: {
        Row: {
          atualizado_em: string
          competir_publico: boolean
          freeze_usado_em: string | null
          freezes_disponiveis: number
          nivel: number
          semana_iso: string | null
          streak_atual: number
          streak_recorde: number
          ultimo_dia_ativo: string | null
          user_id: string
          xp_semana_atual: number
          xp_total: number
        }
        Insert: {
          atualizado_em?: string
          competir_publico?: boolean
          freeze_usado_em?: string | null
          freezes_disponiveis?: number
          nivel?: number
          semana_iso?: string | null
          streak_atual?: number
          streak_recorde?: number
          ultimo_dia_ativo?: string | null
          user_id: string
          xp_semana_atual?: number
          xp_total?: number
        }
        Update: {
          atualizado_em?: string
          competir_publico?: boolean
          freeze_usado_em?: string | null
          freezes_disponiveis?: number
          nivel?: number
          semana_iso?: string | null
          streak_atual?: number
          streak_recorde?: number
          ultimo_dia_ativo?: string | null
          user_id?: string
          xp_semana_atual?: number
          xp_total?: number
        }
        Relationships: []
      }
      user_onboarding_state: {
        Row: {
          atualizado_em: string
          completed_at: string | null
          criado_em: string
          current_step: string | null
          flow_key: string
          flow_version: number
          metadata: Json
          skipped_at: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          completed_at?: string | null
          criado_em?: string
          current_step?: string | null
          flow_key: string
          flow_version?: number
          metadata?: Json
          skipped_at?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          completed_at?: string | null
          criado_em?: string
          current_step?: string | null
          flow_key?: string
          flow_version?: number
          metadata?: Json
          skipped_at?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_questao: { Args: { p_id: string }; Returns: Json }
      admin_get_stats: { Args: never; Returns: Json }
      alterar_papel_usuario: {
        Args: { p_papel: string; p_user_id: string }
        Returns: {
          competir_publico: boolean
          criado_em: string
          email: string
          faculdade_rede: string | null
          id: string
          papel: string
          tipo_usuario: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      conceder_xp_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      finalizar_tentativa: {
        Args: { p_tempo_segundos?: number; p_tentativa_id: string }
        Returns: Json
      }
      gerar_simulado_personalizado: {
        Args: {
          p_formato?: string
          p_modo?: string
          p_qtd?: number
          p_tema_ids?: string[]
          p_tipo_questao?: string
        }
        Returns: Json
      }
      get_desafio_diario: { Args: never; Returns: Json }
      get_desempenho_por_tema: {
        Args: never
        Returns: {
          acertos: number
          taxa: number
          tema_nome: string
          total: number
        }[]
      }
      get_historico_kpis: { Args: never; Returns: Json }
      get_meu_xp: { Args: never; Returns: Json }
      get_minha_posicao_ranking: { Args: never; Returns: Json }
      get_minhas_conquistas: { Args: never; Returns: Json }
      get_ranking_global: { Args: { p_limite?: number }; Returns: Json }
      get_revisao_prova: { Args: { p_prova_id: string }; Returns: Json }
      get_ranking_semana: { Args: { p_limite?: number }; Returns: Json }
      get_streak_estudo: { Args: never; Returns: number }
      get_streak_estudo_v2: { Args: never; Returns: Json }
      iniciar_tentativa: {
        Args: { p_modo: string; p_prova_id: string }
        Returns: Json
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      is_super_admin: { Args: { uid?: string }; Returns: boolean }
      listar_temas_com_contagem: {
        Args: { p_tipo_questao?: string }
        Returns: {
          criado_em: string
          disciplina: string
          disciplina_id: string
          id: string
          nome: string
          parent_id: string
          periodo: number
          qtd_questoes: number
        }[]
      }
      responder_desafio_diario: {
        Args: { p_alternativa_id: string; p_tempo_segundos?: number }
        Returns: Json
      }
      retomar_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      verificar_conquistas_usuario: {
        Args: { p_user_id?: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

