/**
 * Compressão em massa das imagens já armazenadas no Supabase Storage.
 *
 * Percorre os buckets indicados, baixa cada imagem, recomprime com sharp
 * (redimensiona para no máx. 1600px e reencoda em WebP q80) e só regrava
 * quando o resultado fica MENOR que o original. Idempotente: rodar de novo
 * não piora nada.
 *
 * Como rodar (a partir da pasta frontend/, que já tem sharp e supabase-js):
 *
 *   cd frontend
 *   export SUPABASE_URL="https://SEU-PROJETO.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"   # NUNCA a anon
 *
 *   # 1) Simulação (não altera nada, só mostra o que faria):
 *   node ../scripts/compress-storage-images.mjs
 *
 *   # 2) Para valer:
 *   node ../scripts/compress-storage-images.mjs --apply
 *
 * Opções:
 *   --apply              regrava de fato (sem isso é dry-run)
 *   --buckets=a,b,c      lista de buckets (padrão: questao-imagens,avisos,materiais)
 *   --max=1600           dimensão máxima em px (padrão 1600)
 *   --quality=80         qualidade WebP 1-100 (padrão 80)
 *
 * A service_role key ignora RLS e permite listar/regravar tudo. Use só localmente,
 * não comite a chave.
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const APPLY = args.includes('--apply');
const BUCKETS = getArg('buckets', 'questao-imagens,avisos,materiais').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_DIM = parseInt(getArg('max', '1600'), 10);
const QUALITY = parseInt(getArg('quality', '80'), 10);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Lista recursivamente todos os arquivos de um bucket (Storage pagina em pastas). */
async function listAll(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Pastas vêm sem id/metadata; desce recursivamente.
      if (item.id === null || item.metadata == null) {
        out.push(...(await listAll(bucket, path)));
      } else {
        out.push(path);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

const fmt = (n) => (n / 1024).toFixed(1) + ' KB';

async function processBucket(bucket) {
  console.log(`\n=== Bucket: ${bucket} ===`);
  let paths;
  try {
    paths = await listAll(bucket);
  } catch (e) {
    console.error(`  (pulado) ${e.message}`);
    return { saved: 0, count: 0 };
  }

  const images = paths.filter((p) => IMAGE_EXT.test(p));
  console.log(`  ${images.length} imagem(ns) encontradas.`);

  let totalSaved = 0;
  let rewritten = 0;

  for (const path of images) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) {
      console.warn(`  ! erro ao baixar ${path}: ${error.message}`);
      continue;
    }
    const input = Buffer.from(await data.arrayBuffer());

    let output;
    try {
      output = await sharp(input, { animated: true })
        .rotate() // respeita orientação EXIF
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();
    } catch (e) {
      console.warn(`  ! erro ao comprimir ${path}: ${e.message}`);
      continue;
    }

    const gain = input.length - output.length;
    // Só vale a pena se economizar >5% e ao menos 3KB.
    if (gain <= 0 || gain < input.length * 0.05 || gain < 3072) {
      continue;
    }

    console.log(`  ${gain > 0 ? '↓' : ' '} ${path}: ${fmt(input.length)} → ${fmt(output.length)} (-${fmt(gain)})`);
    totalSaved += gain;
    rewritten++;

    if (APPLY) {
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, output, {
        upsert: true,
        contentType: 'image/webp',
        cacheControl: '3600',
      });
      if (upErr) console.warn(`  ! erro ao regravar ${path}: ${upErr.message}`);
    }
  }

  console.log(`  ${rewritten} regravável(is), economia ~${fmt(totalSaved)}.`);
  return { saved: totalSaved, count: rewritten };
}

(async () => {
  console.log(APPLY ? '>> MODO APLICAR (vai regravar)' : '>> DRY-RUN (nada será alterado — use --apply para valer)');
  console.log(`Buckets: ${BUCKETS.join(', ')} | max ${MAX_DIM}px | WebP q${QUALITY}`);

  let grandSaved = 0;
  let grandCount = 0;
  for (const b of BUCKETS) {
    const r = await processBucket(b);
    grandSaved += r.saved;
    grandCount += r.count;
  }

  console.log(`\n=== Total: ${grandCount} imagem(ns), economia estimada ~${fmt(grandSaved)} ===`);
  if (!APPLY && grandCount > 0) console.log('Rode de novo com --apply para gravar as versões comprimidas.');
})().catch((e) => {
  console.error('Falha:', e);
  process.exit(1);
});
