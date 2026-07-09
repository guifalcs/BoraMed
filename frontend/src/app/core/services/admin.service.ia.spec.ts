import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminService } from './admin.service';
import { SupabaseService } from './supabase.service';

/** Builder fluente + thenable (mesmo padrão de admin.service.equivalencia.spec). */
function makeQueryBuilder(result: { data?: unknown; error: unknown; count?: number }) {
  const builder: Record<string, unknown> = {
    then(resolve: (v: unknown) => void) {
      resolve(result);
    },
  };
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single']) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  return builder;
}

const AGENTE = {
  id: 'ia-1',
  slug: 'aurora',
  nome: 'Aurora',
  ativo: true,
  temperatura: 0,
  limite_diario: 200,
  max_resposta_chars: 3000,
  persona: 'Corretor rigoroso.',
  tom: 'Direto.',
  tamanho_feedback: 'Curto.',
  regras_correcao: null,
  regras_extras: null,
  atualizado_em: '2026-07-09T12:00:00Z',
};

describe('AdminService — agentes de IA (Aurora)', () => {
  let service: AdminService;
  const mockFrom = vi.fn();
  const mockGetUser = vi.fn();
  const mockSupabaseClient = { from: mockFrom, auth: { getUser: mockGetUser } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: SupabaseService, useValue: { client: mockSupabaseClient } },
      ],
    });
    service = TestBed.inject(AdminService);
  });

  describe('listarIaAgentes', () => {
    it('lê da tabela ia_agente ordenada por nome', async () => {
      const builder = makeQueryBuilder({ data: [AGENTE], error: null });
      mockFrom.mockReturnValue(builder);

      const res = await service.listarIaAgentes();

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data).toHaveLength(1);
      expect(res.data[0].slug).toBe('aurora');
      expect(mockFrom).toHaveBeenCalledWith('ia_agente');
      expect(builder['order']).toHaveBeenCalledWith('nome', { ascending: true });
    });

    it('propaga erro do banco', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ error: { message: 'permission denied' } }));
      const res = await service.listarIaAgentes();
      expect(res.ok).toBe(false);
    });
  });

  describe('salvarIaAgente', () => {
    it('atualiza a linha certa e carimba atualizado_por com o admin logado', async () => {
      const builder = makeQueryBuilder({ data: { ...AGENTE, ativo: false }, error: null });
      mockFrom.mockReturnValue(builder);

      const res = await service.salvarIaAgente('ia-1', { ativo: false });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.ativo).toBe(false);
      expect(mockFrom).toHaveBeenCalledWith('ia_agente');
      expect(builder['eq']).toHaveBeenCalledWith('id', 'ia-1');
      const updateArg = (builder['update'] as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg).toMatchObject({ ativo: false, atualizado_por: 'admin-1' });
    });

    it('propaga erro do banco', async () => {
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'boom' } }));
      const res = await service.salvarIaAgente('ia-1', { limite_diario: 100 });
      expect(res.ok).toBe(false);
    });
  });
});
