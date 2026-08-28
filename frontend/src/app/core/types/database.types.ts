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
          atualizado_em: string
          correta: boolean
          criado_em: string
          id: string
          imagem_url: string | null
          letra: string
          ordem: number
          questao_id: string
          texto: string
        }
        Insert: {
          atualizado_em?: string
          correta?: boolean
          criado_em?: string
          id?: string
          imagem_url?: string | null
          letra: string
          ordem: number
          questao_id: string
          texto: string
        }
        Update: {
          atualizado_em?: string
          correta?: boolean
          criado_em?: string
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
      assinatura: {
        Row: {
          atualizado_em: string
          cancelada_em: string | null
          cortesia: boolean
          criado_em: string
          data_inicio: string | null
          id: string
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          plano_id: string | null
          proxima_cobranca: string | null
          status: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          cancelada_em?: string | null
          cortesia?: boolean
          criado_em?: string
          data_inicio?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          plano_id?: string | null
          proxima_cobranca?: string | null
          status?: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          cancelada_em?: string | null
          cortesia?: boolean
          criado_em?: string
          data_inicio?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          plano_id?: string | null
          proxima_cobranca?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos: {
        Row: {
          ativo: boolean
          criado_em: string
          criado_por: string | null
          id: string
          imagem_url: string
          mensagem: string | null
          segmento: string
          titulo: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          imagem_url: string
          mensagem?: string | null
          segmento?: string
          titulo?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          imagem_url?: string
          mensagem?: string | null
          segmento?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avisos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_vistos: {
        Row: {
          aviso_id: string
          user_id: string
          visto_em: string
        }
        Insert: {
          aviso_id: string
          user_id: string
          visto_em?: string
        }
        Update: {
          aviso_id?: string
          user_id?: string
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_vistos_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "avisos"
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
      cupom: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo: string
          criado_em: string
          descricao: string | null
          expira_em: string | null
          id: string
          max_por_usuario: number | null
          max_usos: number | null
          plano_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo: string
          criado_em?: string
          descricao?: string | null
          expira_em?: string | null
          id?: string
          max_por_usuario?: number | null
          max_usos?: number | null
          plano_id?: string | null
          tipo?: string
          valor: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: string
          criado_em?: string
          descricao?: string | null
          expira_em?: string | null
          id?: string
          max_por_usuario?: number | null
          max_usos?: number | null
          plano_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cupom_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "plano"
            referencedColumns: ["id"]
          },
        ]
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
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          id: string
          nome: string | null
          periodo: number
          sigla: string
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string | null
          periodo: number
          sigla: string
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string | null
          periodo?: number
          sigla?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplina_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campanha: {
        Row: {
          assunto: string
          atualizado_em: string
          concluida_em: string | null
          corpo_html: string
          criado_em: string
          criado_por: string | null
          erro: string | null
          id: string
          nome: string
          remetente: string
          segmento: string
          status: string
          total_cancelados: number
          total_destinatarios: number
          total_enviados: number
          total_falhas: number
        }
        Insert: {
          assunto: string
          atualizado_em?: string
          concluida_em?: string | null
          corpo_html: string
          criado_em?: string
          criado_por?: string | null
          erro?: string | null
          id?: string
          nome: string
          remetente: string
          segmento: string
          status?: string
          total_cancelados?: number
          total_destinatarios?: number
          total_enviados?: number
          total_falhas?: number
        }
        Update: {
          assunto?: string
          atualizado_em?: string
          concluida_em?: string | null
          corpo_html?: string
          criado_em?: string
          criado_por?: string | null
          erro?: string | null
          id?: string
          nome?: string
          remetente?: string
          segmento?: string
          status?: string
          total_cancelados?: number
          total_destinatarios?: number
          total_enviados?: number
          total_falhas?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_campanha_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campanha_destinatario: {
        Row: {
          campanha_id: string
          criado_em: string
          email: string
          email_token: string
          enviado_em: string | null
          erro: string | null
          id: string
          nome_completo: string | null
          resend_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          campanha_id: string
          criado_em?: string
          email: string
          email_token: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome_completo?: string | null
          resend_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          campanha_id?: string
          criado_em?: string
          email?: string
          email_token?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome_completo?: string | null
          resend_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campanha_destinatario_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "email_campanha"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campanha_destinatario_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faculdade: {
        Row: {
          ativa: boolean
          criado_em: string
          criado_por: string | null
          id: string
          logo_url: string | null
          nome: string
          rede: string
          sigla: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          rede: string
          sigla: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          rede?: string
          sigla?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculdade_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_cards: {
        Row: {
          atualizado_em: string
          criado_em: string
          deck_id: string
          frente: string
          frente_imagem_url: string | null
          id: string
          posicao: number
          verso: string
          verso_imagem_url: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          deck_id: string
          frente: string
          frente_imagem_url?: string | null
          id?: string
          posicao?: number
          verso: string
          verso_imagem_url?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          deck_id?: string
          frente?: string
          frente_imagem_url?: string | null
          id?: string
          posicao?: number
          verso?: string
          verso_imagem_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_deck_likes: {
        Row: {
          criado_em: string
          deck_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          deck_id: string
          user_id: string
        }
        Update: {
          criado_em?: string
          deck_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_deck_likes_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks: {
        Row: {
          atualizado_em: string
          cards_count: number
          criado_em: string
          descricao: string | null
          id: string
          likes_count: number
          oficial: boolean
          publico: boolean
          titulo: string
          user_id: string | null
        }
        Insert: {
          atualizado_em?: string
          cards_count?: number
          criado_em?: string
          descricao?: string | null
          id?: string
          likes_count?: number
          oficial?: boolean
          publico?: boolean
          titulo: string
          user_id?: string | null
        }
        Update: {
          atualizado_em?: string
          cards_count?: number
          criado_em?: string
          descricao?: string | null
          id?: string
          likes_count?: number
          oficial?: boolean
          publico?: boolean
          titulo?: string
          user_id?: string | null
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
      ia_agente: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          criado_em: string
          id: string
          limite_diario: number
          max_resposta_chars: number
          nome: string
          persona: string | null
          regras_correcao: string | null
          regras_extras: string | null
          slug: string
          tamanho_feedback: string | null
          temperatura: number
          tom: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          id?: string
          limite_diario?: number
          max_resposta_chars?: number
          nome: string
          persona?: string | null
          regras_correcao?: string | null
          regras_extras?: string | null
          slug: string
          tamanho_feedback?: string | null
          temperatura?: number
          tom?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          criado_em?: string
          id?: string
          limite_diario?: number
          max_resposta_chars?: number
          nome?: string
          persona?: string | null
          regras_correcao?: string | null
          regras_extras?: string | null
          slug?: string
          tamanho_feedback?: string | null
          temperatura?: number
          tom?: string | null
        }
        Relationships: []
      }
      material_arquivo: {
        Row: {
          ativo: boolean
          categoria_id: string
          criado_em: string
          descricao: string | null
          id: string
          mime_type: string
          ordem: number
          storage_path: string
          tamanho_bytes: number | null
          titulo: string
          topico_id: string | null
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          mime_type?: string
          ordem?: number
          storage_path: string
          tamanho_bytes?: number | null
          titulo: string
          topico_id?: string | null
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          mime_type?: string
          ordem?: number
          storage_path?: string
          tamanho_bytes?: number | null
          titulo?: string
          topico_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_arquivo_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "material_categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_arquivo_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "material_topico"
            referencedColumns: ["id"]
          },
        ]
      }
      material_categoria: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          gradiente: string
          icone: string
          id: string
          ordem: number
          slug: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          gradiente?: string
          icone?: string
          id?: string
          ordem?: number
          slug: string
          titulo: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          gradiente?: string
          icone?: string
          id?: string
          ordem?: number
          slug?: string
          titulo?: string
        }
        Relationships: []
      }
      material_topico: {
        Row: {
          ativo: boolean
          categoria_id: string
          criado_em: string
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          criado_em?: string
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          criado_em?: string
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_topico_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "material_categoria"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_webhook_evento: {
        Row: {
          id: string
          payload: Json | null
          processado_em: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processado_em?: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processado_em?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          criado_em: string
          dados: Json | null
          id: string
          lida: boolean
          mensagem: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          dados?: Json | null
          id?: string
          lida?: boolean
          mensagem?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          criado_em?: string
          dados?: Json | null
          id?: string
          lida?: boolean
          mensagem?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      pagamento: {
        Row: {
          assinatura_id: string | null
          atualizado_em: string
          criado_em: string
          id: string
          intencao_id: string | null
          liquido_centavos: number | null
          metodo_pagamento: string | null
          moeda: string
          mp_authorized_payment_id: string | null
          mp_payment_id: string | null
          parcelas: number | null
          processado_em: string | null
          status: string
          status_detail: string | null
          user_id: string
          valor_centavos: number | null
        }
        Insert: {
          assinatura_id?: string | null
          atualizado_em?: string
          criado_em?: string
          id?: string
          intencao_id?: string | null
          liquido_centavos?: number | null
          metodo_pagamento?: string | null
          moeda?: string
          mp_authorized_payment_id?: string | null
          mp_payment_id?: string | null
          parcelas?: number | null
          processado_em?: string | null
          status?: string
          status_detail?: string | null
          user_id: string
          valor_centavos?: number | null
        }
        Update: {
          assinatura_id?: string | null
          atualizado_em?: string
          criado_em?: string
          id?: string
          intencao_id?: string | null
          liquido_centavos?: number | null
          metodo_pagamento?: string | null
          moeda?: string
          mp_authorized_payment_id?: string | null
          mp_payment_id?: string | null
          parcelas?: number | null
          processado_em?: string | null
          status?: string
          status_detail?: string | null
          user_id?: string
          valor_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_intencao_id_fkey"
            columns: ["intencao_id"]
            isOneToOne: false
            referencedRelation: "pagamento_intencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamento_intencao: {
        Row: {
          atualizado_em: string
          criado_em: string
          cupom_id: string | null
          desconto_centavos: number
          expira_em: string | null
          id: string
          idempotency_key: string
          metodo: string | null
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          parcelas: number | null
          plano_id: string | null
          status: string
          status_detail: string | null
          tipo: string
          user_id: string
          valor_centavos: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          cupom_id?: string | null
          desconto_centavos?: number
          expira_em?: string | null
          id?: string
          idempotency_key: string
          metodo?: string | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          parcelas?: number | null
          plano_id?: string | null
          status?: string
          status_detail?: string | null
          tipo: string
          user_id: string
          valor_centavos: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          cupom_id?: string | null
          desconto_centavos?: number
          expira_em?: string | null
          id?: string
          idempotency_key?: string
          metodo?: string | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          parcelas?: number | null
          plano_id?: string | null
          status?: string
          status_detail?: string | null
          tipo?: string
          user_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_intencao_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_intencao_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "plano"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_intencao_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      palavra_proibida: {
        Row: {
          criado_em: string
          id: string
          termo: string
        }
        Insert: {
          criado_em?: string
          id?: string
          termo: string
        }
        Update: {
          criado_em?: string
          id?: string
          termo?: string
        }
        Relationships: []
      }
      plano: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          frequency: number
          frequency_type: string
          id: string
          moeda: string
          mp_init_point: string | null
          mp_preapproval_plan_id: string | null
          nome: string
          ordem: number
          preco_centavos: number
          recorrente: boolean
          slug: string
          tier: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          frequency?: number
          frequency_type?: string
          id?: string
          moeda?: string
          mp_init_point?: string | null
          mp_preapproval_plan_id?: string | null
          nome: string
          ordem?: number
          preco_centavos: number
          recorrente?: boolean
          slug: string
          tier?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          frequency?: number
          frequency_type?: string
          id?: string
          moeda?: string
          mp_init_point?: string | null
          mp_preapproval_plan_id?: string | null
          nome?: string
          ordem?: number
          preco_centavos?: number
          recorrente?: boolean
          slug?: string
          tier?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          atualizado_em: string
          avatar_url: string | null
          banido: boolean
          banido_em: string | null
          banido_por: string | null
          competir_publico: boolean
          criado_em: string
          email: string
          email_marketing_optout: boolean
          email_marketing_optout_em: string | null
          email_token: string
          faculdade_unidade: string | null
          id: string
          motivo_banimento: string | null
          nome_completo: string | null
          papel: string
          tipo_usuario: string | null
          ultimo_login: string | null
        }
        Insert: {
          atualizado_em?: string
          avatar_url?: string | null
          banido?: boolean
          banido_em?: string | null
          banido_por?: string | null
          competir_publico?: boolean
          criado_em?: string
          email: string
          email_marketing_optout?: boolean
          email_marketing_optout_em?: string | null
          email_token?: string
          faculdade_unidade?: string | null
          id: string
          motivo_banimento?: string | null
          nome_completo?: string | null
          papel?: string
          tipo_usuario?: string | null
          ultimo_login?: string | null
        }
        Update: {
          atualizado_em?: string
          avatar_url?: string | null
          banido?: boolean
          banido_em?: string | null
          banido_por?: string | null
          competir_publico?: boolean
          criado_em?: string
          email?: string
          email_marketing_optout?: boolean
          email_marketing_optout_em?: string | null
          email_token?: string
          faculdade_unidade?: string | null
          id?: string
          motivo_banimento?: string | null
          nome_completo?: string | null
          papel?: string
          tipo_usuario?: string | null
          ultimo_login?: string | null
        }
        Relationships: []
      }
      prova: {
        Row: {
          arquivada: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          disciplina_id: string | null
          faculdade_id: string | null
          formato: string | null
          id: string
          nome: string
          origem: string
          periodo: number | null
          publicada: boolean
          qtd_questoes: number
          rede: string | null
          subtipo: string | null
          subtipo_nacional: string | null
          tipo: string
        }
        Insert: {
          arquivada?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          disciplina_id?: string | null
          faculdade_id?: string | null
          formato?: string | null
          id?: string
          nome: string
          origem?: string
          periodo?: number | null
          publicada?: boolean
          qtd_questoes?: number
          rede?: string | null
          subtipo?: string | null
          subtipo_nacional?: string | null
          tipo: string
        }
        Update: {
          arquivada?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          disciplina_id?: string | null
          faculdade_id?: string | null
          formato?: string | null
          id?: string
          nome?: string
          origem?: string
          periodo?: number | null
          publicada?: boolean
          qtd_questoes?: number
          rede?: string | null
          subtipo?: string | null
          subtipo_nacional?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prova_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prova_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplina"
            referencedColumns: ["id"]
          },
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
          anulada: boolean
          aprovada_em: string | null
          apto_desafio_diario: boolean
          atualizado_em: string
          autor_id: string | null
          codigo_externo: string | null
          criado_em: string
          criterios_correcao: string | null
          disciplina_id: string | null
          enunciado: string
          enunciado_apoio: string | null
          explicacao: string | null
          explicacao_alternativas: Json | null
          explicacao_original: string | null
          fonte: string | null
          formato: string
          formato_prova: string | null
          grupo_equivalencia_id: string | null
          id: string
          imagem_legenda: string | null
          imagem_url: string | null
          nivel_bloom: number | null
          ordem_na_prova: number | null
          origem_geracao: string
          pontos_chave: Json
          prova_id: string | null
          publicada_em: string | null
          recurso_texto: string | null
          referencia: string | null
          resposta_correta_texto: string | null
          resposta_modelo: string | null
          respostas_aceitas: string[] | null
          revisado: boolean
          revisao_conversao: string | null
          revisor_id: string | null
          status: string
          taxa_acerto: number | null
          tipo_questao: string
          vezes_acertada: number
          vezes_respondida: number
        }
        Insert: {
          anulada?: boolean
          aprovada_em?: string | null
          apto_desafio_diario?: boolean
          atualizado_em?: string
          autor_id?: string | null
          codigo_externo?: string | null
          criado_em?: string
          criterios_correcao?: string | null
          disciplina_id?: string | null
          enunciado: string
          enunciado_apoio?: string | null
          explicacao?: string | null
          explicacao_alternativas?: Json | null
          explicacao_original?: string | null
          fonte?: string | null
          formato: string
          formato_prova?: string | null
          grupo_equivalencia_id?: string | null
          id?: string
          imagem_legenda?: string | null
          imagem_url?: string | null
          nivel_bloom?: number | null
          ordem_na_prova?: number | null
          origem_geracao?: string
          pontos_chave?: Json
          prova_id?: string | null
          publicada_em?: string | null
          recurso_texto?: string | null
          referencia?: string | null
          resposta_correta_texto?: string | null
          resposta_modelo?: string | null
          respostas_aceitas?: string[] | null
          revisado?: boolean
          revisao_conversao?: string | null
          revisor_id?: string | null
          status?: string
          taxa_acerto?: number | null
          tipo_questao?: string
          vezes_acertada?: number
          vezes_respondida?: number
        }
        Update: {
          anulada?: boolean
          aprovada_em?: string | null
          apto_desafio_diario?: boolean
          atualizado_em?: string
          autor_id?: string | null
          codigo_externo?: string | null
          criado_em?: string
          criterios_correcao?: string | null
          disciplina_id?: string | null
          enunciado?: string
          enunciado_apoio?: string | null
          explicacao?: string | null
          explicacao_alternativas?: Json | null
          explicacao_original?: string | null
          fonte?: string | null
          formato?: string
          formato_prova?: string | null
          grupo_equivalencia_id?: string | null
          id?: string
          imagem_legenda?: string | null
          imagem_url?: string | null
          nivel_bloom?: number | null
          ordem_na_prova?: number | null
          origem_geracao?: string
          pontos_chave?: Json
          prova_id?: string | null
          publicada_em?: string | null
          recurso_texto?: string | null
          referencia?: string | null
          resposta_correta_texto?: string | null
          resposta_modelo?: string | null
          respostas_aceitas?: string[] | null
          revisado?: boolean
          revisao_conversao?: string | null
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
      questao_backup_formatacao: {
        Row: {
          enunciado: string | null
          enunciado_apoio: string | null
          explicacao: string | null
          id: string
          salvo_em: string
        }
        Insert: {
          enunciado?: string | null
          enunciado_apoio?: string | null
          explicacao?: string | null
          id: string
          salvo_em?: string
        }
        Update: {
          enunciado?: string | null
          enunciado_apoio?: string | null
          explicacao?: string | null
          id?: string
          salvo_em?: string
        }
        Relationships: []
      }
      questao_comentario: {
        Row: {
          atualizado_em: string
          conteudo: string
          criado_em: string
          dislikes: number
          editado: boolean
          id: string
          likes: number
          parent_id: string | null
          questao_id: string
          status: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          conteudo: string
          criado_em?: string
          dislikes?: number
          editado?: boolean
          id?: string
          likes?: number
          parent_id?: string | null
          questao_id: string
          status?: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          conteudo?: string
          criado_em?: string
          dislikes?: number
          editado?: boolean
          id?: string
          likes?: number
          parent_id?: string | null
          questao_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questao_comentario_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "questao_comentario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_comentario_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
        ]
      }
      questao_comentario_denuncia: {
        Row: {
          comentario_id: string
          criado_em: string
          id: string
          motivo: string | null
          user_id: string
        }
        Insert: {
          comentario_id: string
          criado_em?: string
          id?: string
          motivo?: string | null
          user_id: string
        }
        Update: {
          comentario_id?: string
          criado_em?: string
          id?: string
          motivo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questao_comentario_denuncia_comentario_id_fkey"
            columns: ["comentario_id"]
            isOneToOne: false
            referencedRelation: "questao_comentario"
            referencedColumns: ["id"]
          },
        ]
      }
      questao_comentario_voto: {
        Row: {
          comentario_id: string
          criado_em: string
          id: string
          user_id: string
          valor: number
        }
        Insert: {
          comentario_id: string
          criado_em?: string
          id?: string
          user_id: string
          valor: number
        }
        Update: {
          comentario_id?: string
          criado_em?: string
          id?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "questao_comentario_voto_comentario_id_fkey"
            columns: ["comentario_id"]
            isOneToOne: false
            referencedRelation: "questao_comentario"
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
      resposta_correcao: {
        Row: {
          atualizado_em: string
          criado_em: string
          custo_usd: number | null
          erro_detalhe: string | null
          erros: Json | null
          feedback: string | null
          id: string
          modelo: string | null
          num_tentativas: number
          pontos: number | null
          pontos_atendidos: Json | null
          pontos_faltantes: Json | null
          provider: string | null
          status: string
          tentativa_resposta_id: string
          tokens_prompt: number | null
          tokens_resposta: number | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          custo_usd?: number | null
          erro_detalhe?: string | null
          erros?: Json | null
          feedback?: string | null
          id?: string
          modelo?: string | null
          num_tentativas?: number
          pontos?: number | null
          pontos_atendidos?: Json | null
          pontos_faltantes?: Json | null
          provider?: string | null
          status?: string
          tentativa_resposta_id: string
          tokens_prompt?: number | null
          tokens_resposta?: number | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          custo_usd?: number | null
          erro_detalhe?: string | null
          erros?: Json | null
          feedback?: string | null
          id?: string
          modelo?: string | null
          num_tentativas?: number
          pontos?: number | null
          pontos_atendidos?: Json | null
          pontos_faltantes?: Json | null
          provider?: string | null
          status?: string
          tentativa_resposta_id?: string
          tokens_prompt?: number | null
          tokens_resposta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resposta_correcao_tentativa_resposta_id_fkey"
            columns: ["tentativa_resposta_id"]
            isOneToOne: true
            referencedRelation: "tentativa_resposta"
            referencedColumns: ["id"]
          },
        ]
      }
      suporte_anexos: {
        Row: {
          criado_em: string
          id: string
          mensagem_id: string
          mime_type: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
          ticket_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          mensagem_id: string
          mime_type: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
          ticket_id: string
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          mensagem_id?: string
          mime_type?: string
          nome_arquivo?: string
          storage_path?: string
          tamanho_bytes?: number
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suporte_anexos_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "suporte_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suporte_anexos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "suporte_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      suporte_faq: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          criado_em: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          criado_em?: string
          id?: string
          ordem?: number
          pergunta: string
          resposta: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          criado_em?: string
          id?: string
          ordem?: number
          pergunta?: string
          resposta?: string
        }
        Relationships: []
      }
      suporte_mensagens: {
        Row: {
          autor_id: string
          criado_em: string
          id: string
          is_admin: boolean
          mensagem: string
          ticket_id: string
        }
        Insert: {
          autor_id: string
          criado_em?: string
          id?: string
          is_admin?: boolean
          mensagem: string
          ticket_id: string
        }
        Update: {
          autor_id?: string
          criado_em?: string
          id?: string
          is_admin?: boolean
          mensagem?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suporte_mensagens_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "suporte_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      suporte_tickets: {
        Row: {
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          id: string
          status: string
          titulo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          categoria: string
          criado_em?: string
          descricao: string
          id?: string
          status?: string
          titulo: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          descricao?: string
          id?: string
          status?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      tema: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          disciplina_id: string | null
          id: string
          nome: string
          parent_id: string | null
          tipos_prova: string[] | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          disciplina_id?: string | null
          id?: string
          nome: string
          parent_id?: string | null
          tipos_prova?: string[] | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          disciplina_id?: string | null
          id?: string
          nome?: string
          parent_id?: string | null
          tipos_prova?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "tema_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          favorito: boolean
          finalizada_em: string | null
          id: string
          iniciada_em: string
          modo: string
          nota: number | null
          pausada_em: string | null
          pontos: number | null
          prova_id: string | null
          prova_snapshot: Json | null
          status: string
          tempo_acumulado_segundos: number
          total_pontuaveis: number | null
          total_questoes: number
          total_respondidas: number
          user_id: string
        }
        Insert: {
          acertos?: number
          criado_em?: string
          favorito?: boolean
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          modo: string
          nota?: number | null
          pausada_em?: string | null
          pontos?: number | null
          prova_id?: string | null
          prova_snapshot?: Json | null
          status?: string
          tempo_acumulado_segundos?: number
          total_pontuaveis?: number | null
          total_questoes: number
          total_respondidas?: number
          user_id: string
        }
        Update: {
          acertos?: number
          criado_em?: string
          favorito?: boolean
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          modo?: string
          nota?: number | null
          pausada_em?: string | null
          pontos?: number | null
          prova_id?: string | null
          prova_snapshot?: Json | null
          status?: string
          tempo_acumulado_segundos?: number
          total_pontuaveis?: number | null
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
      tentativa_questao_anotacao: {
        Row: {
          atualizado_em: string
          conteudo: string
          criado_em: string
          id: string
          questao_id: string
          tentativa_id: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          conteudo: string
          criado_em?: string
          id?: string
          questao_id: string
          tentativa_id: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          conteudo?: string
          criado_em?: string
          id?: string
          questao_id?: string
          tentativa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tentativa_questao_anotacao_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tentativa_questao_anotacao_tentativa_id_fkey"
            columns: ["tentativa_id"]
            isOneToOne: false
            referencedRelation: "tentativa"
            referencedColumns: ["id"]
          },
        ]
      }
      tentativa_resposta: {
        Row: {
          alternativa_id: string | null
          anulada_usuario: boolean
          correta: boolean | null
          enviada_em: string | null
          id: string
          ordem_na_tentativa: number | null
          pontos: number | null
          questao_id: string
          respondida_em: string | null
          resposta_texto: string | null
          tempo_gasto_segundos: number | null
          tentativa_id: string
        }
        Insert: {
          alternativa_id?: string | null
          anulada_usuario?: boolean
          correta?: boolean | null
          enviada_em?: string | null
          id?: string
          ordem_na_tentativa?: number | null
          pontos?: number | null
          questao_id: string
          respondida_em?: string | null
          resposta_texto?: string | null
          tempo_gasto_segundos?: number | null
          tentativa_id: string
        }
        Update: {
          alternativa_id?: string | null
          anulada_usuario?: boolean
          correta?: boolean | null
          enviada_em?: string | null
          id?: string
          ordem_na_tentativa?: number | null
          pontos?: number | null
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
      admin_ativar_assinatura_manual: {
        Args: { p_pago_em?: string; p_plano_slug: string; p_user_email: string }
        Returns: Json
      }
      admin_atualizar_status_ticket: {
        Args: { p_status: string; p_ticket_id: string }
        Returns: {
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          id: string
          status: string
          titulo: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_banir_usuario: {
        Args: { p_motivo?: string; p_user_id: string }
        Returns: {
          atualizado_em: string
          avatar_url: string | null
          banido: boolean
          banido_em: string | null
          banido_por: string | null
          competir_publico: boolean
          criado_em: string
          email: string
          email_marketing_optout: boolean
          email_marketing_optout_em: string | null
          email_token: string
          faculdade_unidade: string | null
          id: string
          motivo_banimento: string | null
          nome_completo: string | null
          papel: string
          tipo_usuario: string | null
          ultimo_login: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_buscar_questao_ids_por_texto: {
        Args: { p_termo: string }
        Returns: {
          questao_id: string
        }[]
      }
      admin_contar_publico_email: {
        Args: { p_segmento: string }
        Returns: number
      }
      admin_criar_faq: {
        Args: { p_categoria?: string; p_pergunta: string; p_resposta: string }
        Returns: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          criado_em: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_faq"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_criar_gemea_discursiva: {
        Args: {
          p_criterios_correcao: string
          p_enunciado: string
          p_explicacao: string
          p_origem_id: string
          p_pontos_chave: Json
          p_resposta_modelo: string
        }
        Returns: string
      }
      admin_criar_prova_com_questoes: {
        Args: {
          p_prova: Json
          p_questoes_existentes?: string[]
          p_questoes_novas?: Json
        }
        Returns: {
          arquivada: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          disciplina_id: string | null
          faculdade_id: string | null
          formato: string | null
          id: string
          nome: string
          origem: string
          periodo: number | null
          publicada: boolean
          qtd_questoes: number
          rede: string | null
          subtipo: string | null
          subtipo_nacional: string | null
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "prova"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_deletar_disciplina: {
        Args: { p_disciplina_id: string }
        Returns: Json
      }
      admin_deletar_faq: { Args: { p_id: string }; Returns: undefined }
      admin_deletar_prova: { Args: { p_prova_id: string }; Returns: Json }
      admin_deletar_questao: { Args: { p_questao_id: string }; Returns: Json }
      admin_deletar_tema: { Args: { p_tema_id: string }; Returns: Json }
      admin_desbanir_usuario: {
        Args: { p_user_id: string }
        Returns: {
          atualizado_em: string
          avatar_url: string | null
          banido: boolean
          banido_em: string | null
          banido_por: string | null
          competir_publico: boolean
          criado_em: string
          email: string
          email_marketing_optout: boolean
          email_marketing_optout_em: string | null
          email_token: string
          faculdade_unidade: string | null
          id: string
          motivo_banimento: string | null
          nome_completo: string | null
          papel: string
          tipo_usuario: string | null
          ultimo_login: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_detalhar_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      admin_enviar_notificacao: {
        Args: {
          p_mensagem?: string
          p_segmento?: string
          p_tipo: string
          p_titulo: string
          p_user_id?: string
        }
        Returns: number
      }
      admin_get_distribuicao_unidades: { Args: never; Returns: Json }
      admin_get_financeiro: { Args: never; Returns: Json }
      admin_get_flashcards_stats: { Args: never; Returns: Json }
      admin_get_metricas_ia: { Args: never; Returns: Json }
      admin_get_metricas_usuario: {
        Args: { p_ate?: string; p_desde?: string; p_user_id: string }
        Returns: Json
      }
      admin_get_questao: { Args: { p_id: string }; Returns: Json }
      admin_get_stats: { Args: never; Returns: Json }
      admin_get_uso_plataforma: { Args: never; Returns: Json }
      admin_get_uso_usuarios_dia: {
        Args: { p_dia: string; p_limit?: number }
        Returns: Json
      }
      admin_liberar_acesso_gratuito: {
        Args: { p_meses?: number; p_user_id: string }
        Returns: Json
      }
      admin_listar_avisos: {
        Args: never
        Returns: {
          ativo: boolean
          criado_em: string
          criado_por: string | null
          id: string
          imagem_url: string
          mensagem: string | null
          segmento: string
          titulo: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "avisos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_listar_campanhas_email: {
        Args: { p_limit?: number }
        Returns: {
          assunto: string
          criado_em: string
          criado_por_email: string
          erro: string
          id: string
          nome: string
          segmento: string
          status: string
          total_cancelados: number
          total_destinatarios: number
          total_enviados: number
          total_falhas: number
        }[]
      }
      admin_listar_destinatarios_campanha: {
        Args: {
          p_campanha_id: string
          p_limit?: number
          p_offset?: number
          p_status?: string
        }
        Returns: {
          email: string
          enviado_em: string
          erro: string
          nome_completo: string
          resend_id: string
          status: string
          total: number
        }[]
      }
      admin_listar_faq: {
        Args: never
        Returns: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          criado_em: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }[]
        SetofOptions: {
          from: "*"
          to: "suporte_faq"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_listar_notificacoes: {
        Args: { p_limit?: number }
        Returns: {
          criado_em: string
          id: string
          lida: boolean
          mensagem: string
          tipo: string
          titulo: string
          user_email: string
          user_id: string
        }[]
      }
      admin_listar_pagamentos: {
        Args: { p_limit?: number }
        Returns: {
          criado_em: string
          id: string
          liquido_centavos: number
          metodo_pagamento: string
          moeda: string
          plano_nome: string
          plano_slug: string
          processado_em: string
          status: string
          user_email: string
          valor_centavos: number
        }[]
      }
      admin_listar_tickets: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: {
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          id: string
          perfil_avatar: string
          perfil_email: string
          perfil_nome: string
          status: string
          titulo: string
          total_mensagens: number
          user_id: string
        }[]
      }
      admin_responder_ticket: {
        Args: { p_mensagem: string; p_ticket_id: string }
        Returns: {
          autor_id: string
          criado_em: string
          id: string
          is_admin: boolean
          mensagem: string
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_mensagens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_revogar_acesso_gratuito: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_toggle_faq: {
        Args: { p_id: string }
        Returns: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          criado_em: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_faq"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alterar_papel_usuario: {
        Args: { p_papel: string; p_user_id: string }
        Returns: {
          atualizado_em: string
          avatar_url: string | null
          banido: boolean
          banido_em: string | null
          banido_por: string | null
          competir_publico: boolean
          criado_em: string
          email: string
          email_marketing_optout: boolean
          email_marketing_optout_em: string | null
          email_token: string
          faculdade_unidade: string | null
          id: string
          motivo_banimento: string | null
          nome_completo: string | null
          papel: string
          tipo_usuario: string | null
          ultimo_login: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      anular_questao_usuario: {
        Args: {
          p_anular: boolean
          p_questao_id: string
          p_tentativa_id: string
        }
        Returns: {
          alternativa_id: string | null
          anulada_usuario: boolean
          correta: boolean | null
          enviada_em: string | null
          id: string
          ordem_na_tentativa: number | null
          pontos: number | null
          questao_id: string
          respondida_em: string | null
          resposta_texto: string | null
          tempo_gasto_segundos: number | null
          tentativa_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tentativa_resposta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assinatura_tier: { Args: { uid?: string }; Returns: string }
      buscar_anexos_ticket: {
        Args: { p_ticket_id: string }
        Returns: {
          criado_em: string
          id: string
          mensagem_id: string
          mime_type: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
          ticket_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "suporte_anexos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buscar_avisos_pendentes: {
        Args: never
        Returns: {
          ativo: boolean
          criado_em: string
          criado_por: string | null
          id: string
          imagem_url: string
          mensagem: string | null
          segmento: string
          titulo: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "avisos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buscar_faq: {
        Args: never
        Returns: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          criado_em: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }[]
        SetofOptions: {
          from: "*"
          to: "suporte_faq"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buscar_mensagens_ticket: {
        Args: { p_ticket_id: string }
        Returns: {
          autor_id: string
          criado_em: string
          id: string
          is_admin: boolean
          mensagem: string
          ticket_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "suporte_mensagens"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buscar_meus_tickets: {
        Args: never
        Returns: {
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          id: string
          status: string
          titulo: string
          total_mensagens: number
        }[]
      }
      buscar_notificacoes: {
        Args: { p_limit?: number }
        Returns: {
          criado_em: string
          dados: Json | null
          id: string
          lida: boolean
          mensagem: string | null
          tipo: string
          titulo: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notificacoes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      conceder_xp_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      consolidar_correcoes_tentativa: {
        Args: { p_forcar_sem_ia?: boolean; p_tentativa_id: string }
        Returns: Json
      }
      consolidar_pontos_tentativa: {
        Args: { p_tentativa_id: string }
        Returns: undefined
      }
      contem_palavra_proibida: { Args: { p_texto: string }; Returns: boolean }
      criar_comentario_questao: {
        Args: { p_conteudo: string; p_parent_id?: string; p_questao_id: string }
        Returns: Json
      }
      criar_ticket: {
        Args: { p_categoria: string; p_descricao: string; p_titulo: string }
        Returns: {
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          id: string
          status: string
          titulo: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      denunciar_comentario_questao: {
        Args: { p_comentario_id: string; p_motivo?: string }
        Returns: undefined
      }
      descadastrar_email_marketing: {
        Args: { p_token: string }
        Returns: boolean
      }
      editar_comentario_questao: {
        Args: { p_comentario_id: string; p_conteudo: string }
        Returns: Json
      }
      email_publico_alvo: {
        Args: { p_segmento: string }
        Returns: {
          criado_em: string
          email: string
          email_token: string
          nome_completo: string
          user_id: string
        }[]
      }
      enviar_mensagem_ticket: {
        Args: { p_mensagem: string; p_ticket_id: string }
        Returns: {
          autor_id: string
          criado_em: string
          id: string
          is_admin: boolean
          mensagem: string
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_mensagens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enviar_resposta_aberta: {
        Args: { p_questao_id: string; p_tentativa_id: string; p_texto?: string }
        Returns: Json
      }
      excluir_anotacao_questao: {
        Args: { p_questao_id: string; p_tentativa_id: string }
        Returns: undefined
      }
      excluir_comentario_questao: {
        Args: { p_comentario_id: string }
        Returns: undefined
      }
      finalizar_tentativa: {
        Args: { p_tempo_segundos?: number; p_tentativa_id: string }
        Returns: Json
      }
      flashcards_admin_salvar_deck_oficial: {
        Args: {
          p_cards: Json
          p_deck_id: string
          p_descricao: string
          p_publico: boolean
          p_titulo: string
        }
        Returns: string
      }
      flashcards_atualizar_deck: {
        Args: {
          p_cards: Json
          p_deck_id: string
          p_descricao: string
          p_publico: boolean
          p_titulo: string
        }
        Returns: undefined
      }
      flashcards_criar_deck: {
        Args: {
          p_cards: Json
          p_descricao: string
          p_publico: boolean
          p_titulo: string
        }
        Returns: string
      }
      flashcards_excluir_deck: {
        Args: { p_deck_id: string }
        Returns: undefined
      }
      flashcards_feed: {
        Args: { p_limit?: number; p_offset?: number; p_ordenacao?: string }
        Returns: Json
      }
      flashcards_imagem_url_valida: {
        Args: { p_admin: boolean; p_url: string; p_user_id: string }
        Returns: boolean
      }
      flashcards_listar_likes_deck: {
        Args: { p_deck_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      flashcards_toggle_like: {
        Args: { p_deck_id: string }
        Returns: {
          curtido: boolean
          likes_count: number
        }[]
      }
      gerar_simulado_impressao: {
        Args: {
          p_formato?: string
          p_qtd?: number
          p_tema_ids?: string[]
          p_tipo_questao?: string
        }
        Returns: Json
      }
      gerar_simulado_personalizado: {
        Args: {
          p_formato?: string
          p_formato_questao?: string
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
      get_gemeas_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      get_historico_kpis: { Args: never; Returns: Json }
      get_meu_xp: { Args: never; Returns: Json }
      get_minha_posicao_ranking: { Args: never; Returns: Json }
      get_minhas_conquistas: { Args: never; Returns: Json }
      get_ranking_global: { Args: { p_limite?: number }; Returns: Json }
      get_ranking_semana: { Args: { p_limite?: number }; Returns: Json }
      get_revisao_prova: { Args: { p_prova_id: string }; Returns: Json }
      get_revisao_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      get_simulado_impressao: {
        Args: { p_com_gabarito?: boolean; p_prova_id: string }
        Returns: Json
      }
      get_status_acesso: { Args: never; Returns: Json }
      get_status_correcoes: { Args: { p_tentativa_id: string }; Returns: Json }
      get_streak_estudo: { Args: never; Returns: number }
      get_streak_estudo_v2: { Args: never; Returns: Json }
      iniciar_tentativa: {
        Args: { p_modo: string; p_prova_id: string }
        Returns: Json
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      is_banned: { Args: { uid?: string }; Returns: boolean }
      is_super_admin: { Args: { uid?: string }; Returns: boolean }
      limite_tentativas_gratuitas: { Args: never; Returns: number }
      listar_anotacoes_tentativa: {
        Args: { p_tentativa_id: string }
        Returns: {
          atualizado_em: string
          conteudo: string
          criado_em: string
          id: string
          questao_id: string
          tentativa_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tentativa_questao_anotacao"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      listar_comentarios_questao: {
        Args: { p_ordenacao?: string; p_questao_id: string }
        Returns: Json
      }
      listar_temas_com_contagem: {
        Args: { p_formato_questao?: string; p_tipo_questao?: string }
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
      marcar_aviso_visto: { Args: { p_aviso_id: string }; Returns: undefined }
      marcar_notificacao_lida: { Args: { p_id: string }; Returns: undefined }
      marcar_todas_notificacoes_lidas: { Args: never; Returns: undefined }
      montar_questao_tentativa_json: {
        Args: {
          p_modo: string
          p_ordem: number
          p_prova_id: string
          p_questao_id: string
        }
        Returns: Json
      }
      montar_resultado_tentativa: {
        Args: { p_tentativa_id: string }
        Returns: Json
      }
      nivel_acesso: { Args: { uid?: string }; Returns: string }
      nivel_no_segmento: {
        Args: { p_nivel: string; p_segmento: string }
        Returns: boolean
      }
      reabrir_ticket: {
        Args: { p_ticket_id: string }
        Returns: {
          atualizado_em: string
          categoria: string
          criado_em: string
          descricao: string
          id: string
          status: string
          titulo: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "suporte_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_anexos_mensagem: {
        Args: { p_anexos: Json; p_mensagem_id: string }
        Returns: {
          criado_em: string
          id: string
          mensagem_id: string
          mime_type: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number
          ticket_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "suporte_anexos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      responder_desafio_diario: {
        Args: { p_alternativa_id: string; p_tempo_segundos?: number }
        Returns: Json
      }
      retomar_tentativa: { Args: { p_tentativa_id: string }; Returns: Json }
      salvar_anotacao_questao: {
        Args: {
          p_conteudo: string
          p_questao_id: string
          p_tentativa_id: string
        }
        Returns: {
          atualizado_em: string
          conteudo: string
          criado_em: string
          id: string
          questao_id: string
          tentativa_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tentativa_questao_anotacao"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      salvar_resposta_tentativa: {
        Args: {
          p_alternativa_id: string
          p_questao_id: string
          p_tentativa_id: string
        }
        Returns: {
          alternativa_id: string | null
          anulada_usuario: boolean
          correta: boolean | null
          enviada_em: string | null
          id: string
          ordem_na_tentativa: number | null
          pontos: number | null
          questao_id: string
          respondida_em: string | null
          resposta_texto: string | null
          tempo_gasto_segundos: number | null
          tentativa_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tentativa_resposta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      salvar_resposta_texto: {
        Args: { p_questao_id: string; p_tentativa_id: string; p_texto: string }
        Returns: {
          alternativa_id: string | null
          anulada_usuario: boolean
          correta: boolean | null
          enviada_em: string | null
          id: string
          ordem_na_tentativa: number | null
          pontos: number | null
          questao_id: string
          respondida_em: string | null
          resposta_texto: string | null
          tempo_gasto_segundos: number | null
          tentativa_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tentativa_resposta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tem_acesso_avancado: { Args: { uid?: string }; Returns: boolean }
      tem_assinatura_ativa: { Args: { uid?: string }; Returns: boolean }
      tentativas_gratuitas_restantes: {
        Args: { uid?: string }
        Returns: number
      }
      toggle_favorito_tentativa: {
        Args: { p_favorito: boolean; p_tentativa_id: string }
        Returns: undefined
      }
      trocar_formato_questao_tentativa: {
        Args: { p_questao_id: string; p_tentativa_id: string }
        Returns: Json
      }
      validar_cupom: {
        Args: { p_codigo: string; p_plano_slug: string; p_user_id?: string }
        Returns: {
          cupom_id: string
          desconto_centavos: number
          motivo: string
          valido: boolean
          valor_final_centavos: number
          valor_original_centavos: number
        }[]
      }
      verificar_conquistas_usuario: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      votar_comentario_questao: {
        Args: { p_comentario_id: string; p_valor: number }
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

