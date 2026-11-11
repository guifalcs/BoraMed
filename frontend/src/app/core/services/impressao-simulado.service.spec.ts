import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImpressaoSimuladoService } from './impressao-simulado.service';
import { SupabaseService } from './supabase.service';

interface SupabaseStub {
  rpc: ReturnType<typeof vi.fn>;
}

function configure(rpcResult: { data: unknown; error: unknown }): { service: ImpressaoSimuladoService; client: SupabaseStub } {
  const client: SupabaseStub = { rpc: vi.fn().mockResolvedValue(rpcResult) };
  TestBed.configureTestingModule({
    providers: [ImpressaoSimuladoService, { provide: SupabaseService, useValue: { client } }],
  });
  return { service: TestBed.inject(ImpressaoSimuladoService), client };
}

describe('ImpressaoSimuladoService.gerarParaImpressao', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('repassa o formato da questão e pede o gabarito ao servidor', async () => {
    const { service, client } = configure({ data: { nome: 'S', questoes: [], gabarito_liberado: true }, error: null });

    await service.gerarParaImpressao(['t-1'], 30, 'processual', 'processual', 'discursivas');

    expect(client.rpc).toHaveBeenCalledWith('gerar_simulado_impressao', {
      p_tema_ids: ['t-1'],
      p_qtd: 30,
      p_tipo_questao: 'processual',
      p_formato: 'processual',
      p_formato_questao: 'discursivas',
      p_com_gabarito: true,
    });
  });

  it('libera o gabarito na impressão quando o servidor o devolve', async () => {
    const { service } = configure({ data: { nome: 'S', questoes: [], gabarito_liberado: true }, error: null });

    const result = await service.gerarParaImpressao(null, 10, null, null, 'misto');

    expect(result.ok && result.data.gabaritoLiberado).toBe(true);
    expect(service.simuladoEfemero()?.gabaritoLiberado).toBe(true);
  });

  it('mantém o gabarito fechado se o servidor não o liberar', async () => {
    const { service } = configure({ data: { nome: 'S', questoes: [] }, error: null });

    const result = await service.gerarParaImpressao(null, 10, null, null, 'fechadas');

    expect(result.ok && result.data.gabaritoLiberado).toBe(false);
  });
});
