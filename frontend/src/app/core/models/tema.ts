export interface Tema {
  id: string;
  nome: string;
  disciplina: string | null;
  periodo: number | null;
  parent_id: string | null;
  criado_em: string;
}
