export type AppNotificacaoTipo = 'sistema' | 'conquista' | 'info' | 'aviso';

export interface AppNotificacao {
  id: string;
  user_id: string;
  tipo: AppNotificacaoTipo;
  titulo: string;
  mensagem: string | null;
  lida: boolean;
  dados: Record<string, unknown> | null;
  criado_em: string;
}
