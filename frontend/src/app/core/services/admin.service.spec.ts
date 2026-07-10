import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminService,
  type NovaQuestaoDaProva,
  type ProvaInput,
} from './admin.service';
import { SupabaseService } from './supabase.service';

const prova: ProvaInput = {
  nome: 'N1 — Clínica Médica',
  tipo: 'autoral',
  origem: 'autoral',
  formato: 'nacional',
  rede: 'afya',
  faculdade_id: 'faculdade-1',
  periodo: 1,
  subtipo: 'N1',
  subtipo_nacional: 'N1',
  publicada: false,
  arquivada: false,
};

const questoesNovas: NovaQuestaoDaProva[] = [{
  questao: {
    enunciado: 'Qual é o diagnóstico?',
    formato: 'multipla_escolha',
    tipo_questao: 'nacional',
    status: 'ativa',
    origem_geracao: 'ia_assistida',
  },
  alternativas: [
    { letra: 'A', texto: 'Alternativa A', correta: true, ordem: 1 },
    { letra: 'B', texto: 'Alternativa B', correta: false, ordem: 2 },
  ],
  tema_ids: ['tema-1'],
}];

describe('AdminService', () => {
  let service: AdminService;
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: SupabaseService, useValue: { client: { rpc: mockRpc } } },
      ],
    });
    service = TestBed.inject(AdminService);
  });

  it('envia a prova e as questões para a RPC transacional uma única vez', async () => {
    const provaCriada = { id: 'prova-1', ...prova, qtd_questoes: 2 };
    mockRpc.mockResolvedValue({ data: provaCriada, error: null });

    const result = await service.criarProvaComQuestoes(prova, questoesNovas, ['questao-existente']);

    expect(result).toEqual({ ok: true, data: provaCriada });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('admin_criar_prova_com_questoes', {
      p_prova: prova,
      p_questoes_novas: [{
        ...questoesNovas[0].questao,
        alternativas: questoesNovas[0].alternativas,
        tema_ids: ['tema-1'],
      }],
      p_questoes_existentes: ['questao-existente'],
    });
  });

  it('propaga a falha sem tentar persistir apenas parte do rascunho', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'falha de validação' } });

    const result = await service.criarProvaComQuestoes(prova, questoesNovas, []);

    expect(result).toEqual({ ok: false, error: 'falha de validação' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
