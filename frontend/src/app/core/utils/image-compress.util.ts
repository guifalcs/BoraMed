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

/**
 * Comprime e redimensiona uma imagem File no navegador usando Canvas.
 * Retorna um novo File com dimensão e peso otimizados.
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

    img.onload = () => {
      URL.revokeObjectURL(url);

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
      if (!ctx) {
        reject(new Error('Canvas 2D não disponível.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao comprimir imagem.'));
            return;
          }

          const ext = opts.outputType === 'image/webp' ? 'webp' : 'jpg';
          const compressedFile = new File([blob], `image.${ext}`, {
            type: opts.outputType,
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        },
        opts.outputType,
        opts.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem para compressão.'));
    };

    img.src = url;
  });
}
