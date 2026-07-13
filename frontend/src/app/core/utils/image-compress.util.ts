/**
 * Utilitário para pré-processamento de imagens antes de upload.
 * Redimensiona e comprime no cliente para evitar envio de arquivos pesados.
 */

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputType?: 'image/webp' | 'image/jpeg';
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.82,
  outputType: 'image/webp',
};

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function extensionFor(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'img';
}

/**
 * Comprime e redimensiona uma imagem File no navegador usando Canvas.
 *
 * Tenta o formato preferido (webp por padrão). Alguns navegadores — Safari é o
 * caso clássico — ignoram `image/webp` no `toBlob` e devolvem PNG silenciosamente;
 * como PNG é lossless, o "resultado comprimido" pode ficar MAIOR que o original
 * (foi exatamente o que aconteceu no bucket de questões: webp rotulado, bytes PNG).
 * Para nunca depender de webp, se o navegador não produzir o formato pedido a
 * função re-encoda como JPEG (lossy, suportado em todo lugar), achatando a
 * transparência sobre fundo branco (canvas -> jpeg pinta alpha de preto).
 *
 * O File retornado tem `type` e extensão coerentes com os bytes reais, e é
 * sempre o MENOR entre original e processado.
 */
export function compressImage(
  file: File,
  options?: CompressOptions
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Arquivo não é uma imagem.'));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        resolve(await encodeSmallest(img, file, opts));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem para compressão.'));
    };

    img.src = url;
  });
}

async function encodeSmallest(
  img: HTMLImageElement,
  original: File,
  opts: Required<CompressOptions>
): Promise<File> {
  let { width, height } = img;

  // Redimensionar mantendo aspect ratio
  if (width > opts.maxWidth || height > opts.maxHeight) {
    const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D não disponível.');

  const drawOverWhite = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  };

  // JPEG não tem canal alpha: achata sobre branco desde já.
  if (opts.outputType === 'image/jpeg') {
    drawOverWhite();
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }

  let blob = await canvasToBlob(canvas, opts.outputType, opts.quality);
  if (!blob) throw new Error('Falha ao comprimir imagem.');

  // Fallback: o navegador ignorou o formato pedido (ex.: Safari devolve PNG para
  // webp). Re-encoda como JPEG achatando a transparência sobre fundo branco.
  if (blob.type !== opts.outputType && blob.type !== 'image/jpeg') {
    drawOverWhite();
    blob = await canvasToBlob(canvas, 'image/jpeg', opts.quality);
    if (!blob) throw new Error('Falha ao comprimir imagem.');
  }

  const mime = blob.type || 'image/jpeg';
  const baseName = original.name.replace(/\.[^./\\]+$/, '') || 'image';
  const processed = new File([blob], `${baseName}.${extensionFor(mime)}`, {
    type: mime,
    lastModified: Date.now(),
  });

  // Nunca deixa o upload ficar maior do que era (ex.: imagem já otimizada).
  return processed.size < original.size ? processed : original;
}

/**
 * Formatos que o navegador não recomprime de forma confiável e que devem
 * subir intactos:
 * - GIF: o canvas captura só um frame, então a animação se perderia.
 * - HEIC/HEIF: Chrome e Firefox não decodificam (só o Safari), o que faria
 *   a compressão falhar.
 */
const PASSTHROUGH_IMAGE_TYPES = new Set(['image/gif', 'image/heic', 'image/heif']);

/**
 * Comprime a imagem quando é seguro fazê-lo; caso contrário devolve o arquivo
 * original sem alterações. Nunca lança — pensado para fluxos de upload que
 * aceitam tipos diversos (imagens, vídeos, HEIC) e não podem ser bloqueados
 * por uma falha de compressão.
 *
 * Garante que:
 * - arquivos que não são imagem (ex.: vídeo) passam intactos;
 * - GIF/HEIC/HEIF passam intactos (ver PASSTHROUGH_IMAGE_TYPES);
 * - se a compressão falhar (decode, canvas), o original é mantido;
 * - o resultado é sempre o menor entre original e comprimido.
 *
 * O chamador deve derivar `contentType`, extensão do path e nome exibido do
 * arquivo RETORNADO, para não descasar extensão e conteúdo.
 */
export async function compressImageIfPossible(
  file: File,
  options?: CompressOptions
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (PASSTHROUGH_IMAGE_TYPES.has(file.type)) return file;

  try {
    const compressed = await compressImage(file, options);
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}
