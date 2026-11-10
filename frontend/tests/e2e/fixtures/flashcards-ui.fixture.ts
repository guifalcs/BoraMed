import { expect, type Page } from '@playwright/test';
import type { FeedDeck, Flashcard, FlashcardDeck } from '../../../src/app/core/models/flashcard';
import { clientNavigate, setupTierMocks } from './tier.fixture';

export type FlashcardsScenario =
  | 'demo'
  | 'worst'
  | 'empty'
  | 'one'
  | 'error'
  | 'image'
  | 'broken-image'
  | 'max';
const DATA = '2026-11-10T12:00:00Z';
export const FLASHCARD_DECK_ID = 'flash-farma';
export const FLASHCARD_MEU_ID = 'flash-meu';

export function criarFlashcards(scenario: FlashcardsScenario = 'demo'): Flashcard[] {
  const pares = [
    [
      'O que é biodisponibilidade?',
      'Fração da dose administrada que alcança a circulação sistêmica.',
    ],
    [
      'O que é meia-vida de eliminação?',
      'Tempo necessário para que a concentração plasmática de um fármaco caia pela metade.',
    ],
    [
      'Qual é a diferença entre potência e eficácia?',
      'Potência se refere à dose necessária para um efeito. Eficácia é a capacidade de produzir o efeito máximo.',
    ],
  ];
  if (scenario === 'worst') {
    pares[0] = [
      'Como a farmacocinética e a farmacodinâmica orientam o ajuste individualizado de um medicamento em um paciente com comprometimento renal e interações medicamentosas?',
      'A farmacocinética descreve absorção, distribuição, metabolismo e eliminação; a farmacodinâmica relaciona a concentração ao efeito. A avaliação individual considera a função renal, o potencial de interações e a resposta clínica.\n\n' +
        'O contexto clínico orienta a interpretação dos parâmetros e a necessidade de acompanhamento. '.repeat(
          17,
        ),
    ];
  }
  return Array.from({ length: scenario === 'one' ? 1 : scenario === 'max' ? 200 : 3 }, (_, i) => ({
    id: `flash-card-${i + 1}`,
    deck_id: FLASHCARD_DECK_ID,
    posicao: i,
    frente: pares[i % 3][0],
    verso: pares[i % 3][1],
    frente_imagem_url:
      i === 0 && ['image', 'broken-image'].includes(scenario)
        ? `http://localhost:54321/storage/v1/object/public/flashcard-imagens/user/user-test-tier/${scenario}.webp`
        : null,
    verso_imagem_url: null,
    criado_em: DATA,
    atualizado_em: DATA,
  }));
}

