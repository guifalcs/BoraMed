import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { MinhasNotas, NotasRegulamento } from '../../../src/app/core/models/notas';
import { clientNavigate, setupTierMocks } from './tier.fixture';

export type NotasScenario =
  | 'demo'
  | 'empty'
  | 'risk'
  | 'approved'
  | 'single'
  | 'worst'
  | 'unsupported'
  | 'no-period'
  | 'error';

/** Composição do 2º período copiada da migration de conteúdo, com IDs fictícios. */
export function dadosNotas(scenario: NotasScenario): MinhasNotas {
  const regulamento = JSON.parse(
    readFileSync(join(__dirname, 'notas/regulamento.json'), 'utf8'),
  ) as NotasRegulamento;
  const lancamentos =
    scenario === 'empty'
      ? []
      : [
          {
            item_id: 'item-0-0-0',
            nota: scenario === 'risk' ? 2 : 16,
            atualizado_em: '2026-11-09T15:00:00Z',
          },
          { item_id: 'sub-0-1-0-0', nota: 17.5, atualizado_em: '2026-11-09T15:00:00Z' },
          { item_id: 'sub-0-1-1-0', nota: 12, atualizado_em: '2026-11-09T15:00:00Z' },
        ];
  if (scenario === 'risk')
    lancamentos.push({ item_id: 'item-0-0-1', nota: 23, atualizado_em: '2026-11-09T15:00:00Z' });
  if (scenario === 'approved') {
    lancamentos.push(
      ...[1, 2, 3].map((i) => ({
        item_id: `item-0-0-${i}`,
        nota: [0, 25, 30, 12][i],
        atualizado_em: '2026-11-09T15:00:00Z',
      })),
    );
  }
  if (scenario === 'single') regulamento.eixos = [regulamento.eixos[4]];
  if (scenario === 'worst') {
    regulamento.titulo =
      'Composição das avaliações e acompanhamento acadêmico do segundo período de Medicina';
    regulamento.eixos[0].nome =
      'Sistemas Orgânicos Integrados: mecanismos fisiopatológicos e integração entre os sistemas do corpo humano';
    regulamento.eixos[0].dimensoes[0].itens[0].nome =
      'Avaliação integrada dos mecanismos fisiopatológicos e do raciocínio clínico';
    regulamento.eixos[0].dimensoes[1].itens[0].nome =
      'Avaliação diária de aprendizagem em pequenos grupos e discussão de situações clínicas';
    regulamento.eixos[0].dimensoes[1].itens[0].subitens[0].nome =
      'Participação e desenvolvimento do raciocínio clínico na primeira parcial';
    lancamentos[0].nota = 0;
  }
  return {
    periodo: scenario === 'no-period' ? null : scenario === 'unsupported' ? 9 : 2,
    periodos_disponiveis: [1, 2],
    regulamento: ['unsupported', 'no-period'].includes(scenario) ? null : regulamento,
    lancamentos,
  };
}

export async function abrirNotas(page: Page, scenario: NotasScenario = 'demo'): Promise<void> {
  const dados = dadosNotas(scenario);
  let falharLeitura = scenario === 'error';
  await setupTierMocks(page, '/dashboard', {
    nivel: 'gratuito',
    extraRoutes: async (p) => {
      await p.route('**/rest/v1/rpc/get_minhas_notas', (route) => {
        if (falharLeitura) {
          falharLeitura = false;
          return route.fulfill({
            status: 500,
            json: { message: 'Não foi possível conectar. Tente novamente.' },
          });
        }
        return route.fulfill({ json: dados });
      });
      await p.route('**/rest/v1/rpc/salvar_nota_lancamento', (route) => {
        const body = route.request().postDataJSON() as { p_item_id: string; p_nota: number | null };
        dados.lancamentos = dados.lancamentos.filter((l) => l.item_id !== body.p_item_id);
        const salvo = {
          item_id: body.p_item_id,
          nota: body.p_nota,
          atualizado_em: '2026-11-09T15:00:00Z',
        };
        if (body.p_nota !== null) dados.lancamentos.push({ ...salvo, nota: body.p_nota });
        return route.fulfill({ json: salvo });
      });
      await p.route('**/rest/v1/rpc/limpar_minhas_notas', (route) => {
        const total = dados.lancamentos.length;
        dados.lancamentos = [];
        return route.fulfill({ json: total });
      });
    },
  });
  await expect(page.locator('.sidebar-nav')).toBeAttached();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  // SSR pode mostrar o fallback "Estudante" antes do perfil. Aguarda a
  // hidratação e as consultas iniciais, sem depender do nome renderizado.
  await page.waitForLoadState('networkidle');
  await clientNavigate(page, '/dashboard/notas');
  await expect(page.locator('app-minhas-notas').getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 15_000,
  });
}
