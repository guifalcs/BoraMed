import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { ProvasAfyaComponent } from './provas-afya.component';
import { ProvaService, type ProvaResult } from '../../../core/services/prova.service';
import type { Prova } from '../../../core/models/prova';

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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProvasAfyaComponent', () => {
  let fixture: ComponentFixture<ProvasAfyaComponent>;
  let component: ProvasAfyaComponent;
  let el: HTMLElement;

  const mockProvaService = {
    listarProvasNacionais: vi.fn(),
    listarProvasPorFormato: vi.fn(),
  };

  /**
   * Monta o componente. Sem `provasResult`, o fetch fica pendente (isLoading
   * permanece true) para exercitar o estado de skeleton.
   */
  async function setup(provasResult?: ProvaResult<Prova[]>) {
    vi.clearAllMocks();
    mockProvaService.listarProvasNacionais.mockReturnValue(
      provasResult ? Promise.resolve(provasResult) : new Promise(() => {}),
    );

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
        data: [provaFactory(), provaFactory({ id: 'prova-2', nome: 'Prova N2 2024' })],
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
    it('busca apenas treinos nacionais e mantém o título da página', async () => {
      await setup({ ok: true, data: [provaFactory()] });

      expect(el.textContent).toContain('Treinos nacionais');
      expect(mockProvaService.listarProvasNacionais).toHaveBeenCalled();
      expect(mockProvaService.listarProvasPorFormato).not.toHaveBeenCalled();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  describe('empty state', () => {
    beforeEach(async () => {
      await setup({ ok: true, data: [] });
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

  // ── provasFiltradas computed ──────────────────────────────────────────────

  describe('provasFiltradas()', () => {
    beforeEach(async () => {
      const provas: Prova[] = [
        provaFactory({ id: '1', subtipo_nacional: 'N1', periodo: 1 }),
        provaFactory({ id: '2', subtipo: 'N2', subtipo_nacional: 'N2', periodo: 2, nome: 'Prova N2 2024' }),
        provaFactory({ id: '3', subtipo: 'teste_progresso', subtipo_nacional: 'teste_progresso', periodo: 1, nome: 'TP 2024' }),
      ];
      await setup({ ok: true, data: provas });
    });

    it('retorna todas as provas quando nenhum filtro está ativo', () => {
      const filtered = (component as any).provasFiltradas();
      expect(filtered.length).toBe(3);
    });

    it('filtra por subtipo N1 ao chamar onSubtipoChange(["N1"])', () => {
      (component as any).onSubtipoChange(['N1']);
      const filtered = (component as any).provasFiltradas();
      expect(filtered.length).toBe(1);
      expect(filtered[0].subtipo_nacional).toBe('N1');
    });

    it('filtra por subtipo teste_progresso ao chamar onSubtipoChange(["teste_progresso"])', () => {
      (component as any).onSubtipoChange(['teste_progresso']);
      const filtered = (component as any).provasFiltradas();
      expect(filtered.every((p: Prova) => p.subtipo_nacional === 'teste_progresso')).toBe(true);
    });

    it('filtra por período ao chamar onPeriodoChange([1])', () => {
      (component as any).onPeriodoChange([1]);
      const filtered = (component as any).provasFiltradas();
      expect(filtered.length).toBe(2);
      expect(filtered.every((p: Prova) => p.periodo === 1)).toBe(true);
    });

    it('filtra combinando subtipo e período', () => {
      (component as any).onSubtipoChange(['N1']);
      (component as any).onPeriodoChange([1]);
      const filtered = (component as any).provasFiltradas();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('1');
    });

    it('retorna todas as provas ao redefinir subtipo para vazio', () => {
      (component as any).onSubtipoChange(['N1']);
      expect((component as any).provasFiltradas().length).toBe(1);

      (component as any).onSubtipoChange([]);
      expect((component as any).provasFiltradas().length).toBe(3);
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
