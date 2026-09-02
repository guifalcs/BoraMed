import type { Page } from '@playwright/test';
import { setupTierMocks, clientNavigate } from '../e2e/fixtures/tier.fixture';

// ─── Dados realistas para os prints de auditoria mobile ──────────────────────
//
// Objetivo: renderizar cada tela com conteúdo plausível (não empty state), para
// que o antes/depois de redução de texto seja comparável. Toda a rede é
// interceptada — nada toca Supabase.

const HOJE = '2026-09-02';

export const KPIS = {
  taxa_acerto: 68,
  total_finalizadas: 12,
  total_questoes_respondidas: 348,
  tema_mais_fraco: 'Nefrologia',
  taxa_tema_fraco: 41,
  ultima_nota: 76,
  ultima_nota_data: '2026-08-30T14:20:00Z',
};

export const XP = {
  xp_total: 4820,
  xp_semana_atual: 460,
  semana_iso: '2026-W36',
  nivel: 7,
  streak_atual: 5,
  streak_recorde: 11,
  freezes_disponiveis: 2,
  competir_publico: true,
};

export const STREAK_V2 = {
  atual: 5,
  recorde: 11,
  freezes_disponiveis: 2,
  freeze_usado_hoje: false,
  dias_para_proximo_marco: 2,
};

export const POSICAO = {
  posicao_global: 23,
  posicao_semana: 14,
  total_global: 1840,
  total_semana: 612,
};

export const TEMAS_DESEMPENHO = [
  { tema_nome: 'Nefrologia', total: 34, acertos: 14, taxa: 41 },
  { tema_nome: 'Cardiologia', total: 52, acertos: 39, taxa: 75 },
  { tema_nome: 'Pneumologia', total: 28, acertos: 19, taxa: 68 },
  { tema_nome: 'Endocrinologia', total: 41, acertos: 22, taxa: 54 },
  { tema_nome: 'Gastroenterologia', total: 30, acertos: 25, taxa: 83 },
];

function tentativa(
  i: number,
  nome: string,
  nota: number,
  modo: 'simulado' | 'estudo',
  dias: number,
  favorito = false,
) {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setDate(d.getDate() - dias);
  return {
    id: `tent-${i}`,
    prova_id: `prova-${i}`,
    modo,
    nota,
    total_questoes: 25,
    acertos: Math.round((nota / 100) * 25),
    finalizada_em: d.toISOString(),
    favorito,
    prova_snapshot: null,
    prova: { nome, tipo: 'nacional', origem: 'afya', formato: 'fechadas' },
  };
}

export const TENTATIVAS = [
  tentativa(1, 'Integradora 5 — 2025.1', 76, 'simulado', 3, true),
  tentativa(2, 'N2 Clínica Médica — 2024.2', 64, 'estudo', 8),
  tentativa(3, 'TPI 2025 — 8º período', 58, 'simulado', 14),
  tentativa(4, 'SOI Cardiologia — 2024.1', 82, 'estudo', 21),
  tentativa(5, 'N1 Saúde Coletiva — 2025.1', 49, 'simulado', 30),
  tentativa(6, 'Integradora 4 — 2024.2', 71, 'simulado', 38),
];

export const TENTATIVA_ATIVA = {
  id: 'tent-ativa',
  user_id: 'user-test-tier',
  prova_id: 'prova-9',
  modo: 'simulado',
  status: 'em_andamento',
  total_questoes: 25,
  total_respondidas: 11,
  acertos: 0,
  nota: null,
  pontos: null,
  total_pontuaveis: null,
  iniciada_em: '2026-09-02T11:00:00Z',
  pausada_em: null,
  tempo_acumulado_segundos: 940,
  finalizada_em: null,
  criado_em: '2026-09-02T11:00:00Z',
};

