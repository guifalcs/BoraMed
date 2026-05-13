import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProvaService } from './prova.service';
import { SupabaseService } from './supabase.service';
import type { Prova, ProvaComFaculdade } from '../models/prova';

// ─── Helpers ────────────────────────────────────────────────────────────────

const provaMock: Prova = {
  id: 'prova-1',
  faculdade_id: null,
  nome: 'Simulado N1 — 1º Período — Edição 1',
  periodo: 1,
  ano: null,
  semestre: null,
  tipo: 'nacional',
  subtipo_nacional: 'N1',
  qtd_questoes: 30,
  tempo_sugerido_minutos: 60,
  edicao: 1,
  criado_em: '2024-01-01T00:00:00Z',
};

const provaComFaculdadeMock: ProvaComFaculdade = {
  ...provaMock,
  faculdade: null,
};

/**
 * Builds a chainable Supabase query-builder stub.
 *
 * All intermediate methods (select, eq, order) return `this` so fluent
 * chains work. The stub is also a thenable so `await query` resolves with
 * the given result. `single()` resolves the same result immediately.
 */
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    then(resolve: (v: unknown) => void) {
      resolve(result);
    },
  };

  for (const method of ['select', 'eq', 'order']) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  builder['single'] = vi.fn().mockResolvedValue(result);

  return builder;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProvaService', () => {
  let service: ProvaService;
  const mockFrom = vi.fn();

  const mockSupabaseClient = {
    from: mockFrom,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        ProvaService,
        { provide: SupabaseService, useValue: { client: mockSupabaseClient } },
      ],
    });

    service = TestBed.inject(ProvaService);
  });

  // ── listarProvasNacionais ──────────────────────────────────────────────────

  describe('listarProvasNacionais()', () => {
    it('retorna { ok: true, data: [...] } quando Supabase retorna dados', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [provaMock], error: null }));

      const result = await service.listarProvasNacionais({ subtipo: null, periodo: null });

      expect(result).toEqual({ ok: true, data: [provaMock] });
    });

    it('popula o signal interno com as provas retornadas', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [provaMock], error: null }));

      await service.listarProvasNacionais({ subtipo: null, periodo: null });

      expect(service.provas()).toEqual([provaMock]);
    });

    it('retorna { ok: false, error: "..." } quando Supabase lança erro', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'db error' } }));

      const result = await service.listarProvasNacionais({ subtipo: null, periodo: null });

      expect(result).toEqual({ ok: false, error: 'Não foi possível carregar os simulados.' });
    });

    it('define isLoading como false após a chamada (mesmo em erro)', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'fail' } }));

      await service.listarProvasNacionais({ subtipo: null, periodo: null });

      expect(service.isLoading()).toBe(false);
    });

    it('aplica filtro de subtipo quando fornecido', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ subtipo: 'N1', periodo: null });

      const eqMock = builder['eq'] as ReturnType<typeof vi.fn>;
      expect(eqMock).toHaveBeenCalledWith('subtipo_nacional', 'N1');
    });

    it('aplica filtro de periodo quando fornecido', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ subtipo: null, periodo: 1 });

      const eqMock = builder['eq'] as ReturnType<typeof vi.fn>;
      expect(eqMock).toHaveBeenCalledWith('periodo', 1);
    });

    it('não aplica filtros opcionais quando eles são null', async () => {
      const builder = makeQueryBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ subtipo: null, periodo: null });

      const eqMock = builder['eq'] as ReturnType<typeof vi.fn>;
      // Only the mandatory eq('tipo', 'nacional') should be called
      expect(eqMock).toHaveBeenCalledTimes(1);
      expect(eqMock).toHaveBeenCalledWith('tipo', 'nacional');
    });

    it('retorna array vazio quando Supabase retorna data: null', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

      const result = await service.listarProvasNacionais({ subtipo: null, periodo: null });

      expect(result).toEqual({ ok: true, data: [] });
    });
  });

  // ── buscarProva ────────────────────────────────────────────────────────────

  describe('buscarProva()', () => {
    it('retorna { ok: true, data: prova } com faculdade aninhada', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: provaComFaculdadeMock, error: null }));

      const result = await service.buscarProva('prova-1');

      expect(result).toEqual({ ok: true, data: provaComFaculdadeMock });
    });

    it('retorna { ok: false, error: "..." } quando prova não existe', async () => {
      mockFrom.mockReturnValue(
        makeQueryBuilder({ data: null, error: { message: 'No rows found', code: 'PGRST116' } }),
      );

      const result = await service.buscarProva('id-inexistente');

      expect(result).toEqual({ ok: false, error: 'Simulado não encontrado.' });
    });

    it('chama .from("prova") com select incluindo faculdade', async () => {
      const builder = makeQueryBuilder({ data: provaComFaculdadeMock, error: null });
      mockFrom.mockReturnValue(builder);

      await service.buscarProva('prova-1');

      expect(mockFrom).toHaveBeenCalledWith('prova');
      const selectMock = builder['select'] as ReturnType<typeof vi.fn>;
      expect(selectMock).toHaveBeenCalledWith('*, faculdade(nome, sigla)');
    });
  });
});
