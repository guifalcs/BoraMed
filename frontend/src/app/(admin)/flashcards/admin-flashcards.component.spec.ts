import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminFlashcardsComponent } from './admin-flashcards.component';
import { AdminService, AdminFlashcardDeck, AdminFlashcardsStats } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

/** Template blanqueado — exercitamos só a lógica da classe (signals/computed). */

const DECK: AdminFlashcardDeck = {
  id: 'deck-1',
  titulo: 'Farmacologia — Antibióticos',
  descricao: 'Resumo de classes de antibióticos.',
  publico: false,
  likes_count: 0,
  cards_count: 2,
  criado_em: '2026-07-01T12:00:00Z',
  atualizado_em: '2026-07-05T12:00:00Z',
};

const STATS: AdminFlashcardsStats = {
  total_decks_oficiais: 3,
  total_decks_usuarios: 10,
  total_decks_publicos: 4,
  total_cards: 120,
  total_likes: 30,
  total_criadores: 6,
  serie_decks_por_dia: [{ dia: '2026-07-01', total: 2 }],
  top_publicos_por_likes: [{ id: 'deck-2', titulo: 'Cardio', likes_count: 12, cards_count: 20 }],
};

interface CompApi {
  ngOnInit(): Promise<void>;
  decks(): AdminFlashcardDeck[];
  view(): 'lista' | 'editor';
  aba(): 'decks' | 'metricas';
  onTabChange(aba: 'decks' | 'metricas'): void;
  novoDeck(): void;
  editCards(): { frente: string; verso: string }[];
  podeSalvar(): boolean;
  adicionarCard(): void;
  removerCard(index: number): void;
  setFrenteTexto(index: number, valor: string): void;
  setVersoTexto(index: number, valor: string): void;
  editTitulo: { set(value: string): void };
  salvarDeck(): Promise<void>;
  stats(): AdminFlashcardsStats | null;
}

async function setup() {
  const admin = {
    listarFlashcardDecksOficiais: vi.fn().mockResolvedValue({ ok: true, data: [DECK] }),
    criarFlashcardDeckOficial: vi.fn().mockResolvedValue({ ok: true, data: 'deck-novo' }),
    getFlashcardsStats: vi.fn().mockResolvedValue({ ok: true, data: STATS }),
  };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [AdminFlashcardsComponent],
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: NotificationService, useValue: toast },
    ],
  })
    .overrideComponent(AdminFlashcardsComponent, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(AdminFlashcardsComponent);
  const comp = fixture.componentInstance as unknown as CompApi;
  return { comp, admin, toast };
}

describe('AdminFlashcardsComponent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('carrega os decks oficiais no ngOnInit', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();

    expect(comp.decks()).toEqual([DECK]);
    expect(comp.view()).toBe('lista');
  });

  it('troca para a aba de métricas e carrega as stats sob demanda', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();

    comp.onTabChange('metricas');
    await Promise.resolve();
    await Promise.resolve();

    expect(admin.getFlashcardsStats).toHaveBeenCalledTimes(1);
    expect(comp.aba()).toBe('metricas');
    expect(comp.stats()).toEqual(STATS);
  });

  it('novoDeck abre o editor com um card em branco', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();

    comp.novoDeck();

    expect(comp.view()).toBe('editor');
    expect(comp.editCards()).toHaveLength(1);
    expect(comp.podeSalvar()).toBe(false);
  });

  it('adicionar/remover card ajusta a lista', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();
    comp.novoDeck();

    comp.adicionarCard();
    expect(comp.editCards()).toHaveLength(2);

    comp.removerCard(0);
    expect(comp.editCards()).toHaveLength(1);
  });

  it('podeSalvar exige título válido e todos os cards preenchidos', async () => {
    const { comp } = await setup();
    await comp.ngOnInit();
    comp.novoDeck();

    comp.editTitulo.set('Deck de teste');
    comp.setFrenteTexto(0, 'Pergunta');
    comp.setVersoTexto(0, 'Resposta');

    expect(comp.podeSalvar()).toBe(true);
  });

  it('salvarDeck não chama o service quando inválido', async () => {
    const { comp, admin } = await setup();
    await comp.ngOnInit();
    comp.novoDeck();

    await comp.salvarDeck();

    expect(admin.criarFlashcardDeckOficial).not.toHaveBeenCalled();
  });

  it('salvarDeck cria o deck e volta para a lista quando válido', async () => {
    const { comp, admin, toast } = await setup();
    await comp.ngOnInit();
    comp.novoDeck();
    comp.editTitulo.set('Deck de teste');
    comp.setFrenteTexto(0, 'Pergunta');
    comp.setVersoTexto(0, 'Resposta');

    await comp.salvarDeck();

    expect(admin.criarFlashcardDeckOficial).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
    expect(comp.view()).toBe('lista');
  });
});
