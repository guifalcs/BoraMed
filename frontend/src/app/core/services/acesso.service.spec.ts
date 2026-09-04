import { TestBed } from '@angular/core/testing';
import { describe, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AcessoService } from './acesso.service';
import { SupabaseService } from './supabase.service';

const DEVICE_KEY = 'boramed_device_id';

/**
 * Drena as microtasks sem mover o relógio falso. `runOnlyPendingTimers`
 * não serve aqui: ele adiantaria os 30 min do intervalo e dispararia um
 * segundo ping no meio das asserções.
 */
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('AcessoService', () => {
  let rpc: ReturnType<typeof vi.fn>;

  function criar(): AcessoService {
    rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    TestBed.configureTestingModule({
      providers: [
        AcessoService,
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });
    return TestBed.inject(AcessoService);
  }

  beforeEach(() => {
    localStorage.removeItem(DEVICE_KEY);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
    localStorage.removeItem(DEVICE_KEY);
  });

  it('registra o acesso ao iniciar, com o id de dispositivo', async () => {
    const service = criar();
    service.iniciar();
    await flush();

    expect(rpc).toHaveBeenCalledTimes(1);
    const [nome, args] = rpc.mock.calls[0];
    expect(nome).toBe('registrar_acesso');
    expect(args.p_device_id).toBe(localStorage.getItem(DEVICE_KEY));
    expect(args.p_device_id).toMatch(/^[0-9a-f-]{36}$/i);

    service.parar();
  });

  it('reaproveita o mesmo id de dispositivo entre instâncias', async () => {
    const primeiro = criar();
    primeiro.iniciar();
    await flush();
    const id = rpc.mock.calls[0][1].p_device_id;
    primeiro.parar();
    TestBed.resetTestingModule();

    const segundo = criar();
    segundo.iniciar();
    await flush();

    expect(rpc.mock.calls[0][1].p_device_id).toBe(id);
    segundo.parar();
  });

  it('não repete o ping dentro da janela de 30 min e volta a pingar depois', async () => {
    const service = criar();
    service.iniciar();
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);

    // Aba voltando ao primeiro plano logo depois não gera tráfego novo.
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(rpc).toHaveBeenCalledTimes(2);

    service.parar();
  });

  it('iniciar() é idempotente: não cria um segundo timer', async () => {
    const service = criar();
    service.iniciar();
    service.iniciar();
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(rpc).toHaveBeenCalledTimes(2);

    service.parar();
  });

  it('parar() encerra os pings', async () => {
    const service = criar();
    service.iniciar();
    await flush();
    service.parar();

    await vi.advanceTimersByTimeAsync(90 * 60 * 1000);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('falha do RPC não propaga', async () => {
    const service = criar();
    rpc.mockRejectedValue(new Error('offline'));
    service.iniciar();
    await expect(flush()).resolves.toBeUndefined();
    service.parar();
  });
});
