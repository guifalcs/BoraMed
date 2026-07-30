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
};

const provaComFaculdadeMock: ProvaComFaculdade = {
  ...provaMock,
  faculdade: null,
};

/**
 * Builds a chainable Supabase query-builder stub.
 *
 * All intermediate methods (select, eq, order, range, or, in) return `this` so
 * fluent chains work. The stub is also a thenable so `await query` resolves with
 * the given result (including `count`). `single()` resolves the same result.
 */
function makeQueryBuilder(result: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {
    then(resolve: (v: unknown) => void) {
      resolve(result);
    },
  };

  for (const method of ['select', 'eq', 'order', 'range', 'or', 'in']) {
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
    it('retorna { ok: true, data: { provas, total } } quando Supabase retorna dados', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [provaMock], error: null, count: 1 }));

      const result = await service.listarProvasNacionais({});

      expect(result).toEqual({ ok: true, data: { provas: [provaMock], total: 1 } });
    });

    it('popula o signal interno com as provas retornadas', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [provaMock], error: null, count: 1 }));

      await service.listarProvasNacionais({});

      expect(service.provas()).toEqual([provaMock]);
    });

    it('retorna { ok: false, error: "..." } quando Supabase lança erro', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'db error' } }));

      const result = await service.listarProvasNacionais({});

      expect(result).toEqual({ ok: false, error: 'Não foi possível carregar os simulados.' });
    });

    it('define isLoading como false após a chamada (mesmo em erro)', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'fail' } }));

      await service.listarProvasNacionais({});

      expect(service.isLoading()).toBe(false);
    });

    it('seleciona com count exato para permitir a paginação', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({});

      const selectMock = builder['select'] as ReturnType<typeof vi.fn>;
      expect(selectMock).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
    });

    it('aplica o range de acordo com pagina e porPagina', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null, count: 40 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ pagina: 2, porPagina: 15 });

      const rangeMock = builder['range'] as ReturnType<typeof vi.fn>;
      expect(rangeMock).toHaveBeenCalledWith(30, 44);
    });

    it('aplica filtro de subtipos (array) reproduzindo o coalesce subtipo/subtipo_nacional', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ subtipos: ['N1', 'N2'] });

      const orMock = builder['or'] as ReturnType<typeof vi.fn>;
      expect(orMock).toHaveBeenCalledWith(
        'subtipo.in.(N1,N2),and(subtipo.is.null,subtipo_nacional.in.(N1,N2))',
      );
    });

    it('ordena por colunas existentes no schema atual', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({});

      const orderMock = builder['order'] as ReturnType<typeof vi.fn>;
      expect(orderMock).toHaveBeenCalledWith('criado_em', { ascending: false });
      expect(orderMock).toHaveBeenCalledWith('subtipo', { ascending: true });
      expect(orderMock).not.toHaveBeenCalledWith('edicao', expect.anything());
    });

    it('aplica filtro de periodos preservando as provas sem periodo (TPI)', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ periodos: [1, 2] });

      const orMock = builder['or'] as ReturnType<typeof vi.fn>;
      expect(orMock).toHaveBeenCalledWith('periodo.in.(1,2),periodo.is.null');
    });

    it('aplica filtro de materias preservando as provas sem periodo (TPI)', async () => {
      const builder = makeQueryBuilder({ data: [provaMock], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ disciplinaIds: ['soi-1', 'soi-4'] });

      const orMock = builder['or'] as ReturnType<typeof vi.fn>;
      expect(orMock).toHaveBeenCalledWith('disciplina_id.in.(soi-1,soi-4),periodo.is.null');
    });

    it('não aplica filtros opcionais quando as listas estão vazias', async () => {
      const builder = makeQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(builder);

      await service.listarProvasNacionais({ subtipos: [], periodos: [] });

      const orMock = builder['or'] as ReturnType<typeof vi.fn>;
      const inMock = builder['in'] as ReturnType<typeof vi.fn>;
      expect(orMock).not.toHaveBeenCalled();
      expect(inMock).not.toHaveBeenCalled();

      const eqMock = builder['eq'] as ReturnType<typeof vi.fn>;
      expect(eqMock).toHaveBeenCalledWith('formato', 'nacional');
      expect(eqMock).toHaveBeenCalledWith('arquivada', false);
    });

    it('retorna lista vazia e total 0 quando Supabase retorna data: null', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null, count: null }));

      const result = await service.listarProvasNacionais({});

      expect(result).toEqual({ ok: true, data: { provas: [], total: 0 } });
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
      expect(selectMock).toHaveBeenCalledWith(expect.stringContaining('faculdade(nome, sigla)'));
    });
  });
});
