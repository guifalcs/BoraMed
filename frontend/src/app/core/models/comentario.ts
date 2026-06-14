export type OrdenacaoComentario = 'relevante' | 'recente' | 'antigo';

export interface ComentarioQuestao {
  id: string;
  parent_id: string | null;
  conteudo: string | null;
  status: 'ativo' | 'removido';
  editado: boolean;
  nome_display: string;
  avatar_url: string | null;
  user_id: string | null;
  is_me: boolean;
  likes: number;
  dislikes: number;
  meu_voto: -1 | 0 | 1;
  criado_em: string;
  respostas: ComentarioQuestao[];
}

export interface ListarComentariosResult {
  comentarios: ComentarioQuestao[];
  total: number;
}

export interface VotoResult {
  likes: number;
  dislikes: number;
  meu_voto: -1 | 0 | 1;
}
