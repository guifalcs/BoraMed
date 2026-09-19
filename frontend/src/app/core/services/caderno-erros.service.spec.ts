import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CadernoErrosService } from './caderno-erros.service';
import { SupabaseService } from './supabase.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SupabaseStub {
  rpc: ReturnType<typeof vi.fn>;
}

function makeClient(rpcResult: { data: unknown; error: unknown }): SupabaseStub {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) };
}

function configure(client: SupabaseStub): CadernoErrosService {
  TestBed.configureTestingModule({
    providers: [
      CadernoErrosService,
      { provide: SupabaseService, useValue: { client } },
    ],
  });
  return TestBed.inject(CadernoErrosService);
}

const itemRaw = {
  questao_id: 'q-1',
  enunciado: 'Qual a capital...?',
  tipo_questao: 'nacional',
  formato: 'multipla_escolha',
  formato_prova: 'N1',
  temas: [{ id: 'tema-1', nome: 'Cardiologia' }],
  disciplina: 'Clínica Médica',
  prova_id: 'prova-1',
  tentativa_id: 'tentativa-1',
  erro_em: '2026-09-01T10:00:00Z',
  status: 'pendente',
  ultima_redo_correta: null,
  ultima_redo_em: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CadernoErrosService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCadernoErros()', () => {
    it('mapeia o retorno snake_case da RPC para o modelo camelCase', async () => {
      const client = makeClient({ data: [itemRaw], error: null });
      const service = configure(client);

      const result = await service.getCadernoErros();

      expect(result).toEqual([
        {
          questaoId: 'q-1',
          enunciado: 'Qual a capital...?',
          tipoQuestao: 'nacional',
          formato: 'multipla_escolha',
          formatoProva: 'N1',
          temas: ['Cardiologia'],
          disciplina: 'Clínica Médica',
          provaId: 'prova-1',
          tentativaId: 'tentativa-1',
          erroEm: '2026-09-01T10:00:00Z',
          status: 'pendente',
          ultimaRedoCorreta: null,
          ultimaRedoEm: null,
        },
      ]);
    });

    it('chama a RPC com os filtros convertidos para o formato esperado (arrays vazios viram null)', async () => {
      const client = makeClient({ data: [], error: null });
      const service = configure(client);

      await service.getCadernoErros({ temaIds: [], tipoQuestao: ['nacional'], status: 'dominada' });

      expect(client.rpc).toHaveBeenCalledWith('get_caderno_erros', {
        p_tema_ids: null,
        p_disciplina_ids: null,
        p_tipo_questao: ['nacional'],
        p_status: 'dominada',
      });
    });

    it('lança erro quando a RPC falha', async () => {
      const client = makeClient({ data: null, error: { message: 'db error' } });
      const service = configure(client);

      await expect(service.getCadernoErros()).rejects.toBeTruthy();
    });
  });

  describe('getResumo()', () => {
    it('mapeia o resumo snake_case para camelCase', async () => {
      const client = makeClient({
        data: {
          total_pendentes: 5,
          por_tipo_questao: { nacional: 3, processual: 1, laboratorio: 1 },
          tema_mais_fraco: 'Cardiologia',
          dominadas_ultimos_7_dias: 2,
        },
        error: null,
      });
      const service = configure(client);

      const result = await service.getResumo();

      expect(result).toEqual({
        totalPendentes: 5,
        porTipoQuestao: { nacional: 3, processual: 1, laboratorio: 1 },
        temaMaisFraco: 'Cardiologia',
        dominadasUltimos7Dias: 2,
      });
    });
  });

  describe('responderAvulsa()', () => {
    it('chama a RPC com os parâmetros corretos e mapeia o retorno', async () => {
      const client = makeClient({
        data: { correta: true, alternativa_correta_id: 'alt-1', explicacao: 'Porque sim.' },
        error: null,
      });
      const service = configure(client);

      const result = await service.responderAvulsa('q-1', 'alt-1');

      expect(client.rpc).toHaveBeenCalledWith('responder_questao_avulsa', {
        p_questao_id: 'q-1',
        p_alternativa_id: 'alt-1',
        p_resposta_texto: null,
      });
      expect(result).toEqual({ correta: true, alternativaCorretaId: 'alt-1', explicacao: 'Porque sim.' });
    });
  });

  describe('marcarDominada()', () => {
    it('chama a RPC com o id da questão e o novo status', async () => {
      const client = makeClient({ data: null, error: null });
      const service = configure(client);

      await service.marcarDominada('q-1', true);

      expect(client.rpc).toHaveBeenCalledWith('marcar_questao_dominada', {
        p_questao_id: 'q-1',
        p_dominada: true,
      });
    });
  });

  describe('gerarSimuladoComErros()', () => {
    it('chama gerar_simulado_personalizado com p_apenas_erros true e mapeia o retorno', async () => {
      const client = makeClient({
        data: { prova_id: 'prova-1', tentativa: { id: 'tentativa-1' } },
        error: null,
      });
      const service = configure(client);

      const result = await service.gerarSimuladoComErros({ qtd: 10 });

      expect(client.rpc).toHaveBeenCalledWith('gerar_simulado_personalizado', {
        p_tema_ids: null,
        p_qtd: 10,
        p_modo: 'simulado',
        p_tipo_questao: null,
        p_apenas_erros: true,
      });
      expect(result).toEqual({ provaId: 'prova-1', tentativaId: 'tentativa-1' });
    });
  });
});