export const DESAFIO_PENDENTE = {
  disponivel: true,
  data: HOJE,
  questao: {
    id: 'q-desafio',
    enunciado:
      'Paciente de 58 anos, hipertenso e diabético, chega ao ambulatório com edema de membros inferiores e creatinina de 2,4 mg/dL. Qual a conduta inicial mais adequada?',
    enunciado_apoio: null,
    imagem_url: null,
    imagem_legenda: null,
    disciplina: 'Nefrologia',
    explicacao: null,
  },
  alternativas: [
    { id: 'a1', letra: 'A', texto: 'Iniciar diurético de alça e reavaliar em 7 dias', ordem: 1 },
    { id: 'a2', letra: 'B', texto: 'Suspender o inibidor da ECA imediatamente', ordem: 2 },
    { id: 'a3', letra: 'C', texto: 'Solicitar relação albumina/creatinina urinária e ultrassom renal', ordem: 3 },
    { id: 'a4', letra: 'D', texto: 'Encaminhar para diálise de urgência', ordem: 4 },
  ],
  estatistica: { total_responderam: 214, percentual_acerto: 61 },
  minha_resposta: null,
};

function rankingItem(pos: number, nome: string, nivel: number, xp: number, semana: number, me = false) {
  return {
    user_id: me ? 'user-test-tier' : `u-${pos}`,
    nome_display: nome,
    avatar_url: null,
    nivel,
    xp_total: xp,
    xp_semana_atual: semana,
    posicao: pos,
    is_me: me,
  };
}

export const RANKING = [
  rankingItem(1, 'Marina Albuquerque', 14, 18400, 1240),
  rankingItem(2, 'Rafael Nogueira', 13, 16920, 980),
  rankingItem(3, 'Beatriz Sampaio', 12, 15100, 1105),
  rankingItem(4, 'Anônimo', 11, 13880, 640),
  rankingItem(5, 'Caio Ferreira Lima', 11, 12470, 720),
  rankingItem(23, 'Usuário Tier', 7, 4820, 460, true),
];

export const CONQUISTAS = [
  { id: 'c1', nome: 'Primeiro simulado', descricao: 'Conclua seu primeiro simulado.', icone: 'award', categoria: 'inicio', xp_recompensa: 50, desbloqueada_em: '2026-06-10T10:00:00Z' },
  { id: 'c2', nome: 'Sequência de 5 dias', descricao: 'Estude 5 dias seguidos.', icone: 'flame', categoria: 'streak', xp_recompensa: 150, desbloqueada_em: '2026-08-28T10:00:00Z' },
  { id: 'c3', nome: 'Maratonista', descricao: 'Responda 500 questões.', icone: 'zap', categoria: 'volume', xp_recompensa: 300, desbloqueada_em: null },
  { id: 'c4', nome: 'Nota 90', descricao: 'Tire 90% ou mais em um simulado.', icone: 'star', categoria: 'nota', xp_recompensa: 500, desbloqueada_em: null },
  { id: 'c5', nome: 'Colecionador', descricao: 'Crie 10 decks de flashcards.', icone: 'layers', categoria: 'flashcards', xp_recompensa: 200, desbloqueada_em: null },
  { id: 'c6', nome: 'Madrugador', descricao: 'Estude antes das 7h da manhã.', icone: 'sunrise', categoria: 'habito', xp_recompensa: 100, desbloqueada_em: '2026-07-02T06:30:00Z' },
];

function tema(id: string, nome: string, periodo: number, disciplina: string, qtd: number) {
  return { id, nome, disciplina_id: null, disciplina, periodo, parent_id: null, criado_em: '2026-01-01T00:00:00Z', qtd_questoes: qtd };
}

export const TEMAS_CONTAGEM = [
  tema('t1', 'Nefrologia', 8, 'Clínica Médica', 42),
  tema('t2', 'Cardiologia', 8, 'Clínica Médica', 87),
  tema('t3', 'Pneumologia', 8, 'Clínica Médica', 31),
  tema('t4', 'Endocrinologia', 7, 'Clínica Médica', 26),
  tema('t5', 'Gastroenterologia', 7, 'Clínica Médica', 19),
  tema('t6', 'Saúde Coletiva', 6, 'Saúde Coletiva', 12),
  tema('t7', 'Ginecologia e Obstetrícia', 9, 'GO', 0),
];

// ─── Resultado de tentativa (tela pós-prova) ─────────────────────────────────

