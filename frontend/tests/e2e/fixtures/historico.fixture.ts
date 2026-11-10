import { expect, type Page } from '@playwright/test';
import { setupTierMocks } from './tier.fixture';

export type HistoricoScenario = 'demo' | 'worst' | 'empty' | 'one' | 'error' | 'partial';

interface ProvaFixture {
  nome: string;
  tipo: string;
  formato: string | null;
}
interface TentativaFixture {
  id: string;
  prova_id: string | null;
  modo: 'estudo' | 'simulado';
  nota: number | null;
  total_questoes: number;
  acertos: number;
  finalizada_em: string;
  favorito: boolean;
  prova_snapshot: ProvaFixture | null;
  prova: ProvaFixture | null;
}

export async function abrirHistorico(
  page: Page,
  scenario: HistoricoScenario = 'demo',
): Promise<{ recuperarTentativas: () => void }> {
  await page.clock.setSystemTime(new Date('2026-11-09T15:00:00Z'));
  const nomes = [
    'Treino nacional · Clínica médica',
    'Revisão de Cardiologia',
    'Laboratório · Histologia',
    'Treino nacional · Saúde coletiva',
    'Revisão de Nefrologia',
    'Treino nacional · Integradora',
  ];
  const notas = [80, 65, 90, 45, 60, 70];
  let tentativas = nomes.map<TentativaFixture>((nome, i) => ({
    id: `hist-${i + 1}`,
    prova_id: `prova-hist-${i + 1}`,
    modo: i % 2 ? 'estudo' : 'simulado',
    nota: notas[i],
    total_questoes: 20,
    acertos: notas[i] / 5,
    finalizada_em: new Date(Date.parse('2026-11-08T15:00:00Z') - i * 8 * 86400000).toISOString(),
    favorito: i === 0,
    prova_snapshot: null,
    prova: {
      nome,
      tipo: 'autoral',
      formato: i === 1 || i === 4 ? 'processual' : i === 2 ? 'laboratorio' : 'nacional',
    },
  }));
  if (scenario === 'empty') tentativas = [];
  if (scenario === 'one') tentativas = tentativas.slice(0, 1);
  if (scenario === 'worst') {
    tentativas = Array.from({ length: 50 }, (_, i) => ({
      ...tentativas[i % 6],
      id: `hist-${i + 1}`,
    }));
    tentativas[0].prova!.nome =
      'Treino nacional de distúrbios hidroeletrolíticos e do equilíbrio acidobásico na doença renal crônica · 2026.2';
    tentativas[1].nota = null;
    tentativas[2].prova_snapshot = {
      nome: 'Laboratório removido · Histopatologia gastrointestinal',
      tipo: 'autoral',
      formato: 'laboratorio',
    };
    // O serviço usa o snapshot quando a relação está vazia.
    tentativas[2].prova = null;
    tentativas[2].prova_id = null;
    tentativas[3].nota = 0;
    tentativas[4].nota = 100;
  }
  const temas =
    scenario === 'empty'
      ? []
      : [
          {
            tema_nome:
              scenario === 'worst'
                ? 'Distúrbios hidroeletrolíticos e do equilíbrio acidobásico na doença renal crônica'
                : 'Nefrologia',
            total: 34,
            acertos: 14,
            taxa: 41,
          },
          { tema_nome: 'Endocrinologia', total: 40, acertos: 22, taxa: 55 },
          { tema_nome: 'Pneumologia', total: 25, acertos: 17, taxa: 68 },
          { tema_nome: 'Cardiologia', total: 40, acertos: 30, taxa: 75 },
          { tema_nome: 'Histologia', total: 20, acertos: 18, taxa: 90 },
        ];
  let falhaTentativas = ['error', 'partial'].includes(scenario);
  await setupTierMocks(page, '/login', {
    nivel: 'avancado',
    extraRoutes: async (p) => {
      await p.route('**/rest/v1/rpc/get_historico_kpis', (route) =>
        route.fulfill({
          status: scenario === 'error' ? 500 : 200,
          json:
            scenario === 'error'
              ? { message: 'Falha simulada' }
              : {
                  taxa_acerto: tentativas.length ? 68 : null,
                  total_finalizadas: scenario === 'worst' ? 1284 : tentativas.length,
                  total_questoes_respondidas: tentativas.length * 20,
                  tema_mais_fraco: temas[0]?.tema_nome ?? null,
                  taxa_tema_fraco: temas[0]?.taxa ?? null,
                  ultima_nota: tentativas[0]?.nota ?? null,
                  ultima_nota_data: tentativas[0]?.finalizada_em ?? null,
                },
        }),
      );
      await p.route('**/rest/v1/rpc/get_desempenho_por_tema', (route) =>
        route.fulfill({ status: scenario === 'error' ? 500 : 200, json: temas }),
      );
      await p.route('**/rest/v1/tentativa?*', (route) => {
        const falhar = falhaTentativas;
        return route.fulfill({ status: falhar ? 500 : 200, json: tentativas });
      });
      await p.route('**/rest/v1/rpc/toggle_favorito_tentativa', (route) => {
        const body = route.request().postDataJSON() as {
          p_tentativa_id: string;
          p_favorito: boolean;
        };
        tentativas = tentativas.map((t) =>
          t.id === body.p_tentativa_id ? { ...t, favorito: body.p_favorito } : t,
        );
        return route.fulfill({ json: null });
      });
    },
  });
  await page.locator('.sidebar-nav').waitFor({ state: 'attached' });
  // O login não contém a sidebar em SSR: sua presença confirma o bootstrap do cliente.
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .locator('.sidebar-nav a[href="/dashboard/historico"]')
    .evaluate((link: HTMLAnchorElement) => link.click());
  await expect(page.getByRole('heading', { name: 'Histórico', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('app-historico .animate-pulse:not(.h-60):not(.h-64)')).toHaveCount(0, {
    timeout: 15000,
  });
  return {
    recuperarTentativas: () => {
      falhaTentativas = false;
    },
  };
}
