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
      profiles: {
        Row: {
          atualizado_em: string
          avatar_url: string | null
          criado_em: string
          email: string
          id: string
          nome_completo: string | null
          periodo: number | null
          tipo_usuario: string | null
        }
        Insert: {
          atualizado_em?: string
          avatar_url?: string | null
          criado_em?: string
          email: string
          id: string
          nome_completo?: string | null
          periodo?: number | null
          tipo_usuario?: string | null
        }
        Update: {
          atualizado_em?: string
          avatar_url?: string | null
          criado_em?: string
          email?: string
          id?: string
          nome_completo?: string | null
          periodo?: number | null
          tipo_usuario?: string | null
        }
        Relationships: []
      }
      prova: {
        Row: {
          ano: number
          criado_em: string
          faculdade_id: string
          id: string
          nome: string
          periodo: number
          qtd_questoes: number
          semestre: number
          subtipo_nacional: string | null
          tempo_sugerido_minutos: number | null
          tipo: string
        }
        Insert: {
          ano: number
          criado_em?: string
          faculdade_id: string
          id?: string
          nome: string
          periodo: number
          qtd_questoes?: number
          semestre: number
          subtipo_nacional?: string | null
          tempo_sugerido_minutos?: number | null
          tipo: string
        }
        Update: {
          ano?: number
          criado_em?: string
          faculdade_id?: string
          id?: string
          nome?: string
          periodo?: number
          qtd_questoes?: number
          semestre?: number
          subtipo_nacional?: string | null
          tempo_sugerido_minutos?: number | null
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
      questao: {
        Row: {
          atualizado_em: string
          codigo_externo: string | null
          criado_em: string
          dificuldade: number | null
          disciplina: string | null
          enunciado: string
          enunciado_apoio: string | null
          explicacao: string | null
          explicacao_alternativas: Json | null
          fonte: string | null
          formato: string
          id: string
          imagem_legenda: string | null
          imagem_url: string | null
          ordem_na_prova: number | null
          periodo: number | null
          prova_id: string | null
          referencia: string | null
          resposta_correta_texto: string | null
          respostas_aceitas: string[] | null
          revisado: boolean
          status: string
          taxa_acerto: number | null
          vezes_acertada: number
          vezes_respondida: number
        }
        Insert: {
          atualizado_em?: string
          codigo_externo?: string | null
          criado_em?: string
          dificuldade?: number | null
          disciplina?: string | null
          enunciado: string
          enunciado_apoio?: string | null
          explicacao?: string | null
          explicacao_alternativas?: Json | null
          fonte?: string | null
          formato: string
          id?: string
          imagem_legenda?: string | null
          imagem_url?: string | null
          ordem_na_prova?: number | null
          periodo?: number | null
          prova_id?: string | null
          referencia?: string | null
          resposta_correta_texto?: string | null
          respostas_aceitas?: string[] | null
          revisado?: boolean
          status?: string
          taxa_acerto?: number | null
          vezes_acertada?: number
          vezes_respondida?: number
        }
        Update: {
          atualizado_em?: string
          codigo_externo?: string | null
          criado_em?: string
          dificuldade?: number | null
          disciplina?: string | null
          enunciado?: string
          enunciado_apoio?: string | null
          explicacao?: string | null
          explicacao_alternativas?: Json | null
          fonte?: string | null
          formato?: string
          id?: string
          imagem_legenda?: string | null
          imagem_url?: string | null
          ordem_na_prova?: number | null
          periodo?: number | null
          prova_id?: string | null
          referencia?: string | null
          resposta_correta_texto?: string | null
          respostas_aceitas?: string[] | null
          revisado?: boolean
          status?: string
          taxa_acerto?: number | null
          vezes_acertada?: number
          vezes_respondida?: number
        }
        Relationships: [
          {
            foreignKeyName: "questao_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "prova"
            referencedColumns: ["id"]
          },
        ]
      }
      questao_tema: {
        Row: {
          questao_id: string
          tema_id: string
        }
        Insert: {
          questao_id: string
          tema_id: string
        }
        Update: {
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
          disciplina: string | null
          id: string
          nome: string
          parent_id: string | null
          periodo: number | null
        }
        Insert: {
          criado_em?: string
          disciplina?: string | null
          id?: string
          nome: string
          parent_id?: string | null
          periodo?: number | null
        }
        Update: {
          criado_em?: string
          disciplina?: string | null
          id?: string
          nome?: string
          parent_id?: string | null
          periodo?: number | null
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      finalizar_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      iniciar_tentativa: {
        Args: { p_modo: string; p_prova_id: string }
        Returns: Json
      }
      pausar_tentativa: { Args: { p_tentativa_id: string }; Returns: undefined }
      retomar_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
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
