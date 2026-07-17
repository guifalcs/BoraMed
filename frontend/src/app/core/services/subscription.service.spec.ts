import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { SubscriptionService } from './subscription.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { User } from '@supabase/supabase-js';
import type { Assinatura, Pagamento, Plano } from '../models/subscription.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-abc',
    email: 'user@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

function fakeAssinatura(overrides: Partial<Assinatura> = {}): Assinatura {
  return {
    id: 'ass-1',
    user_id: 'user-abc',
    plano_id: 'plano-1',
    mp_preapproval_id: 'preapp-1',
    mp_payment_id: null,
    status: 'authorized',
    data_inicio: new Date().toISOString(),
    proxima_cobranca: null,
    cancelada_em: null,
    cortesia: false,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    plano: {
      nome: 'Plano Premium',
      slug: 'premium',
      preco_centavos: 6990,
      moeda: 'BRL',
      frequency: 1,
      frequency_type: 'months',
      recorrente: true,
      tier: 'avancado',
    },
    ...overrides,
  };
}

function fakePlano(overrides: Partial<Plano> = {}): Plano {
  return {
    id: 'plano-1',
    slug: 'premium',
    nome: 'Plano Premium',
    descricao: 'Acesso completo',
    preco_centavos: 6990,
    moeda: 'BRL',
    frequency: 1,
    frequency_type: 'months',
    recorrente: true,
    ativo: true,
    ordem: 1,
    tier: 'avancado',
    ...overrides,
  };
}

