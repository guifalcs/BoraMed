export interface MaterialCategoria {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  icone: string;
  gradiente: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export interface MaterialTopico {
  id: string;
  categoria_id: string;
  titulo: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export interface MaterialArquivo {
  id: string;
  categoria_id: string;
  topico_id: string | null;
  titulo: string;
  descricao: string | null;
  storage_path: string;
  mime_type: string;
  tamanho_bytes: number | null;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}
