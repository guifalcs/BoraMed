import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { BUCKET_QUESTAO_IMAGENS, ImagemProtegidaService } from './imagem-protegida.service';

const PUBLICA = `https://proj.supabase.co/storage/v1/object/public/${BUCKET_QUESTAO_IMAGENS}/questoes/abc.webp`;

function configurar(createSignedUrl: ReturnType<typeof vi.fn>) {
  const from = vi.fn().mockReturnValue({ createSignedUrl });
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { storage: { from } } } }],
  });
  return { service: TestBed.inject(ImagemProtegidaService), from, createSignedUrl };
}

describe('ImagemProtegidaService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('troca a URL armazenada por uma URL assinada', async () => {
    const assinar = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://assinada/x?token=t' }, error: null });
    const { service, from } = configurar(assinar);

    expect(await service.resolver(PUBLICA)).toBe('https://assinada/x?token=t');
    expect(from).toHaveBeenCalledWith(BUCKET_QUESTAO_IMAGENS);
    // Assina o PATH do objeto, não a URL inteira.
    expect(assinar).toHaveBeenCalledWith('questoes/abc.webp', expect.any(Number));
  });

  it('reaproveita o cache em vez de assinar a mesma imagem duas vezes', async () => {
    const assinar = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://assinada/x' }, error: null });
    const { service } = configurar(assinar);

    await service.resolver(PUBLICA);
    await service.resolver(PUBLICA);
    expect(assinar).toHaveBeenCalledTimes(1);
  });

  it('compartilha a mesma requisição entre chamadas concorrentes', async () => {
    const assinar = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://assinada/x' }, error: null });
    const { service } = configurar(assinar);

    // Uma prova renderiza a mesma imagem em vários lugares ao mesmo tempo.
    await Promise.all([service.resolver(PUBLICA), service.resolver(PUBLICA), service.resolver(PUBLICA)]);
    expect(assinar).toHaveBeenCalledTimes(1);
  });

  it('devolve null para entrada nula e não chama o storage', async () => {
    const assinar = vi.fn();
    const { service } = configurar(assinar);

    expect(await service.resolver(null)).toBeNull();
    expect(await service.resolver(undefined)).toBeNull();
    expect(assinar).not.toHaveBeenCalled();
  });

  it('repassa URLs que não pertencem ao bucket protegido', async () => {
    const assinar = vi.fn();
    const { service } = configurar(assinar);

    const externa = 'https://cdn.exemplo.com/banner.png';
    expect(await service.resolver(externa)).toBe(externa);
    expect(assinar).not.toHaveBeenCalled();
  });

  it('cai para a URL original quando a assinatura falha (ex.: sem sessão no SSR)', async () => {
    const assinar = vi.fn().mockResolvedValue({ data: null, error: { message: 'not authorized' } });
    const { service } = configurar(assinar);

    expect(await service.resolver(PUBLICA)).toBe(PUBLICA);
  });

  it('não deixa o erro escapar quando o storage lança', async () => {
    const assinar = vi.fn().mockRejectedValue(new Error('rede caiu'));
    const { service } = configurar(assinar);

    expect(await service.resolver(PUBLICA)).toBe(PUBLICA);
  });

  it('limpar() descarta o cache, forçando nova assinatura', async () => {
    const assinar = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://assinada/x' }, error: null });
    const { service } = configurar(assinar);

    await service.resolver(PUBLICA);
    service.limpar();
    await service.resolver(PUBLICA);
    expect(assinar).toHaveBeenCalledTimes(2);
  });
});