export async function abrirFlashcards(
  page: Page,
  scenario: FlashcardsScenario = 'demo',
  path = '/dashboard/flashcards',
): Promise<void> {
  await page.clock.setFixedTime(new Date(DATA));
  const cards = criarFlashcards(scenario);
  const base: FlashcardDeck = {
    id: FLASHCARD_DECK_ID,
    user_id: null,
    oficial: true,
    titulo: 'Farmacologia essencial',
    descricao: 'Conceitos de farmacocinética e farmacodinâmica para revisar antes da prova.',
    publico: true,
    likes_count: 0,
    cards_count: cards.length,
    criado_em: DATA,
    atualizado_em: DATA,
  };
  const oficiais =
    scenario === 'empty'
      ? []
      : [
          base,
          ...['Anatomia cardiovascular', 'Histologia dos tecidos', 'Fisiologia renal'].map(
            (titulo, i) => ({
              ...base,
              id: `flash-oficial-${i}`,
              titulo,
              cards_count: [24, 18, 12][i],
            }),
          ),
        ];
  let meus =
    scenario === 'empty'
      ? []
      : [
          {
            ...base,
            id: FLASHCARD_MEU_ID,
            user_id: 'user-test-tier',
            oficial: false,
            titulo: 'Minha revisão de farmacologia',
            publico: false,
          },
          {
            ...base,
            id: 'flash-meu-publico',
            user_id: 'user-test-tier',
            oficial: false,
            titulo: 'Conceitos para compartilhar',
            publico: true,
            likes_count: 1,
          },
        ];
  let feed: FeedDeck[] =
    scenario === 'empty'
      ? []
      : [
          {
            id: 'flash-comunidade',
            titulo: 'Semiologia cardiovascular',
            descricao: 'Perguntas para praticar a identificação de achados no exame físico.',
            likes_count: 24,
            cards_count: 32,
            criado_em: DATA,
            autor_id: 'autor-1',
            autor_nome: 'Mariana Oliveira',
            curtido_por_mim: false,
          },
          {
            id: 'flash-comunidade-2',
            titulo: 'Histologia em perguntas',
            descricao: null,
            likes_count: 1,
            cards_count: 1,
            criado_em: DATA,
            autor_id: 'autor-2',
            autor_nome: 'Jo',
            curtido_por_mim: false,
          },
        ];
  if (scenario === 'one') oficiais.splice(1);
  if (scenario === 'worst') {
    base.titulo =
      'Farmacocinética e farmacodinâmica: integração dos mecanismos de ação e das interações medicamentosas na prática clínica';
    base.descricao =
      'Revisão dos mecanismos de absorção, distribuição, metabolismo e eliminação, considerando a integração entre os parâmetros farmacocinéticos e a resposta clínica em diferentes situações.';
    feed[0].titulo = base.titulo;
    feed[0].autor_nome = 'Maria Eduarda de Albuquerque Vasconcelos';
    feed[0].likes_count = 1284;
  }
  let falhar = scenario === 'error';
  await setupTierMocks(page, '/login', {
    nivel: 'avancado',
    extraRoutes: async (p) => {
      await p.route('**/storage/v1/object/public/flashcard-imagens/**', (route) =>
        scenario === 'broken-image'
          ? route.fulfill({ status: 404, body: '' })
          : route.fulfill({ path: 'public/landing-page/lamina-he.webp' }),
      );
      await p.route('**/rest/v1/flashcard_decks**', (route) => {
        const url = new URL(route.request().url());
        if (falhar && url.searchParams.get('oficial') === 'eq.true') {
          falhar = false;
          return route.fulfill({ status: 500, json: { message: 'Falha simulada' } });
        }
        if ((url.searchParams.get('select') ?? '').includes('flashcard_cards(')) {
          const id = url.searchParams.get('id')?.replace('eq.', '') ?? base.id;
          const deck = meus.find((d) => d.id === id) ??
            oficiais.find((d) => d.id === id) ?? { ...base, id };
          return route.fulfill({
            json: {
              ...deck,
              flashcard_cards:
                scenario === 'empty' ? [] : cards.map((c) => ({ ...c, deck_id: id })),
            },
          });
        }
        return route.fulfill({
          json:
            url.searchParams.get('oficial') === 'eq.true'
              ? oficiais
              : meus.map((d) => ({ ...d, flashcard_deck_likes: [] })),
        });
      });
      await p.route('**/rest/v1/rpc/flashcards_feed', (route) => {
        const body = route.request().postDataJSON() as { p_ordenacao: string; p_offset: number };
        const lista =
          body.p_ordenacao === 'curtidos'
            ? [...feed].sort((a, b) => b.likes_count - a.likes_count)
            : feed;
        return route.fulfill({ json: lista.slice(body.p_offset, body.p_offset + 20) });
      });
      await p.route('**/rest/v1/rpc/flashcards_toggle_like', (route) => {
        const { p_deck_id: id } = route.request().postDataJSON() as { p_deck_id: string };
        const deck = feed.find((d) => d.id === id);
        if (deck) {
          deck.curtido_por_mim = !deck.curtido_por_mim;
          deck.likes_count += deck.curtido_por_mim ? 1 : -1;
        }
        return route.fulfill({
          json: { curtido: deck?.curtido_por_mim ?? true, likes_count: deck?.likes_count ?? 2 },
        });
      });
      await p.route('**/rest/v1/rpc/flashcards_listar_likes_deck', (route) =>
        route.fulfill({
          json: [
            {
              user_id: 'autor-1',
              nome: 'Maria Eduarda de Albuquerque Vasconcelos',
              avatar_url: null,
              criado_em: DATA,
            },
          ],
        }),
      );
      await p.route('**/rest/v1/rpc/flashcards_excluir_deck', (route) => {
        const { p_deck_id: id } = route.request().postDataJSON() as { p_deck_id: string };
        meus = meus.filter((d) => d.id !== id);
        return route.fulfill({ json: null });
      });
      await p.route('**/rest/v1/rpc/flashcards_criar_deck', (route) => {
        const body = route.request().postDataJSON() as {
          p_titulo: string;
          p_descricao: string | null;
          p_publico: boolean;
          p_cards: unknown[];
        };
        meus = [
          ...meus,
          {
            ...base,
            id: 'flash-criado',
            user_id: 'user-test-tier',
            oficial: false,
            titulo: body.p_titulo,
            descricao: body.p_descricao,
            publico: body.p_publico,
            cards_count: body.p_cards.length,
          },
        ];
        return route.fulfill({ json: 'flash-criado' });
      });
      await p.route('**/rest/v1/rpc/flashcards_atualizar_deck', (route) =>
        route.fulfill({ json: null }),
      );
    },
  });
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.locator('.sidebar-nav')).toBeAttached();
  await page.waitForLoadState('networkidle');
  await clientNavigate(page, path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.locator('app-flashcards-home, app-deck-editor, app-deck-execucao'),
  ).toBeAttached();
}
