import { compressImageIfPossible } from './image-compress.util';

function makeFile(type: string, name: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('compressImageIfPossible', () => {
  it('devolve o mesmo arquivo quando não é imagem (ex.: vídeo)', async () => {
    const video = makeFile('video/mp4', 'gravacao.mp4');
    const resultado = await compressImageIfPossible(video);
    expect(resultado).toBe(video);
  });

  it('devolve o mesmo arquivo para GIF (preserva animação)', async () => {
    const gif = makeFile('image/gif', 'anim.gif');
    const resultado = await compressImageIfPossible(gif);
    expect(resultado).toBe(gif);
  });

  it('devolve o mesmo arquivo para HEIC/HEIF (browser não decodifica)', async () => {
    const heic = makeFile('image/heic', 'foto.heic');
    const heif = makeFile('image/heif', 'foto.heif');
    expect(await compressImageIfPossible(heic)).toBe(heic);
    expect(await compressImageIfPossible(heif)).toBe(heif);
  });
});
