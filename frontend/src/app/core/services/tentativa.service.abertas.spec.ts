import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TentativaService } from './tentativa.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { GamificacaoService } from './gamificacao.service';
import { NotificationService } from './notification.service';
import { CacheService } from './cache.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SupabaseStub {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
}

function makeClient(rpcResult: { data: unknown; error: unknown }): SupabaseStub {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    from: vi.fn(),
  };
}

function configure(client: SupabaseStub): TentativaService {
  TestBed.configureTestingModule({
    providers: [
      TentativaService,
      { provide: SupabaseService, useValue: { client } },
      { provide: AuthService, useValue: { user: () => ({ id: 'user-1' }) } },
      { provide: GamificacaoService, useValue: { concederXpTentativa: vi.fn() } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: CacheService, useValue: { remove: vi.fn() } },
    ],
  });
  return TestBed.inject(TentativaService);
}

const respostaRaw = {
  id: 'tr-1',
  tentativa_id: 'tent-1',
  questao_id: 'q-1',
  alternativa_id: null,
  resposta_texto: 'minha resposta',
  correta: null,
  tempo_gasto_segundos: null,
  ordem_na_tentativa: 1,
  respondida_em: null,
  enviada_em: null,
  pontos: null,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TentativaService — questões abertas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('salvarRespostaTexto', () => {
    it('chama a RPC com os parâmetros corretos e atualiza o estado local', async () => {
      const client = makeClient({ data: respostaRaw, error: null });
      const service = configure(client);

      const result = await service.salvarRespostaTexto('tent-1', 'q-1', 'minha resposta');

      expect(result.ok).toBe(true);
      expect(client.rpc).toHaveBeenCalledWith('salvar_resposta_texto', {
        p_tentativa_id: 'tent-1',
        p_questao_id: 'q-1',
        p_texto: 'minha resposta',
      });
      expect(service.respostas()).toHaveLength(1);
      expect(service.respostas()[0].resposta_texto).toBe('minha resposta');
    });

    it('traduz erro de resposta já enviada', async () => {
      const client = makeClient({ data: null, error: new Error('Resposta ja enviada') });
      const service = configure(client);

      const result = await service.salvarRespostaTexto('tent-1', 'q-1', 'x');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('já foi enviada');
    });
  });

  describe('enviarRespostaAberta', () => {
    it('retorna resposta travada + correção pendente', async () => {
      const payload = {
        resposta: { ...respostaRaw, enviada_em: '2026-07-07T12:00:00Z' },
        correcao: { id: 'rc-1', tentativa_resposta_id: 'tr-1', status: 'pendente' },
      };
      const client = makeClient({ data: payload, error: null });
      const service = configure(client);

      const result = await service.enviarRespostaAberta('tent-1', 'q-1', 'final');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.correcao.status).toBe('pendente');
        expect(result.data.resposta.enviada_em).not.toBeNull();
      }
      expect(service.respostas()[0].enviada_em).toBe('2026-07-07T12:00:00Z');
    });

    it('traduz erro de resposta vazia', async () => {
      const client = makeClient({ data: null, error: new Error('Resposta vazia') });
      const service = configure(client);

      const result = await service.enviarRespostaAberta('tent-1', 'q-1', '');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Escreva uma resposta');
    });
  });

  describe('getStatusCorrecoes', () => {
    it('devolve o agregado da RPC', async () => {
      const status = { total: 3, corrigidas: 1, pendentes: 1, erros: 1, sem_ia: 0, itens: [] };
      const client = makeClient({ data: status, error: null });
      const service = configure(client);

      const result = await service.getStatusCorrecoes('tent-1');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.pendentes).toBe(1);
      expect(client.rpc).toHaveBeenCalledWith('get_status_correcoes', {
        p_tentativa_id: 'tent-1',
      });
    });
  });

  describe('consolidarCorrecoes', () => {
    it('passa o flag forcar_sem_ia para a RPC', async () => {
      const client = makeClient({
        data: { consolidada: true, correcoes_pendentes: 0, tentativa: {}, questoes: [], respostas: [], distribuicao_temas: [] },
        error: null,
      });
      const service = configure(client);

      const result = await service.consolidarCorrecoes('tent-1', true);

      expect(result.ok).toBe(true);
      expect(client.rpc).toHaveBeenCalledWith('consolidar_correcoes_tentativa', {
        p_tentativa_id: 'tent-1',
        p_forcar_sem_ia: true,
      });
    });

    it('reporta não consolidada sem erro', async () => {
      const client = makeClient({
        data: { consolidada: false, correcoes_pendentes: 2 },
        error: null,
      });
      const service = configure(client);

      const result = await service.consolidarCorrecoes('tent-1');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.consolidada).toBe(false);
    });
  });
});
