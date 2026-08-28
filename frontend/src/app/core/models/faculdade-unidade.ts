import type { SelectOption } from '../../shared/components/ui/select/ui-select.component';

// Fonte: sitemap de medicina.afya.com.br/unidades (32 unidades com curso de
// Medicina, conferido em 28/08/2026). Alteração/aquisição de unidade exige
// nova migration (CHECK em profiles.faculdade_unidade) + deploy do frontend.
export const FACULDADE_UNIDADE_ENTRIES = [
  { value: 'abaetetuba_pa', label: 'Abaetetuba (PA)' },
  { value: 'araguaina_to', label: 'Araguaína (TO)' },
  { value: 'braganca_pa', label: 'Bragança (PA)' },
  { value: 'cabedelo_pb', label: 'Cabedelo (PB)' },
  { value: 'contagem_mg', label: 'Contagem (MG)' },
  { value: 'cruzeiro_do_sul_ac', label: 'Cruzeiro do Sul (AC)' },
  { value: 'duque_de_caxias_rj', label: 'Duque de Caxias (RJ)' },
  { value: 'garanhuns_pe', label: 'Garanhuns (PE)' },
  { value: 'guanambi_ba', label: 'Guanambi (BA)' },
  { value: 'ipatinga_mg', label: 'Ipatinga (MG)' },
  { value: 'itabuna_ba', label: 'Itabuna (BA)' },
  { value: 'itacoatiara_am', label: 'Itacoatiara (AM)' },
  { value: 'itajuba_mg', label: 'Itajubá (MG)' },
  { value: 'itaperuna_rj', label: 'Itaperuna (RJ)' },
  { value: 'jaboatao_pe', label: 'Jaboatão dos Guararapes (PE)' },
  { value: 'ji_parana_ro', label: 'Ji-Paraná (RO)' },
  { value: 'maceio_al', label: 'Maceió (AL)' },
  { value: 'manacapuru_am', label: 'Manacapuru (AM)' },
  { value: 'maraba_pa', label: 'Marabá (PA)' },
  { value: 'montes_claros_mg', label: 'Montes Claros (MG)' },
  { value: 'palmas_to', label: 'Palmas (TO)' },
  { value: 'parnaiba_pi', label: 'Parnaíba (PI)' },
  { value: 'pato_branco_pr', label: 'Pato Branco (PR)' },
  { value: 'porto_nacional_to', label: 'Porto Nacional (TO)' },
  { value: 'porto_velho_ro', label: 'Porto Velho (RO)' },
  { value: 'redencao_pa', label: 'Redenção (PA)' },
  { value: 'rio_de_janeiro_rj', label: 'Rio de Janeiro (RJ)' },
  { value: 'salvador_ba', label: 'Salvador (BA)' },
  { value: 'santa_ines_ma', label: 'Santa Inês (MA)' },
  { value: 'sao_joao_del_rei_mg', label: 'São João del-Rei (MG)' },
  { value: 'teresina_pi', label: 'Teresina (PI)' },
  { value: 'vitoria_da_conquista_ba', label: 'Vitória da Conquista (BA)' },
] as const;

export const FACULDADE_UNIDADE_VALUES = FACULDADE_UNIDADE_ENTRIES.map((e) => e.value) as [
  (typeof FACULDADE_UNIDADE_ENTRIES)[number]['value'],
  ...(typeof FACULDADE_UNIDADE_ENTRIES)[number]['value'][],
];

export type FaculdadeUnidade = (typeof FACULDADE_UNIDADE_ENTRIES)[number]['value'];

export const FACULDADE_UNIDADE_OPTIONS: SelectOption<string>[] = FACULDADE_UNIDADE_ENTRIES.map(
  (e) => ({ value: e.value, label: e.label }),
);

export const FACULDADE_UNIDADE_LABELS: Record<FaculdadeUnidade, string> = Object.fromEntries(
  FACULDADE_UNIDADE_ENTRIES.map((e) => [e.value, e.label]),
) as Record<FaculdadeUnidade, string>;
