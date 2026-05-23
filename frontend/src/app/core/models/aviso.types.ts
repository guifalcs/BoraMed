export interface Aviso {
  id: string;
  titulo: string | null;
  mensagem: string | null;
  imagem_url: string;
  ativo: boolean;
  criado_em: string;
}
