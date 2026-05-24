/**
 * Script para otimizar imagens estáticas do frontend.
 * Converte PNGs grandes para WebP (com ou sem transparência).
 * Redimensiona para dimensões compatíveis com o uso na UI.
 */
import sharp from 'sharp';
import { readdir, stat, rename, writeFile } from 'fs/promises';
import { join, basename, extname } from 'path';

const PUBLIC_DIR = join(import.meta.dirname, '..', 'public');
const ILLUSTRATIONS_DIR = join(PUBLIC_DIR, 'illustrations');
const LANDING_DIR = join(PUBLIC_DIR, 'landing-page');

// Dimensões máximas por uso na UI
const MAX_ILLUSTRATION_WIDTH = 600; // ilustrações de estado (erro, onboarding)
const MAX_LOGO_WIDTH = 400;

async function getFileSize(filePath) {
  const s = await stat(filePath);
  return s.size;
}

async function optimizeIllustrations() {
  const files = [
    { name: 'funny.png', maxWidth: MAX_ILLUSTRATION_WIDTH },
    { name: 'celebracao.png', maxWidth: MAX_ILLUSTRATION_WIDTH },
    { name: 'ErroGenerico.png', maxWidth: MAX_ILLUSTRATION_WIDTH },
    { name: '404.png', maxWidth: MAX_ILLUSTRATION_WIDTH },
    { name: '403.png', maxWidth: MAX_ILLUSTRATION_WIDTH },
  ];

  const results = [];

  for (const file of files) {
    const inputPath = join(ILLUSTRATIONS_DIR, file.name);
    const outputName = file.name.replace(/\.png$/, '.webp');
    const outputPath = join(ILLUSTRATIONS_DIR, outputName);

    const originalSize = await getFileSize(inputPath);
    const metadata = await sharp(inputPath).metadata();

    const hasAlpha = metadata.hasAlpha;
    const needsResize = metadata.width > file.maxWidth;

    let pipeline = sharp(inputPath);

    if (needsResize) {
      pipeline = pipeline.resize({ width: file.maxWidth, withoutEnlargement: true });
    }

    // WebP suporta transparência
    pipeline = pipeline.webp({ quality: 82, effort: 6 });

    await pipeline.toFile(outputPath);

    const newSize = await getFileSize(outputPath);
    const savings = ((1 - newSize / originalSize) * 100).toFixed(1);

    results.push({
      file: file.name,
      output: outputName,
      originalKB: (originalSize / 1024).toFixed(1),
      newKB: (newSize / 1024).toFixed(1),
      savings: `${savings}%`,
      hadAlpha: hasAlpha,
      resized: needsResize ? `${metadata.width} → ${file.maxWidth}` : 'no',
    });
  }

  return results;
}

async function optimizeLogo() {
  const results = [];

  // logo.png -> logo.webp (usado no header/sidebar, não precisa ser enorme)
  const logoPath = join(PUBLIC_DIR, 'logo.png');
  const logoOutPath = join(PUBLIC_DIR, 'logo.webp');

  const originalSize = await getFileSize(logoPath);
  const metadata = await sharp(logoPath).metadata();

  let pipeline = sharp(logoPath);
  if (metadata.width > MAX_LOGO_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_LOGO_WIDTH, withoutEnlargement: true });
  }
  pipeline = pipeline.webp({ quality: 85, effort: 6 });
  await pipeline.toFile(logoOutPath);

  const newSize = await getFileSize(logoOutPath);
  results.push({
    file: 'logo.png',
    output: 'logo.webp',
    originalKB: (originalSize / 1024).toFixed(1),
    newKB: (newSize / 1024).toFixed(1),
    savings: `${((1 - newSize / originalSize) * 100).toFixed(1)}%`,
  });

  // logoBranca.png -> logoBranca.webp
  const logoBrancaPath = join(PUBLIC_DIR, 'logoBranca.png');
  const logoBrancaOutPath = join(PUBLIC_DIR, 'logoBranca.webp');

  const origSize2 = await getFileSize(logoBrancaPath);
  const meta2 = await sharp(logoBrancaPath).metadata();

  let pipe2 = sharp(logoBrancaPath);
  if (meta2.width > MAX_LOGO_WIDTH) {
    pipe2 = pipe2.resize({ width: MAX_LOGO_WIDTH, withoutEnlargement: true });
  }
  pipe2 = pipe2.webp({ quality: 85, effort: 6 });
  await pipe2.toFile(logoBrancaOutPath);

  const newSize2 = await getFileSize(logoBrancaOutPath);
  results.push({
    file: 'logoBranca.png',
    output: 'logoBranca.webp',
    originalKB: (origSize2 / 1024).toFixed(1),
    newKB: (newSize2 / 1024).toFixed(1),
    savings: `${((1 - newSize2 / origSize2) * 100).toFixed(1)}%`,
  });

  return results;
}

async function optimizeLandingImages() {
  const results = [];
  const MAX_LANDING_WIDTH = 800;

  const files = [
    'modo-laboratorio.jpg',
    'ilustracao-performance.jpg',
    'hero-image.jpg',
    'modo-processual.jpg',
    'modo-nacional.jpg',
  ];

  for (const file of files) {
    const inputPath = join(LANDING_DIR, file);
    const outputName = file.replace(/\.jpg$/, '.webp');
    const outputPath = join(LANDING_DIR, outputName);

    const originalSize = await getFileSize(inputPath);
    const metadata = await sharp(inputPath).metadata();

    let pipeline = sharp(inputPath);
    if (metadata.width > MAX_LANDING_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_LANDING_WIDTH, withoutEnlargement: true });
    }
    pipeline = pipeline.webp({ quality: 80, effort: 6 });
    await pipeline.toFile(outputPath);

    const newSize = await getFileSize(outputPath);
    results.push({
      file,
      output: outputName,
      originalKB: (originalSize / 1024).toFixed(1),
      newKB: (newSize / 1024).toFixed(1),
      savings: `${((1 - newSize / originalSize) * 100).toFixed(1)}%`,
      resized: metadata.width > MAX_LANDING_WIDTH ? `${metadata.width} → ${MAX_LANDING_WIDTH}` : 'no',
    });
  }

  return results;
}

async function main() {
  console.log('=== Otimizando ilustrações ===');
  const illResults = await optimizeIllustrations();
  console.table(illResults);

  console.log('\n=== Otimizando logos ===');
  const logoResults = await optimizeLogo();
  console.table(logoResults);

  console.log('\n=== Otimizando landing page ===');
  const landingResults = await optimizeLandingImages();
  console.table(landingResults);

  const allResults = [...illResults, ...logoResults, ...landingResults];
  const totalOriginal = allResults.reduce((s, r) => s + parseFloat(r.originalKB), 0);
  const totalNew = allResults.reduce((s, r) => s + parseFloat(r.newKB), 0);

  console.log(`\n=== RESUMO ===`);
  console.log(`Total original: ${totalOriginal.toFixed(1)} KB`);
  console.log(`Total otimizado: ${totalNew.toFixed(1)} KB`);
  console.log(`Economia: ${(totalOriginal - totalNew).toFixed(1)} KB (${((1 - totalNew / totalOriginal) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