/**
 * Cria um query-builder encadeável que suporta todos os métodos usados em
 * subscription.service.ts. Métodos intermediários retornam o próprio builder;
 * terminais (single / maybeSingle) resolvem com `result`. O próprio builder
 * também é um thenable para suportar `await builder` (sem terminal explícito),
 * como em listarPlanos() e historicoPagamentos().
 */
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const k of [
    'select', 'update', 'eq', 'insert', 'remove',
    'order', 'limit', 'in',
  ]) {
    builder[k] = vi.fn().mockReturnValue(builder);
  }
  builder['single'] = vi.fn().mockResolvedValue(result);
  builder['maybeSingle'] = vi.fn().mockResolvedValue(result);
  // Torna o builder awaitable (thenable) para queries sem terminal explícito
  builder['then'] = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  const userSignal = signal<User | null>(null);

  const mockRpc = vi.fn();
  const mockFunctionsInvoke = vi.fn();
  const mockFrom = vi.fn();

  const mockSupabaseClient = {
    from: mockFrom,
    rpc: mockRpc,
    functions: { invoke: mockFunctionsInvoke },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userSignal.set(null);

    TestBed.configureTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: AuthService,
          useValue: { user: userSignal.asReadonly() },
        },
        {
          provide: SupabaseService,
          useValue: { client: mockSupabaseClient },
        },
      ],
    });

    service = TestBed.inject(SubscriptionService);
  });

  // ── temAcesso (computed) ───────────────────────────────────────────────────

  describe('temAcesso (computed)', () => {
    it('retorna false quando assinatura é null', () => {
      expect(service.temAcesso()).toBe(false);
    });

    it('retorna true somente quando status é "authorized"', () => {
      // Força o sinal interno via carregarAssinatura (simulado abaixo)
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'authorized' });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      return service.carregarAssinatura().then(() => {
        expect(service.temAcesso()).toBe(true);
      });
    });

    it('retorna false quando status é "pending"', () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'pending' });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      return service.carregarAssinatura().then(() => {
        expect(service.temAcesso()).toBe(false);
      });
    });

    it('retorna false quando status é "paused"', () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'paused' });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      return service.carregarAssinatura().then(() => {
        expect(service.temAcesso()).toBe(false);
      });
    });

    it('retorna false quando status é "cancelled"', () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'cancelled' });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      return service.carregarAssinatura().then(() => {
        expect(service.temAcesso()).toBe(false);
      });
    });
  });

  // ── carregarAssinatura ─────────────────────────────────────────────────────

  describe('carregarAssinatura()', () => {
    it('retorna sem chamar o Supabase quando user é null', async () => {
      userSignal.set(null);

      await service.carregarAssinatura();

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('popula assinatura() com o resultado do Supabase', async () => {
      const ass = fakeAssinatura();
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      await service.carregarAssinatura();

      expect(mockFrom).toHaveBeenCalledWith('assinatura');
      expect(service.assinatura()).toEqual(ass);
    });

    it('define assinatura como null quando Supabase retorna erro', async () => {
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'DB error' } }));

      await service.carregarAssinatura();

      expect(service.assinatura()).toBeNull();
    });

    it('define isLoading como false após a chamada (independente de erro)', async () => {
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'fail' } }));

      await service.carregarAssinatura();

      expect(service.isLoading()).toBe(false);
    });

    it('chamadas concorrentes deduplicam o fetch (from chamado exatamente uma vez)', async () => {
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [fakeAssinatura()], error: null }));

      // Dispara dois carregarAssinatura ao mesmo tempo sem aguardar
      const p1 = service.carregarAssinatura();
      const p2 = service.carregarAssinatura();
      await Promise.all([p1, p2]);

      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  // ── temAssinaturaAtivaServidor ─────────────────────────────────────────────

  describe('temAssinaturaAtivaServidor()', () => {
    it('chama supabase.rpc("tem_assinatura_ativa")', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null });

      await service.temAssinaturaAtivaServidor();

      expect(mockRpc).toHaveBeenCalledWith('tem_assinatura_ativa');
    });

    it('retorna true quando data === true', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null });

      const result = await service.temAssinaturaAtivaServidor();

      expect(result).toBe(true);
    });

    it('retorna false quando data é false', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null });

      const result = await service.temAssinaturaAtivaServidor();

      expect(result).toBe(false);
    });

    it('retorna false quando data não é true (ex: null)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      const result = await service.temAssinaturaAtivaServidor();

      expect(result).toBe(false);
    });

    it('retorna false quando Supabase retorna erro', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });

      const result = await service.temAssinaturaAtivaServidor();

      expect(result).toBe(false);
    });

    it('cacheia resultado positivo: segunda chamada não vai à rede', async () => {
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValue({ data: true, error: null });

      await service.temAssinaturaAtivaServidor();
      const result = await service.temAssinaturaAtivaServidor();

      expect(result).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('NÃO cacheia resultado negativo: cada chamada reconsulta o servidor', async () => {
      // "Sem acesso" é volátil (pagamento pode aprovar a qualquer momento);
      // cachear false quebraria o polling pós-checkout e prenderia no paywall
      // um usuário recém-pago.
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValueOnce({ data: false, error: null });
      mockRpc.mockResolvedValueOnce({ data: true, error: null });

      expect(await service.temAssinaturaAtivaServidor()).toBe(false);
      expect(await service.temAssinaturaAtivaServidor()).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('não reaproveita cache positivo de outro usuário', async () => {
      userSignal.set(fakeUser({ id: 'user-1' }));
      mockRpc.mockResolvedValue({ data: true, error: null });
      await service.temAssinaturaAtivaServidor();

      userSignal.set(fakeUser({ id: 'user-2' }));
      await service.temAssinaturaAtivaServidor();

      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('deduplica chamadas concorrentes na mesma requisição', async () => {
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValue({ data: true, error: null });

      const [a, b] = await Promise.all([
        service.temAssinaturaAtivaServidor(),
        service.temAssinaturaAtivaServidor(),
      ]);

      expect(a).toBe(true);
      expect(b).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('invalidarAcesso() descarta o cache positivo', async () => {
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValue({ data: true, error: null });
      await service.temAssinaturaAtivaServidor();

      service.invalidarAcesso();
      await service.temAssinaturaAtivaServidor();

      expect(mockRpc).toHaveBeenCalledTimes(2);
    });
  });

  // ── tierAtivoServidor ──────────────────────────────────────────────────────

  describe('tierAtivoServidor()', () => {
    it('chama supabase.rpc("assinatura_tier")', async () => {
      mockRpc.mockResolvedValue({ data: 'avancado', error: null });

      await service.tierAtivoServidor();

      expect(mockRpc).toHaveBeenCalledWith('assinatura_tier');
    });

    it('retorna "essencial" quando a RPC devolve "essencial"', async () => {
      mockRpc.mockResolvedValue({ data: 'essencial', error: null });

      expect(await service.tierAtivoServidor()).toBe('essencial');
    });

    it('retorna "avancado" quando a RPC devolve "avancado"', async () => {
      mockRpc.mockResolvedValue({ data: 'avancado', error: null });

      expect(await service.tierAtivoServidor()).toBe('avancado');
    });

    it('retorna null quando a RPC devolve null (sem acesso)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      expect(await service.tierAtivoServidor()).toBeNull();
    });

    it('retorna null quando Supabase retorna erro', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });

      expect(await service.tierAtivoServidor()).toBeNull();
    });

    it('cacheia o resultado: segunda chamada não vai à rede', async () => {
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValue({ data: 'essencial', error: null });

      await service.tierAtivoServidor();
      const result = await service.tierAtivoServidor();

      expect(result).toBe('essencial');
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('deduplica chamadas concorrentes na mesma requisição', async () => {
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValue({ data: 'avancado', error: null });

      const [a, b] = await Promise.all([
        service.tierAtivoServidor(),
        service.tierAtivoServidor(),
      ]);

      expect(a).toBe('avancado');
      expect(b).toBe('avancado');
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('invalidarAcesso() descarta o cache do tier', async () => {
      userSignal.set(fakeUser());
      mockRpc.mockResolvedValue({ data: 'essencial', error: null });
      await service.tierAtivoServidor();

      service.invalidarAcesso();
      await service.tierAtivoServidor();

      expect(mockRpc).toHaveBeenCalledTimes(2);
    });
  });

  // ── tier (computed) ────────────────────────────────────────────────────────

  describe('tier (computed)', () => {
    it('retorna null quando não há assinatura carregada', () => {
      expect(service.tier()).toBeNull();
    });

    it('retorna o tier do plano quando a assinatura está autorizada', async () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({
        status: 'authorized',
        plano: {
          nome: 'Essencial Mensal',
          slug: 'essencial-mensal',
          preco_centavos: 2990,
          moeda: 'BRL',
          frequency: 1,
          frequency_type: 'months',
          recorrente: false,
          tier: 'essencial',
        },
      });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      await service.carregarAssinatura();

      expect(service.tier()).toBe('essencial');
    });

    it('retorna "avancado" quando autorizada mas sem plano vinculado (cortesia/admin)', async () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'authorized', plano: null, plano_id: null, cortesia: true });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      await service.carregarAssinatura();

      expect(service.tier()).toBe('avancado');
    });

    it('retorna null quando a assinatura não está autorizada', async () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'cancelled' });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      await service.carregarAssinatura();

      expect(service.tier()).toBeNull();
    });
  });

  // ── listarPlanos ───────────────────────────────────────────────────────────

  describe('listarPlanos()', () => {
    it('retorna [] quando Supabase retorna erro', async () => {
      const builder = makeQueryBuilder({ data: null, error: { message: 'erro' } });
      mockFrom.mockReturnValue(builder);

      const result = await service.listarPlanos();

      expect(result).toEqual([]);
    });

    it('retorna [] quando data é null', async () => {
      const builder = makeQueryBuilder({ data: null, error: null });
      mockFrom.mockReturnValue(builder);

      const result = await service.listarPlanos();

      expect(result).toEqual([]);
    });

    it('retorna o array de planos quando Supabase ok', async () => {
      const planos = [fakePlano(), fakePlano({ id: 'plano-2', slug: 'basico', ordem: 2 })];
      const builder = makeQueryBuilder({ data: planos, error: null });
      mockFrom.mockReturnValue(builder);

      const result = await service.listarPlanos();

      expect(result).toEqual(planos);
    });

    it('filtra por ativo=true com .eq("ativo", true)', async () => {
      const builder = makeQueryBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(builder);

      await service.listarPlanos();

      const eqMock = builder['eq'] as ReturnType<typeof vi.fn>;
      expect(eqMock).toHaveBeenCalledWith('ativo', true);
    });

    it('ordena por ordem ascendente com .order("ordem", { ascending: true })', async () => {
      const builder = makeQueryBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(builder);

      await service.listarPlanos();

      const orderMock = builder['order'] as ReturnType<typeof vi.fn>;
      expect(orderMock).toHaveBeenCalledWith('ordem', { ascending: true });
    });
  });

  // ── historicoPagamentos ────────────────────────────────────────────────────

  describe('historicoPagamentos()', () => {
    it('retorna [] quando user é null', async () => {
      userSignal.set(null);

      const result = await service.historicoPagamentos();

      expect(result).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('retorna [] quando Supabase retorna erro', async () => {
      userSignal.set(fakeUser());
      const builder = makeQueryBuilder({ data: null, error: { message: 'erro' } });
      mockFrom.mockReturnValue(builder);

      const result = await service.historicoPagamentos();

      expect(result).toEqual([]);
    });

    it('mapeia assinatura.plano.nome para plano_nome no pagamento', async () => {
      userSignal.set(fakeUser());
      const rawData = [
        {
          id: 'pag-1',
          user_id: 'user-abc',
          assinatura_id: 'ass-1',
          valor_centavos: 6990,
          moeda: 'BRL',
          status: 'approved',
          metodo_pagamento: 'credit_card',
          processado_em: new Date().toISOString(),
          criado_em: new Date().toISOString(),
          plano_nome: null,
          assinatura: { plano: { nome: 'Plano Premium' } },
        },
      ];
      const builder = makeQueryBuilder({ data: rawData, error: null });
      mockFrom.mockReturnValue(builder);

      const result = await service.historicoPagamentos();

      expect(result).toHaveLength(1);
      expect(result[0].plano_nome).toBe('Plano Premium');
    });

    it('define plano_nome como null quando assinatura não tem plano', async () => {
      userSignal.set(fakeUser());
      const rawData = [
        {
          id: 'pag-2',
          user_id: 'user-abc',
          assinatura_id: null,
          valor_centavos: null,
          moeda: 'BRL',
          status: 'pending',
          metodo_pagamento: null,
          processado_em: null,
          criado_em: new Date().toISOString(),
          plano_nome: null,
          assinatura: null,
        },
      ];
      const builder = makeQueryBuilder({ data: rawData, error: null });
      mockFrom.mockReturnValue(builder);

      const result = await service.historicoPagamentos();

      expect(result[0].plano_nome).toBeNull();
    });
  });

  // ── iniciarCheckout ────────────────────────────────────────────────────────

  describe('iniciarCheckout()', () => {
    it('invoca "mp-criar-assinatura" com o body correto', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: { init_point: 'https://mp.com/checkout' }, error: null });

      await service.iniciarCheckout('premium');

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('mp-criar-assinatura', {
        body: { plano_slug: 'premium' },
      });
    });

    it('retorna { ok: true, initPoint } quando data tem init_point', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { init_point: 'https://mp.com/checkout/abc' },
        error: null,
      });

      const result = await service.iniciarCheckout('premium');

      expect(result).toEqual({ ok: true, initPoint: 'https://mp.com/checkout/abc' });
    });

    it('retorna { ok: false } quando init_point está ausente na resposta', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });

      const result = await service.iniciarCheckout('premium');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Checkout indisponível no momento.');
      }
    });

    it('retorna { ok: false } com mensagem da edge function quando error.context.json() resolve', async () => {
      const edgeError = {
        context: {
          json: vi.fn().mockResolvedValue({ error: 'Você já tem um acesso ativo no momento.' }),
        },
      };
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: edgeError });

      const result = await service.iniciarCheckout('premium');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Você já tem um acesso ativo no momento.');
      }
    });

    it('usa mensagem genérica quando context.json() lança exceção', async () => {
      const edgeError = {
        context: {
          json: vi.fn().mockRejectedValue(new Error('not json')),
        },
      };
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: edgeError });

      const result = await service.iniciarCheckout('premium');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Não foi possível iniciar o checkout. Tente novamente.');
      }
    });

    it('usa mensagem genérica quando error não tem context', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'network error' } });

      const result = await service.iniciarCheckout('premium');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Não foi possível iniciar o checkout. Tente novamente.');
      }
    });
  });

  // ── vincular ───────────────────────────────────────────────────────────────

  describe('vincular()', () => {
    it('invoca "mp-vincular-assinatura" com o preapproval_id correto', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      await service.vincular('preapp-xyz');

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('mp-vincular-assinatura', {
        body: { preapproval_id: 'preapp-xyz' },
      });
    });

    it('retorna { ok: true } e atualiza assinatura quando sucesso', async () => {
      userSignal.set(fakeUser());
      const ass = fakeAssinatura({ status: 'authorized' });
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: [ass], error: null }));

      const result = await service.vincular('preapp-xyz');

      expect(result.ok).toBe(true);
      expect(service.assinatura()).toEqual(ass);
    });

    it('retorna { ok: false } com mensagem extraída do context quando erro', async () => {
      const edgeError = {
        context: {
          json: vi.fn().mockResolvedValue({ error: 'Assinatura já vinculada.' }),
        },
      };
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: edgeError });

      const result = await service.vincular('preapp-xyz');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Assinatura já vinculada.');
      }
    });

    it('usa mensagem genérica quando error não tem context ao vincular', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'network error' } });

      const result = await service.vincular('preapp-xyz');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Não foi possível confirmar a assinatura.');
      }
    });
  });

  // ── cancelar / pausar / reativar ───────────────────────────────────────────

  describe('cancelar()', () => {
    it('invoca "mp-gerenciar-assinatura" com acao="cancelar"', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      await service.cancelar();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('mp-gerenciar-assinatura', {
        body: { acao: 'cancelar' },
      });
    });

    it('retorna { ok: true } quando Supabase ok', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      const result = await service.cancelar();

      expect(result.ok).toBe(true);
    });

    it('retorna { ok: false } quando Supabase retorna erro', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'cancelar falhou' } });

      const result = await service.cancelar();

      expect(result.ok).toBe(false);
    });
  });

  describe('pausar()', () => {
    it('invoca "mp-gerenciar-assinatura" com acao="pausar"', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      await service.pausar();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('mp-gerenciar-assinatura', {
        body: { acao: 'pausar' },
      });
    });

    it('retorna { ok: true } quando Supabase ok', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      const result = await service.pausar();

      expect(result.ok).toBe(true);
    });

    it('retorna { ok: false } quando Supabase retorna erro', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'pausar falhou' } });

      const result = await service.pausar();

      expect(result.ok).toBe(false);
    });
  });

  describe('reativar()', () => {
    it('invoca "mp-gerenciar-assinatura" com acao="reativar"', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      await service.reativar();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('mp-gerenciar-assinatura', {
        body: { acao: 'reativar' },
      });
    });

    it('retorna { ok: true } quando Supabase ok', async () => {
      userSignal.set(fakeUser());
      mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: fakeAssinatura(), error: null }));

      const result = await service.reativar();

      expect(result.ok).toBe(true);
    });

    it('retorna { ok: false } quando Supabase retorna erro', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'reativar falhou' } });

      const result = await service.reativar();

      expect(result.ok).toBe(false);
    });
  });
});
