export interface Alternativa {
  id: string;
  questao_id: string;
  letra: string;
  texto: string;
  correta: boolean;
  ordem: number;
  imagem_url: string | null;
}
