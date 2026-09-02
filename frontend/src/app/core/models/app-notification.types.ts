export type AppNotificacaoTipo = 'sistema' | 'conquista' | 'info' | 'aviso';

export interface AppNotificacao {
  id: string;
  user_id: string;
  tipo: AppNotificacaoTipo;
  titulo: string;
  mensagem: string | null;
  lida: boolean;
  /** Momento da leitura. Notificações lidas somem da caixa após 7 dias. */
  lida_em: string | null;
  dados: Record<string, unknown> | null;
  criado_em: string;
}