function resposta(i: number, correta: boolean) {
  return {
    id: `r-${i}`,
    tentativa_id: 'tent-1',
    questao_id: `q-${i}`,
    alternativa_id: `alt-${i}`,
    resposta_texto: null,
    correta,
    tempo_gasto_segundos: 90,
    ordem_na_tentativa: i,
    respondida_em: '2026-08-30T14:10:00Z',
    enviada_em: null,
    anulada_usuario: false,
    pontos: null,
  };
}

export const RESULTADO = {
  tentativa: {
    id: 'tent-1',
    user_id: 'user-test-tier',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'finalizada',
    total_questoes: 25,
    total_respondidas: 25,
    acertos: 19,
    nota: 76,
    pontos: null,
    total_pontuaveis: null,
    iniciada_em: '2026-08-30T13:30:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 2280,
    finalizada_em: '2026-08-30T14:20:00Z',
    criado_em: '2026-08-30T13:30:00Z',
  },
  questoes: [],
  respostas: Array.from({ length: 25 }, (_, i) => resposta(i + 1, i < 19)),
  distribuicao_temas: [
    { tema: { id: 't2', nome: 'Cardiologia', disciplina: 'Clínica Médica', periodo: 8, parent_id: null, criado_em: '' }, total: 8, acertos: 7 },
    { tema: { id: 't1', nome: 'Nefrologia', disciplina: 'Clínica Médica', periodo: 8, parent_id: null, criado_em: '' }, total: 7, acertos: 3 },
    { tema: { id: 't3', nome: 'Pneumologia', disciplina: 'Clínica Médica', periodo: 8, parent_id: null, criado_em: '' }, total: 6, acertos: 5 },
    { tema: { id: 't4', nome: 'Endocrinologia', disciplina: 'Clínica Médica', periodo: 7, parent_id: null, criado_em: '' }, total: 4, acertos: 4 },
  ],
  correcoes_pendentes: 0,
};

// ─── Registro das rotas ──────────────────────────────────────────────────────

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function rotasRicas(page: Page): Promise<void> {
  const rotas: [string, unknown][] = [
    ['**/rest/v1/rpc/get_historico_kpis*', KPIS],
    ['**/rest/v1/rpc/get_desempenho_por_tema*', TEMAS_DESEMPENHO],
    ['**/rest/v1/rpc/get_meu_xp*', XP],
    ['**/rest/v1/rpc/get_streak_estudo_v2*', STREAK_V2],
    ['**/rest/v1/rpc/get_streak_estudo*', STREAK_V2.atual],
    ['**/rest/v1/rpc/get_minha_posicao_ranking*', POSICAO],
    ['**/rest/v1/rpc/get_ranking_global*', RANKING],
    ['**/rest/v1/rpc/get_ranking_semana*', RANKING],
    ['**/rest/v1/rpc/get_desafio_diario*', DESAFIO_PENDENTE],
    ['**/rest/v1/rpc/get_minhas_conquistas*', CONQUISTAS],
    ['**/rest/v1/rpc/listar_temas_com_contagem*', TEMAS_CONTAGEM],
    ['**/rest/v1/rpc/finalizar_tentativa*', RESULTADO],
  ];

  for (const [glob, body] of rotas) {
    await page.route(glob, (route) => void route.fulfill(json(body)));
  }

  // A tabela `tentativa` serve duas consultas distintas: a lista de finalizadas
  // (histórico/início) e a busca da tentativa em aberto. Discrimina pela URL,
  // porque a segunda usa .maybeSingle() e espera um objeto, não um array.
  await page.route('**/rest/v1/tentativa*', (route) => {
    const url = route.request().url();
    if (url.includes('em_andamento')) {
      void route.fulfill(json(TENTATIVA_ATIVA));
      return;
    }
    void route.fulfill(json(TENTATIVAS));
  });
}

/** Boota autenticado em /dashboard com dados ricos e navega client-side. */
export async function abrirTela(
  page: Page,
  url: string,
  nivel: 'gratuito' | 'essencial' | 'avancado' = 'avancado',
): Promise<void> {
  await setupTierMocks(page, '/dashboard', {
    nivel,
    temAcesso: nivel !== 'gratuito',
    extraRoutes: rotasRicas,
  });
  await page.locator('.sidebar-nav').waitFor({ state: 'attached', timeout: 30_000 });
  if (url !== '/dashboard') {
    await clientNavigate(page, url);
  }
}
