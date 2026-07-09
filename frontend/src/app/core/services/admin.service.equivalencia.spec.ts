import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminService } from './admin.service';
import { SupabaseService } from './supabase.service';

/**
 * Chainable Supabase query-builder stub: todo método intermediário retorna o
 * próprio builder (fluent) e o builder é thenable (await resolve `result`).
 * Registra as chamadas para asserção dos filtros aplicados.
 */
function makeQueryBuilder(result: { data?: unknown; error: unknown; count?: number }) {
  const builder: Record<string, unknown> = {
    then(resolve: (v: unknown) => void) {
      resolve(result);
    },
  };
  for (const method of [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'gte', 'lte', 'ilike', 'in', 'is',
    'order', 'range', 'single',
  ]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  return builder;
}

describe('AdminService — equivalência e revisão de conversão', () => {
  let service: AdminService;
  const mockFrom = vi.fn();
  const mockSupabaseClient = { from: mockFrom };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: SupabaseService, useValue: { client: mockSupabaseClient } },
      ],
    });
    service = TestBed.inject(AdminService);
  });

  describe('contarQuestoesPorFormato', () => {
    it('deriva fechadas = total - abertas e repassa pendentes de revisão', async () => {
      // from() é chamado 3x, na ordem: total, abertas, pendentes.
      mockFrom
        .mockReturnValueOnce(makeQueryBuilder({ error: null, count: 10 })) // total
        .mockReturnValueOnce(makeQueryBuilder({ error: null, count: 4 }))  // abertas
        .mockReturnValueOnce(makeQueryBuilder({ error: null, count: 2 })); // pendentes

      const res = await service.contarQuestoesPorFormato();

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data).toEqual({ total: 10, abertas: 4, fechadas: 6, pendentesRevisao: 2 });
      expect(mockFrom).toHaveBeenCalledTimes(3);
    });

    it('propaga erro do banco', async () => {
      mockFrom
        .mockReturnValueOnce(makeQueryBuilder({ error: { message: 'boom' } }))
        .mockReturnValueOnce(makeQueryBuilder({ error: null, count: 0 }))
        .mockReturnValueOnce(makeQueryBuilder({ error: null, count: 0 }));

      const res = await service.contarQuestoesPorFormato();
      expect(res.ok).toBe(false);
    });
  });

  describe('marcarRevisaoConversao', () => {
    it("atualiza revisao_conversao='revisada' na questão certa", async () => {
      const builder = makeQueryBuilder({ error: null });
      mockFrom.mockReturnValue(builder);

      const res = await service.marcarRevisaoConversao('q-1', 'revisada');

      expect(res.ok).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('questao');
      expect(builder['update']).toHaveBeenCalledWith({ revisao_conversao: 'revisada' });
      expect(builder['eq']).toHaveBeenCalledWith('id', 'q-1');
    });
  });

  describe('listarQuestoes — filtros de agrupamento e revisão', () => {
    it("grupoFormato='abertas' filtra eq(formato, resposta_aberta_curta)", async () => {
      const builder = makeQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(builder);

      await service.listarQuestoes(0, 50, { grupoFormato: 'abertas' });

      expect(builder['eq']).toHaveBeenCalledWith('formato', 'resposta_aberta_curta');
    });

    it("grupoFormato='fechadas' filtra neq(formato, resposta_aberta_curta)", async () => {
      const builder = makeQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(builder);

      await service.listarQuestoes(0, 50, { grupoFormato: 'fechadas' });

      expect(builder['neq']).toHaveBeenCalledWith('formato', 'resposta_aberta_curta');
    });

    it("revisaoConversao='pendente' filtra eq(revisao_conversao, pendente)", async () => {
      const builder = makeQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(builder);

      await service.listarQuestoes(0, 50, { revisaoConversao: 'pendente' });

      expect(builder['eq']).toHaveBeenCalledWith('revisao_conversao', 'pendente');
    });

    it('sem filtros de grupo/revisão não aplica esses eq/neq extras', async () => {
      const builder = makeQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(builder);

      await service.listarQuestoes(0, 50, {});

      const eqCalls = (builder['eq'] as ReturnType<typeof vi.fn>).mock.calls;
      const neqCalls = (builder['neq'] as ReturnType<typeof vi.fn>).mock.calls;
      expect(eqCalls.some((c) => c[0] === 'formato')).toBe(false);
      expect(eqCalls.some((c) => c[0] === 'revisao_conversao')).toBe(false);
      // neq só o de status='deletada' (sempre presente), não o de formato.
      expect(neqCalls.some((c) => c[0] === 'formato')).toBe(false);
    });
  });
});
