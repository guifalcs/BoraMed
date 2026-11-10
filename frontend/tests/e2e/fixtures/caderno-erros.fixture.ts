import { expect, type Page } from '@playwright/test';
import { clientNavigate, setupTierMocks } from './tier.fixture';

export type CadernoScenario = 'demo' | 'worst' | 'empty' | 'one' | 'error' | 'resumo-longo';

interface FiltrosRpc {
  p_status: string;
  p_busca: string | null;
  p_tipo_questao: string[] | null;
  p_tema_ids: string[] | null;
}

const ENUNCIADOS = [
  'Paciente de 58 anos, hipertenso e diabético, apresenta edema de membros inferiores e creatinina de 2,4 mg/dL. Qual a conduta inicial mais adequada?',
  'Uma paciente com doença renal crônica apresenta hipercalemia persistente. Qual medida deve ser priorizada no tratamento?',
  'Homem de 42 anos com hematúria e proteinúria após infecção de vias aéreas superiores. Qual o diagnóstico mais provável?',
  'Na avaliação de um paciente com lesão renal aguda, qual achado sugere uma causa pré-renal?',
  'Paciente com dor torácica de início súbito e supradesnivelamento de ST. Qual a conduta imediata?',
  'Qual alteração do eletrocardiograma é mais característica da fibrilação atrial?',
  'Na insuficiência cardíaca com fração de ejeção reduzida, qual classe de medicamentos reduz a mortalidade?',
  'Na análise histológica do tecido pulmonar, qual estrutura caracteriza o epitélio respiratório?',
  'Em uma lâmina de tecido renal, quais estruturas compõem o corpúsculo renal?',
];

function criarItens() {
  return ENUNCIADOS.map((enunciado, i) => ({
    questao_id: `erro-${i + 1}`,
    enunciado,
    tipo_questao: i < 4 ? 'nacional' : i < 7 ? 'processual' : 'laboratorio',
    formato: 'multipla_escolha',
    formato_prova: null,
    temas: [i < 4 ? 'tema-nefro' : i < 7 ? 'tema-cardio' : 'tema-histo'],
    tema_principal: i < 4 ? 'Nefrologia' : i < 7 ? 'Cardiologia' : 'Histologia',
    tema_origem: 'tema',
    disciplina: 'Clínica médica',
    prova_id: i < 7 ? 'prova-1' : null,
    tentativa_id: i < 7 ? 'tent-1' : null,
    erro_em: `2026-11-0${8 - (i % 7)}T15:00:00Z`,
    status: 'pendente',
    ultima_redo_correta: i === 1 ? false : null,
    ultima_redo_em: i === 1 ? '2026-11-08T18:00:00Z' : null,
    total_count: ENUNCIADOS.length,
  }));
}

