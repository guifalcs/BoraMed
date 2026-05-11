export interface Alternativa {
  id: string;
  questao_id: string;
  letra: 'A' | 'B' | 'C' | 'D' | 'E';
  texto: string;
  correta: boolean;
  ordem: number;
  imagem_url: string | null;
}
