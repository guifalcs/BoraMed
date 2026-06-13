import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ProvaDetalheComponent } from './prova-detalhe.component';
import { ProvaService } from '../../../core/services/prova.service';
import { TentativaService } from '../../../core/services/tentativa.service';
import type { ProvaComFaculdade } from '../../../core/models/prova';
import type { Tentativa } from '../../../core/models/tentativa';

function provaFactory(overrides: Partial<ProvaComFaculdade> = {}): ProvaComFaculdade {
  return {
    id: 'prova-1',
    faculdade_id: null,
    nome: 'Simulado N1 — 1º Período — Edição 1',
    periodo: 1,
    tipo: 'autoral',
    origem: 'autoral',
    formato: 'nacional',
    rede: 'afya',
    subtipo: 'N1',
    subtipo_nacional: 'N1',
    qtd_questoes: 30,
    publicada: true,
    arquivada: false,
    criado_em: '2024-01-01T00:00:00Z',
    faculdade: null,
    ...overrides,
  };
}

function tentativaFactory(overrides: Partial<Tentativa> = {}): Tentativa {
  return {
    id: 'tent-1',
    user_id: 'user-1',
    prova_id: 'prova-1',
    modo: 'simulado',
    status: 'em_andamento',
    total_questoes: 30,
    total_respondidas: 5,
    acertos: 3,
    nota: null,
    iniciada_em: '2024-01-01T10:00:00Z',
    pausada_em: null,
    tempo_acumulado_segundos: 300,
    finalizada_em: null,
    criado_em: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('ProvaDetalheComponent', () => {
  let fixture: ComponentFixture<ProvaDetalheComponent>;
  let el: HTMLElement;

  const mockProvaService = {
    buscarProva: vi.fn(),
  };

  const mockTentativaService = {
    buscarTentativaAtiva: vi.fn(),
    iniciar: vi.fn(),
    retomar: vi.fn(),
    setProvaNome: vi.fn(),
  };

  const mockActivatedRoute = {
    snapshot: {
      paramMap: { get: () => 'prova-1' },
      queryParamMap: { get: (): string | null => null },
    },
  };

  async function setup(
    provaResult: { ok: true; data: ProvaComFaculdade } | { ok: false; error: string },
    tentativaResult: { ok: true; data: Tentativa | null } | { ok: false; error: string } = { ok: true, data: null },
  ) {
    mockProvaService.buscarProva.mockResolvedValue(provaResult);
    mockTentativaService.buscarTentativaAtiva.mockResolvedValue(tentativaResult);

    await TestBed.configureTestingModule({
      imports: [ProvaDetalheComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: ProvaService, useValue: mockProvaService },
        { provide: TentativaService, useValue: mockTentativaService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProvaDetalheComponent);
    el = fixture.nativeElement as HTMLElement;
    // Manually trigger and await async ngOnInit
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  describe('loading', () => {
    it('exibe skeleton enquanto carrega', async () => {
      const pending = new Promise<never>(() => {});
      mockProvaService.buscarProva.mockReturnValue(pending);
      mockTentativaService.buscarTentativaAtiva.mockReturnValue(pending);

      await TestBed.configureTestingModule({
        imports: [ProvaDetalheComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: mockActivatedRoute },
          { provide: ProvaService, useValue: mockProvaService },
          { provide: TentativaService, useValue: mockTentativaService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ProvaDetalheComponent);
      el = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();

      const skeleton = el.querySelectorAll('.animate-pulse');
      expect(skeleton.length).toBeGreaterThan(0);
    });
  });

  // ── Erro ───────────────────────────────────────────────────────────────────

  describe('erro', () => {
    beforeEach(async () => {
      await setup({ ok: false, error: 'Simulado não encontrado.' });
    });

    it('exibe empty-state com mensagem de erro', () => {
      const emptyState = el.querySelector('app-empty-state');
      expect(emptyState).not.toBeNull();
    });

    it('não exibe título da prova quando há erro', () => {
      expect(el.textContent).not.toContain('Simulado N1 — 1º Período — Edição 1');
    });
  });

  // ── Prova carregada ────────────────────────────────────────────────────────

  describe('prova carregada sem tentativa ativa', () => {
    beforeEach(async () => {
      await setup({ ok: true, data: provaFactory() });
    });

    it('exibe o nome do simulado', () => {
      const titulos = Array.from(el.querySelectorAll('h1')).map((h) => h.textContent ?? '');
      expect(titulos.join(' ')).toContain('Simulado N1 — 1º Período — Edição 1');
    });

    it('exibe metadados (período, edição, questões)', () => {
      expect(el.textContent).toContain('1º período');
      expect(el.textContent).toContain('Edição 1');
      expect(el.textContent).toContain('30 questões');
    });

    it('exibe seletor de modo', () => {
      const modoSelector = el.querySelector('app-modo-selector');
      expect(modoSelector).not.toBeNull();
    });

    it('exibe botão "Iniciar prova"', () => {
      const btn = el.querySelector('app-ui-button');
      expect(btn).not.toBeNull();
    });

    it('nao exibe link aberto de gabarito antes de finalizar', () => {
      expect(el.textContent).not.toContain('Só quero ver as questões e o gabarito');
    });

    it('não exibe banner de tentativa ativa', () => {
      expect(el.textContent).not.toContain('em andamento');
      expect(el.textContent).not.toContain('Retomar');
    });

    it('pré-seleciona modo estudo via query param', async () => {
      mockActivatedRoute.snapshot.queryParamMap.get = () => 'estudo';
      TestBed.resetTestingModule();
      await setup({ ok: true, data: provaFactory() });
      expect((fixture.componentInstance as any).modoSelecionado()).toBe('estudo');
      mockActivatedRoute.snapshot.queryParamMap.get = () => null;
    });
  });

  // ── Prova sem questões ─────────────────────────────────────────────────────

  describe('prova sem questões cadastradas', () => {
    beforeEach(async () => {
      await setup({ ok: true, data: provaFactory({ qtd_questoes: 0 }) });
    });

    it('exibe mensagem de questões não cadastradas', () => {
      expect(el.textContent).toContain('não tem questões cadastradas');
    });

    it('não exibe botão "Iniciar prova"', () => {
      expect(el.textContent).not.toContain('Iniciar prova');
    });
  });

  // ── Tentativa ativa ────────────────────────────────────────────────────────

  describe('tentativa ativa existente', () => {
    beforeEach(async () => {
      await setup(
        { ok: true, data: provaFactory() },
        { ok: true, data: tentativaFactory() },
      );
    });

    it('exibe banner de tentativa em andamento', () => {
      expect(el.textContent).toContain('em andamento');
    });

    it('exibe botão "Retomar"', () => {
      expect(el.textContent).toContain('Retomar');
    });

    it('exibe botão "Nova tentativa"', () => {
      expect(el.textContent).toContain('Nova tentativa');
    });
  });

  describe('tentativa pausada', () => {
    beforeEach(async () => {
      await setup(
        { ok: true, data: provaFactory() },
        { ok: true, data: tentativaFactory({ status: 'pausada', pausada_em: '2024-01-01T11:00:00Z' }) },
      );
    });

    it('exibe "pausada" quando status é pausada', () => {
      expect(el.textContent).toContain('pausada');
    });
  });
});