export async function abrirCaderno(page: Page, scenario: CadernoScenario = 'demo'): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-09T15:00:00Z'));
  let itens = criarItens();
  if (scenario === 'empty') itens = [];
  if (scenario === 'one') itens = itens.slice(0, 1);
  if (scenario === 'worst') {
    itens[0].tema_principal =
      'Distúrbios hidroeletrolíticos e do equilíbrio acidobásico na doença renal crônica';
    itens[0].enunciado =
      'Paciente em acompanhamento por pseudopseudohipoparatireoidismo apresenta alterações laboratoriais persistentes. Considerando a investigação diagnóstica e o histórico familiar, qual é a interpretação mais adequada dos exames e a conduta inicial?';
    itens[1].tema_principal = itens[0].tema_principal;
    itens[2].tema_principal =
      'Histopatologia das doenças inflamatórias e neoplásicas do trato gastrointestinal';
    itens[2].prova_id = null;
    itens[2].tentativa_id = null;
    itens[3].tema_principal = 'SOI';
    itens[3].tema_origem = 'disciplina';
    itens[4].tema_principal = 'Nacional';
    itens[4].tema_origem = 'tipo';
  }
  await setupTierMocks(page, '/dashboard', {
    nivel: 'avancado',
    extraRoutes: async (p) => {
      await p.route('**/rest/v1/rpc/get_caderno_erros_resumo', (route) =>
        route.fulfill({
          json: {
            total_pendentes:
              scenario === 'resumo-longo'
                ? 574
                : scenario === 'worst'
                  ? 1284
                  : itens.filter((i) => i.status === 'pendente').length,
            por_tipo_questao: { nacional: 4, processual: 3, laboratorio: 2 },
            tema_mais_fraco:
              scenario === 'resumo-longo'
                ? 'Imunidade Adaptativa (Celular e Humoral)'
                : itens.length
                  ? itens[0].tema_principal
                  : null,
            dominadas_ultimos_7_dias: scenario === 'empty' || scenario === 'resumo-longo' ? 0 : 6,
          },
        }),
      );
      await p.route('**/rest/v1/rpc/listar_temas_com_contagem', (route) =>
        route.fulfill({
          json: [
            { id: 'tema-nefro', nome: 'Nefrologia', total_questoes: 4 },
            { id: 'tema-cardio', nome: 'Cardiologia', total_questoes: 3 },
            { id: 'tema-histo', nome: 'Histologia', total_questoes: 2 },
          ],
        }),
      );
      await p.route('**/rest/v1/rpc/get_caderno_erros', (route) => {
        if (scenario === 'error')
          return route.fulfill({ status: 500, json: { message: 'Falha simulada' } });
        const body = route.request().postDataJSON() as FiltrosRpc;
        const dominadas = criarItens()
          .slice(0, 2)
          .map((i) => ({
            ...i,
            questao_id: `dominada-${i.questao_id}`,
            status: 'dominada',
            ultima_redo_correta: true,
          }));
        let filtrados =
          body.p_status === 'dominada' && scenario !== 'empty'
            ? dominadas
            : itens.filter((i) => i.status === body.p_status);
        if (body.p_busca)
          filtrados = filtrados.filter((i) =>
            i.enunciado
              .toLocaleLowerCase('pt-BR')
              .includes(String(body.p_busca).toLocaleLowerCase('pt-BR')),
          );
        if (body.p_tipo_questao?.length)
          filtrados = filtrados.filter((i) => body.p_tipo_questao?.includes(i.tipo_questao));
        if (body.p_tema_ids?.length)
          filtrados = filtrados.filter((i) => i.temas.some((t) => body.p_tema_ids?.includes(t)));
        const total =
          scenario === 'worst' && !body.p_busca && !body.p_tema_ids && !body.p_tipo_questao
            ? 1284
            : filtrados.length;
        return route.fulfill({ json: filtrados.map((i) => ({ ...i, total_count: total })) });
      });
      await p.route('**/rest/v1/rpc/get_questao_para_refazer', (route) => {
        const { p_questao_id: id } = route.request().postDataJSON() as { p_questao_id: string };
        const item = itens.find((i) => i.questao_id === id) ?? itens[0];
        return route.fulfill({
          json: {
            id,
            enunciado: item?.enunciado ?? ENUNCIADOS[0],
            enunciado_apoio: null,
            formato: 'multipla_escolha',
            tipo_questao: 'nacional',
            imagem_url: null,
            imagem_legenda: null,
            explicacao: null,
            referencia: null,
            disciplina: 'Nefrologia',
            temas: [],
            alternativas: [
              {
                id: 'alt-a',
                letra: 'A',
                texto: 'Solicitar avaliação da função renal e quantificar a proteinúria.',
                ordem: 1,
                correta: null,
              },
              {
                id: 'alt-b',
                letra: 'B',
                texto: 'Iniciar antibioticoterapia empírica e reavaliar em 30 dias.',
                ordem: 2,
                correta: null,
              },
              {
                id: 'alt-c',
                letra: 'C',
                texto: 'Suspender todos os anti-hipertensivos em uso.',
                ordem: 3,
                correta: null,
              },
              {
                id: 'alt-d',
                letra: 'D',
                texto: 'Indicar diálise de urgência sem investigação adicional.',
                ordem: 4,
                correta: null,
              },
            ],
          },
        });
      });
      await p.route('**/rest/v1/rpc/responder_questao_avulsa', (route) => {
        const body = route.request().postDataJSON() as {
          p_questao_id: string;
          p_alternativa_id: string;
        };
        const correta = body.p_alternativa_id === 'alt-a';
        itens = itens.map((i) =>
          i.questao_id === body.p_questao_id
            ? { ...i, status: correta ? 'dominada' : 'pendente' }
            : i,
        );
        return route.fulfill({
          json: {
            correta,
            alternativa_correta_id: 'alt-a',
            explicacao:
              'A avaliação da função renal e a quantificação da proteinúria orientam a investigação da doença renal crônica e a definição da conduta inicial.',
          },
        });
      });
      await p.route('**/rest/v1/rpc/marcar_questao_dominada', (route) => {
        const body = route.request().postDataJSON() as {
          p_questao_id: string;
          p_dominada: boolean;
        };
        itens = itens.map((i) =>
          i.questao_id === body.p_questao_id
            ? { ...i, status: body.p_dominada ? 'dominada' : 'pendente' }
            : i,
        );
        return route.fulfill({ json: null });
      });
    },
  });
  // O shell existe também no mobile; sua sidebar fica oculta por CSS.
  // Aguarda a hidratação antes de disparar a navegação autenticada.
  await page.locator('.sidebar-nav').waitFor({ state: 'attached', timeout: 30_000 });
  await clientNavigate(page, '/dashboard/caderno-de-erros');
  await expect(page.getByRole('heading', { name: 'Caderno de Erros', exact: true })).toBeVisible({
    timeout: 15_000,
  });
}
