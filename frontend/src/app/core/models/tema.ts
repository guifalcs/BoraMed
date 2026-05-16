export interface Tema {
  id: string;
  nome: string;
  disciplina_id?: string | null;
  disciplina: string | null;
  periodo: number | null;
  parent_id: string | null;
  criado_em: string;
}

export interface TemaComContagem extends Tema {
  qtd_questoes: number;
}
