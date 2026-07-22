import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { ProvasAfyaComponent } from './provas-afya.component';
import { ProvaService, type ProvaResult } from '../../../core/services/prova.service';
import type { Prova, ProvasPaginadas } from '../../../core/models/prova';

// ─── Helpers ────────────────────────────────────────────────────────────────

function provaFactory(overrides: Partial<Prova> = {}): Prova {
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
    ...overrides,
  };
}

function pagina(provas: Prova[], total = provas.length): ProvasPaginadas {
  return { provas, total };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProvasAfyaComponent', () => {
  let fixture: ComponentFixture<ProvasAfyaComponent>;
  let component: ProvasAfyaComponent;
  let el: HTMLElement;

  const mockProvaService = {
    listarProvasNacionais: vi.fn(),
    listarProvasPorFormato: vi.fn(),
    listarDisciplinas: vi.fn(),
  };

  /**
   * Monta o componente. Sem `provasResult`, o fetch fica pendente (isLoading
   * permanece true) para exercitar o estado de skeleton.
   */
  async function setup(provasResult?: ProvaResult<ProvasPaginadas>) {
    vi.clearAllMocks();
    mockProvaService.listarProvasNacionais.mockReturnValue(
      provasResult ? Promise.resolve(provasResult) : new Promise(() => {}),
    );
    mockProvaService.listarDisciplinas.mockReturnValue(Promise.resolve({ ok: true, data: [] }));

    await TestBed.configureTestingModule({
      imports: [ProvasAfyaComponent],
      providers: [
        provideRouter([]),
        { provide: ProvaService, useValue: mockProvaService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProvasAfyaComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  describe('estado de loading', () => {
    it('renderiza skeleton enquanto o fetch está pendente', async () => {
      await setup(undefined);

      const skeletonItems = el.querySelectorAll('li .animate-pulse');
      expect(skeletonItems.length).toBeGreaterThan(0);
    });
  });

  // ── Lista de provas ───────────────────────────────────────────────────────

  describe('lista de provas carregada', () => {
    beforeEach(async () => {
      await setup({
        ok: true,
        data: pagina([provaFactory(), provaFactory({ id: 'prova-2', nome: 'Prova N2 2024' })]),
      });
    });

    it('renderiza um item de prova por prova retornada', () => {
      const rows = el.querySelectorAll('app-prova-card');
      expect(rows.length).toBe(2);
    });

    it('não exibe o skeleton após o carregamento', () => {
      const skeletonItems = el.querySelectorAll('li .animate-pulse');
      expect(skeletonItems.length).toBe(0);
    });

    it('não exibe o empty state quando há provas', () => {
      const emptyState = el.querySelector('app-empty-state');
      expect(emptyState).toBeNull();
    });
  });

  describe('busca de provas', () => {
    it('busca apenas treinos nacionais (rede afya) e mantém o título da página', async () => {
      await setup({ ok: true, data: pagina([provaFactory()]) });

      expect(el.textContent).toContain('Treinos nacionais');
      expect(mockProvaService.listarProvasNacionais).toHaveBeenCalledWith(
        expect.objectContaining({ rede: 'afya', pagina: 0, porPagina: 15 }),
      );
      expect(mockProvaService.listarProvasPorFormato).not.toHaveBeenCalled();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  describe('empty state', () => {
    beforeEach(async () => {
      await setup({ ok: true, data: pagina([], 0) });
    });

    it('renderiza o empty state quando a lista está vazia', () => {
      const emptyState = el.querySelector('app-empty-state');
      expect(emptyState).not.toBeNull();
    });

    it('não renderiza nenhum app-prova-card quando lista está vazia', () => {
      const rows = el.querySelectorAll('app-prova-card');
      expect(rows.length).toBe(0);
    });
  });

  // ── Filtros server-side ───────────────────────────────────────────────────

  describe('filtros server-side', () => {
    beforeEach(async () => {
      await setup({ ok: true, data: pagina([provaFactory()], 1) });
    });

    it('refaz a busca com o subtipo selecionado ao chamar onSubtipoChange(["N1"])', () => {
      (component as any).onSubtipoChange(['N1']);
      expect(mockProvaService.listarProvasNacionais).toHaveBeenLastCalledWith(
        expect.objectContaining({ subtipos: ['N1'], pagina: 0 }),
      );
    });

    it('refaz a busca com o período selecionado ao chamar onPeriodoChange([1])', () => {
      (component as any).onPeriodoChange([1]);
      expect(mockProvaService.listarProvasNacionais).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodos: [1], pagina: 0 }),
      );
    });

    it('combina subtipo e período nos parâmetros da busca', () => {
      (component as any).onSubtipoChange(['N1']);
      (component as any).onPeriodoChange([1]);
      expect(mockProvaService.listarProvasNacionais).toHaveBeenLastCalledWith(
        expect.objectContaining({ subtipos: ['N1'], periodos: [1], pagina: 0 }),
      );
    });

    it('volta para a primeira página quando um filtro muda', () => {
      (component as any).pagina.set(3);
      (component as any).onSubtipoChange(['N1']);
      expect((component as any).pagina()).toBe(0);
    });
  });

  // ── Paginação ─────────────────────────────────────────────────────────────

  describe('paginação', () => {
    beforeEach(async () => {
      // 40 registros no total, 15 por página → 3 páginas.
      await setup({ ok: true, data: pagina([provaFactory()], 40) });
    });

    it('calcula o total de páginas a partir do total de registros', () => {
      expect((component as any).totalPaginas()).toBe(3);
    });

    it('avança de página e refaz a busca com a nova página', () => {
      (component as any).proximaPagina();
      expect((component as any).pagina()).toBe(1);
      expect(mockProvaService.listarProvasNacionais).toHaveBeenLastCalledWith(
        expect.objectContaining({ pagina: 1 }),
      );
    });

    it('não avança além da última página', () => {
      (component as any).pagina.set(2);
      (component as any).proximaPagina();
      expect((component as any).pagina()).toBe(2);
    });

    it('não retrocede antes da primeira página', () => {
      (component as any).paginaAnterior();
      expect((component as any).pagina()).toBe(0);
    });

    it('retrocede de página e refaz a busca', () => {
      (component as any).pagina.set(2);
      (component as any).paginaAnterior();
      expect((component as any).pagina()).toBe(1);
      expect(mockProvaService.listarProvasNacionais).toHaveBeenLastCalledWith(
        expect.objectContaining({ pagina: 1 }),
      );
    });
  });

  // ── Erro de carregamento ──────────────────────────────────────────────────

  describe('erro de carregamento', () => {
    beforeEach(async () => {
      await setup({ ok: false, error: 'Não foi possível carregar os simulados.' });
    });

    it('exibe o empty-state de erro quando o serviço retorna erro', () => {
      const emptyState = el.querySelector('app-empty-state');
      expect(emptyState).not.toBeNull();
    });

    it('não exibe provas quando o serviço retorna erro', () => {
      const rows = el.querySelectorAll('app-prova-card');
      expect(rows.length).toBe(0);
    });
  });
});
