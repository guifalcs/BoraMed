import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { PesquisaService } from './pesquisa.service';
import { AvisoService } from './aviso.service';
import { SupabaseService } from './supabase.service';
import type { PesquisaPendente } from '../models/pesquisa.types';

function fakePesquisa(id: string): PesquisaPendente {
  return {
    id,
    titulo: `Pesquisa ${id}`,
    descricao: null,
    perguntas: [],
  };
}

describe('PesquisaService', () => {
  let rpc: ReturnType<typeof vi.fn>;
  let temAvisos: ReturnType<typeof signal<boolean>>;
  let service: PesquisaService;

  beforeEach(() => {
    rpc = vi.fn();
    temAvisos = signal(false);
    TestBed.configureTestingModule({
      providers: [
        PesquisaService,
        { provide: SupabaseService, useValue: { client: { rpc } } },
        { provide: AvisoService, useValue: { temAvisos } },
      ],
    });
    service = TestBed.inject(PesquisaService);
  });

  it('começa sem pesquisa na fila', () => {
    expect(service.temPesquisas()).toBe(false);
    expect(service.pesquisaAtual()).toBeNull();
  });

  it('verificar() carrega a fila e expõe a primeira', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a'), fakePesquisa('b')], error: null });

    await service.verificar();

    expect(rpc).toHaveBeenCalledWith('buscar_pesquisas_pendentes');
    expect(service.temPesquisas()).toBe(true);
    expect(service.pesquisaAtual()?.id).toBe('a');
  });

  it('verificar() mantém a fila intacta quando a RPC falha', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a')], error: null });
    await service.verificar();

    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await service.verificar();

    expect(service.pesquisaAtual()?.id).toBe('a');
  });

  it('verificar() não busca nada enquanto houver aviso na fila', async () => {
    temAvisos.set(true);

    await service.verificar();

    expect(rpc).not.toHaveBeenCalled();
    expect(service.temPesquisas()).toBe(false);
  });

  it('responder() envia o payload e tira a pesquisa da fila', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a'), fakePesquisa('b')], error: null });
    await service.verificar();

    rpc.mockResolvedValue({ data: null, error: null });
    const itens = [{ pergunta_id: 'q1', texto: 'oi', numero: null, opcao_ids: [] }];
    const resultado = await service.responder('a', itens);

    expect(resultado).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith('responder_pesquisa', {
      p_pesquisa_id: 'a',
      p_itens: itens,
    });
    expect(service.pesquisaAtual()?.id).toBe('b');
  });

  it('responder() traduz o código de erro e mantém a pesquisa na fila', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a')], error: null });
    await service.verificar();

    rpc.mockResolvedValue({ data: null, error: { code: 'P0024', message: 'raw' } });
    const resultado = await service.responder('a', []);

    expect(resultado).toEqual({ ok: false, error: 'Responda as perguntas obrigatórias.' });
    expect(service.pesquisaAtual()?.id).toBe('a');
  });

  it('responder() cai numa mensagem genérica em erro desconhecido', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a')], error: null });
    await service.verificar();

    rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'rede' } });
    const resultado = await service.responder('a', []);

    expect(resultado).toEqual({ ok: false, error: 'Não deu para enviar agora. Tente de novo.' });
  });

  it('dispensar() chama a RPC e tira a pesquisa da fila', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a'), fakePesquisa('b')], error: null });
    await service.verificar();

    rpc.mockResolvedValue({ data: null, error: null });
    const ok = await service.dispensar('a');

    expect(ok).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith('dispensar_pesquisa', { p_pesquisa_id: 'a' });
    expect(service.pesquisaAtual()?.id).toBe('b');
  });

  it('dispensar() mantém a pesquisa na fila quando a RPC falha', async () => {
    rpc.mockResolvedValue({ data: [fakePesquisa('a')], error: null });
    await service.verificar();

    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const ok = await service.dispensar('a');

    expect(ok).toBe(false);
    expect(service.pesquisaAtual()?.id).toBe('a');
  });
});
