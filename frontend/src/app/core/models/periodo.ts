import type { SelectOption } from '../../shared/components/ui/select/ui-select.component';

// Período do curso de Medicina: 1 a 12 (CHECK em profiles.periodo). Usado no
// cadastro, no modal de dados obrigatórios e no formulário de perfil.
export const PERIODO_MIN = 1;
export const PERIODO_MAX = 12;

export const PERIODO_OPTIONS: SelectOption<number>[] = Array.from(
  { length: PERIODO_MAX },
  (_, i) => ({ value: i + 1, label: `${i + 1}º período` }),
);
