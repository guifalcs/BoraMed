import { expect, type Page } from '@playwright/test';
import type {
  DesafioDiario,
  GamificacaoStats,
  RankingItem,
} from '../../../src/app/core/models/gamificacao';
import { clientNavigate, setupTierMocks } from './tier.fixture';

export type CompetitivoScenario =
  | 'demo'
  | 'answered'
  | 'wrong'
  | 'empty'
  | 'one'
  | 'worst'
  | 'error'
  | 'image'
  | 'alternative-image';
export const COMPETITIVO_STATS: GamificacaoStats = {
  xp_total: 2450,
  xp_semana_atual: 380,
  semana_iso: '2026-46',
  nivel: 4,
  streak_atual: 7,
  streak_recorde: 12,
  freezes_disponiveis: 1,
  competir_publico: false,
};
export function criarDesafio(scenario: CompetitivoScenario = 'demo'): DesafioDiario {
  const answered = scenario === 'answered' || scenario === 'wrong';
  return {
    disponivel: scenario !== 'empty',
    data: '2026-11-10',
    questao:
      scenario === 'empty'
        ? null
        : {
            id: 'desafio-ui',
            disciplina: 'Farmacologia',
            enunciado_apoio: null,
            enunciado:
              scenario === 'worst'
                ? 'Durante uma revisão de farmacologia, um estudante compara vias de administração e parâmetros farmacocinéticos.\n\n' +
                  'A interpretação considera absorção, distribuição, metabolismo e eliminação. '.repeat(
                    8,
                  ) +
                  '\n\nO que representa a biodisponibilidade de um fármaco?'
                : 'O que representa a biodisponibilidade de um fármaco?',
            imagem_url: scenario === 'image' ? '/landing-page/lamina-he.webp' : null,
            imagem_legenda:
              scenario === 'image'
                ? 'Imagem de demonstração para verificar a leitura da questão com figura.'
                : null,
            explicacao: answered
              ? 'A biodisponibilidade é a fração da dose administrada que alcança a circulação sistêmica. Na via intravenosa, essa fração é de 100%.'
              : null,
          },
    alternativas:
      scenario === 'empty'
        ? []
        : [
            {
              id: 'alt-a',
              letra: 'A',
              texto: 'A fração da dose que alcança a circulação sistêmica.',
              ordem: 1,
            },
            {
              id: 'alt-b',
              letra: 'B',
              texto: 'O tempo necessário para eliminar metade da concentração plasmática.',
              ordem: 2,
            },
            {
              id: 'alt-c',
              letra: 'C',
              texto: 'O volume aparente de distribuição do fármaco no organismo.',
              ordem: 3,
            },
            {
              id: 'alt-d',
              letra: 'D',
              texto: 'A capacidade de um fármaco produzir o efeito máximo.',
              ordem: 4,
            },
          ].map((alt) => ({
            ...alt,
            ...(answered ? { correta: alt.id === 'alt-a' } : {}),
            ...(scenario === 'alternative-image' && alt.id === 'alt-a'
              ? { imagem_url: '/landing-page/lamina-he.webp' }
              : {}),
          })),
    estatistica: {
      total_responderam: scenario === 'one' ? 1 : 128,
      percentual_acerto: scenario === 'one' ? 100 : 72,
    },
    minha_resposta: answered
      ? {
          alternativa_id: scenario === 'wrong' ? 'alt-b' : 'alt-a',
          correta: scenario !== 'wrong',
          xp_ganho: scenario === 'wrong' ? 10 : 50,
          respondido_em: '2026-11-10T12:00:00Z',
        }
      : null,
  };
}
export function criarRanking(
  scenario: CompetitivoScenario = 'demo',
  semana = false,
): RankingItem[] {
  const nomes = [
    'Marina Costa',
    'Pedro Almeida',
    'Ana Beatriz',
    'Anônimo',
    'Lucas Santos',
    'Juliana Ribeiro',
  ];
  if (scenario === 'empty') return [];
  return Array.from({ length: scenario === 'one' ? 1 : scenario === 'worst' ? 11 : 7 }, (_, i) => ({
    user_id:
      i === 3
        ? null
        : i === (scenario === 'one' ? 0 : scenario === 'worst' ? 10 : 6)
          ? 'user-test-tier'
          : `ranking-${i}`,
    nome_display:
      scenario === 'worst' && i === 0
        ? 'Maria Eduarda de Albuquerque Vasconcelos e Silva'
        : scenario === 'worst' && i === 1
          ? '🧑🏽‍⚕️ João Gonçalves'
          : i === (scenario === 'one' ? 0 : scenario === 'worst' ? 10 : 6)
            ? 'Anônimo'
            : nomes[i % 6],
    avatar_url: scenario === 'worst' && i === 0 ? '/avatar-inexistente.png' : null,
    nivel: i === (scenario === 'one' ? 0 : scenario === 'worst' ? 10 : 6) ? 4 : Math.max(1, 9 - i),
    xp_total:
      scenario === 'worst'
        ? 2147483647 - i * 5000
        : i === (scenario === 'one' ? 0 : 6)
          ? 2450
          : 8200 - i * 750,
    xp_semana_atual:
      i === (scenario === 'one' ? 0 : scenario === 'worst' ? 10 : 6)
        ? scenario === 'worst'
          ? 123456789
          : 380
        : scenario === 'worst'
          ? 123506789 - i * 5000
          : 1200 - i * 80,
    posicao: i === (scenario === 'worst' ? 10 : 6) ? (semana ? 12 : 27) : i + 1,
    is_me: i === (scenario === 'one' ? 0 : scenario === 'worst' ? 10 : 6),
  }));
}
export async function abrirCompetitivo(
  page: Page,
  scenario: CompetitivoScenario = 'demo',
): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'));
  let desafio = criarDesafio(scenario);
  await setupTierMocks(page, '/login', {
    nivel: 'gratuito',
    extraRoutes: async (p) => {
      await p.route('**/avatar-inexistente.png', (route) =>
        route.fulfill({ status: 404, body: '' }),
      );
      for (const rpc of [
        'get_meu_xp',
        'get_ranking_global',
        'get_ranking_semana',
        'get_minha_posicao_ranking',
        'get_desafio_diario',
      ]) {
        await p.route(`**/rest/v1/rpc/${rpc}`, (route) => {
          if (scenario === 'error')
            return route.fulfill({ status: 503, json: { message: 'Falha simulada' } });
          const json =
            rpc === 'get_meu_xp'
              ? {
                  ...COMPETITIVO_STATS,
                  ...(scenario === 'worst'
                    ? {
                        xp_total: 2147433647,
                        xp_semana_atual: 123456789,
                        streak_atual: 365,
                        freezes_disponiveis: 0,
                      }
                    : scenario === 'empty'
                      ? { xp_total: 0, xp_semana_atual: 0, streak_atual: 0 }
                      : {}),
                }
              : rpc === 'get_desafio_diario'
                ? desafio
                : rpc === 'get_minha_posicao_ranking'
                  ? {
                      posicao_global: scenario === 'empty' ? null : scenario === 'one' ? 1 : 27,
                      posicao_semana: scenario === 'empty' ? null : scenario === 'one' ? 1 : 12,
                      total_global: scenario === 'one' ? 1 : scenario === 'empty' ? 0 : 243,
                      total_semana: scenario === 'one' ? 1 : scenario === 'empty' ? 0 : 87,
                    }
                  : criarRanking(scenario, rpc === 'get_ranking_semana');
          return route.fulfill({ json });
        });
      }
      await p.route('**/rest/v1/rpc/responder_desafio_diario', async (route) => {
        const body = route.request().postDataJSON() as { p_alternativa_id: string };
        const correta = body.p_alternativa_id === 'alt-a';
        const anterior = desafio;
        desafio = criarDesafio(correta ? 'answered' : 'wrong');
        desafio.questao = {
          ...desafio.questao!,
          imagem_url: anterior.questao?.imagem_url ?? null,
          imagem_legenda: anterior.questao?.imagem_legenda ?? null,
        };
        if (scenario === 'alternative-image')
          desafio.alternativas[0].imagem_url = '/landing-page/lamina-he.webp';
        desafio.minha_resposta!.alternativa_id = body.p_alternativa_id;
        await route.fulfill({
          json: {
            ja_respondeu: false,
            correta,
            xp_ganho: correta ? 50 : 10,
            novas_conquistas: [],
            stats: { ...COMPETITIVO_STATS, xp_total: 2500, xp_semana_atual: 430 },
            estatistica: desafio.estatistica,
          },
        });
      });
    },
  });
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.locator('.sidebar-nav')).toBeAttached();
  await page.waitForLoadState('networkidle');
  await clientNavigate(page, '/dashboard/competitivo');
  await expect(page.locator('app-competir-hub')).toBeAttached();
  await expect(page.getByRole('heading', { level: 1, name: 'Competitivo' })).toBeVisible();
  await expect(page.locator('app-competir-hub .animate-pulse')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
