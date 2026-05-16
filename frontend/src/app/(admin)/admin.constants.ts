export const DISCIPLINAS = [
  'SOI I',
  'HAM I',
  'IESC I',
  'MCM I',
] as const;

export type Disciplina = (typeof DISCIPLINAS)[number];
