#!/usr/bin/env -S deno run --allow-net --allow-env
// Auditoria das correções da Aurora (questões de resposta aberta).
//
// O que faz:
//   1. Puxa do Supabase as correções com status 'corrigida' (join com a resposta
//      do aluno e a questão: enunciado, resposta modelo, pontos-chave).
//   2. Separa respostas SÉRIAS de lixo (vazia, curta demais, cópia do enunciado,
//      texto sem palavras reais) — só as sérias entram nas estatísticas.
//   3. Calcula média/mediana/distribuição de pontos das sérias (total, por modelo
//      e por questão), além de zeros suspeitos e notas cheias.
//   4. Opcional (--judge N): re-corrige uma amostra com um segundo modelo via
//      OpenRouter (LLM-as-judge) e reporta a divergência de nota vs a Aurora.
//
// Uso:
//   export SUPABASE_URL=https://<ref>.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=...
//   export OPENROUTER_API_KEY=sk-or-v1-...        # só p/ --judge
//   deno run --allow-net --allow-env scripts/auditar-correcoes-aurora.ts \
//     --dias 30 --judge 25 --json relatorio.json

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i++) {
  const a = Deno.args[i];
  if (a.startsWith('--')) args.set(a.slice(2), Deno.args[i + 1] ?? 'true');
}
const DIAS = Number(args.get('dias') ?? 30);
const JUDGE_N = Number(args.get('judge') ?? 0);
const JUDGE_MODEL = args.get('judge-modelo') ?? 'anthropic/claude-sonnet-4.5';
const OUT_JSON = args.get('json');
const LIMIT = Number(args.get('limite') ?? 2000);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('faltou SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  Deno.exit(1);
}

async function rest(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return await res.json();
}

const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();

// --- 1. carga ---------------------------------------------------------------
const select = [
  'id,status,pontos,feedback,pontos_atendidos,pontos_faltantes,erros,modelo,provider',
  'tokens_prompt,tokens_resposta,num_tentativas,criado_em',
  'tentativa_resposta!inner(id,resposta_texto,questao_id,questao!inner(id,enunciado,resposta_modelo,pontos_chave,criterios_correcao))',
].join(',');

const rows = await rest(
  `resposta_correcao?select=${encodeURIComponent(select)}&criado_em=gte.${desde}` +
    `&order=criado_em.desc&limit=${LIMIT}`,
);

// --- 2. classificação séria x lixo -----------------------------------------
function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function tokens(t: string) {
  return normalizar(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
}
function classificar(resposta: string, enunciado: string) {
  const txt = (resposta ?? '').trim();
  if (!txt) return 'vazia';
  const palavras = tokens(txt);
  if (palavras.length < 5) return 'curta';                       // < 5 palavras úteis
  if (/^(.)\1{5,}$/.test(normalizar(txt).replace(/ /g, ''))) return 'lixo'; // "aaaaaa"
  const enun = new Set(tokens(enunciado));
  const sobrepos = palavras.filter((p) => enun.has(p)).length / palavras.length;
  if (sobrepos > 0.85) return 'copia_enunciado';
  const unicos = new Set(palavras).size / palavras.length;
  if (unicos < 0.25) return 'lixo';                              // repetição de palavra
  return 'seria';
}

interface Item {
  id: string;
  pontos: number;
  modelo: string;
  questao_id: string;
  enunciado: string;
  resposta_modelo: string;
  pontos_chave: unknown;
  criterios: string | null;
  resposta_aluno: string;
  feedback: string;
  classe: string;
  chars: number;
}

const itens: Item[] = rows.map((r: any) => {
  const tr = r.tentativa_resposta;
  const q = tr.questao;
  const resposta = String(tr.resposta_texto ?? '');
  return {
    id: r.id,
    pontos: r.pontos,
    modelo: r.modelo ?? '(sem modelo)',
    questao_id: q.id,
    enunciado: q.enunciado ?? '',
    resposta_modelo: q.resposta_modelo ?? '',
    pontos_chave: q.pontos_chave ?? [],
    criterios: q.criterios_correcao ?? null,
    resposta_aluno: resposta,
    feedback: r.feedback ?? '',
    classe: classificar(resposta, q.enunciado ?? ''),
    chars: resposta.length,
  };
}).filter((i: Item) => typeof i.pontos === 'number');

const serias = itens.filter((i) => i.classe === 'seria');
const lixo = itens.filter((i) => i.classe !== 'seria');

// --- 3. estatísticas --------------------------------------------------------
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const faixas = (xs: number[]) => {
  const b = { '0': 0, '1-40': 0, '41-60': 0, '61-80': 0, '81-99': 0, '100': 0 } as Record<string, number>;
  for (const p of xs) {
    if (p === 0) b['0']++;
    else if (p <= 40) b['1-40']++;
    else if (p <= 60) b['41-60']++;
    else if (p <= 80) b['61-80']++;
    else if (p < 100) b['81-99']++;
    else b['100']++;
  }
  return b;
};

const ptsSerias = serias.map((i) => i.pontos);
const porModelo: Record<string, number[]> = {};
for (const i of serias) (porModelo[i.modelo] ??= []).push(i.pontos);

const porQuestao = Object.entries(
  serias.reduce((acc: Record<string, number[]>, i) => {
    (acc[i.questao_id] ??= []).push(i.pontos);
    return acc;
  }, {}),
).map(([qid, ps]) => ({ questao_id: qid, n: ps.length, media: +media(ps).toFixed(1) }))
  .filter((q) => q.n >= 3)
  .sort((a, b) => a.media - b.media);

console.log(`\n=== Correções da Aurora — últimos ${DIAS} dias ===`);
console.log(`total corrigidas: ${itens.length} | sérias: ${serias.length} | descartadas: ${lixo.length}`);
console.log(`descartes:`, Object.entries(
  lixo.reduce((a: Record<string, number>, i) => ((a[i.classe] = (a[i.classe] ?? 0) + 1), a), {}),
));
console.log(`\nMÉDIA (sérias): ${media(ptsSerias).toFixed(1)} | mediana: ${mediana(ptsSerias)}`);
console.log(`média incluindo lixo: ${media(itens.map((i) => i.pontos)).toFixed(1)}`);
console.log(`distribuição (sérias):`, faixas(ptsSerias));
console.log(`\npor modelo:`);
for (const [m, ps] of Object.entries(porModelo)) {
  console.log(`  ${m}: n=${ps.length} media=${media(ps).toFixed(1)} mediana=${mediana(ps)}`);
}
console.log(`\n5 questões com média mais baixa (n>=3):`);
for (const q of porQuestao.slice(0, 5)) console.log(`  ${q.questao_id} n=${q.n} media=${q.media}`);

// sinais de correção suspeita
const zeroLongo = serias.filter((i) => i.pontos === 0 && i.chars > 200);
const cemCurto = serias.filter((i) => i.pontos === 100 && i.chars < 120);
const feedbackCurto = serias.filter((i) => i.feedback.length < 60);
console.log(`\nsuspeitas: zero em resposta longa=${zeroLongo.length} | 100 em resposta curta=${cemCurto.length} | feedback <60 chars=${feedbackCurto.length}`);

// --- 4. LLM-as-judge (opcional) --------------------------------------------
let judge: any[] = [];
if (JUDGE_N > 0) {
  const KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!KEY) {
    console.error('\n--judge pedido mas OPENROUTER_API_KEY não está setada');
  } else {
    // amostra estratificada: pega extremos + meio
    const ord = [...serias].sort((a, b) => a.pontos - b.pontos);
    const passo = Math.max(1, Math.floor(ord.length / JUDGE_N));
    const amostra = ord.filter((_, idx) => idx % passo === 0).slice(0, JUDGE_N);

    for (const i of amostra) {
      const body = {
        model: JUDGE_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'Você é auditor de correção de provas discursivas de medicina.',
              'Receberá o enunciado, a resposta modelo, os pontos-chave, a resposta do aluno',
              'e a nota+feedback dados por um corretor automático.',
              'Dê sua própria nota 0-100 e avalie a correção do corretor.',
              'Responda SÓ JSON: {"nota_auditor": <0-100>, "nota_justa": true|false,',
              '"problema": "<severidade: nenhum|leve|grave>", "comentario": "<1-2 frases>",',
              '"feedback_util": true|false}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `ENUNCIADO:\n${i.enunciado}`,
              `RESPOSTA MODELO:\n${i.resposta_modelo}`,
              `PONTOS-CHAVE:\n${JSON.stringify(i.pontos_chave)}`,
              i.criterios ? `CRITÉRIOS:\n${i.criterios}` : '',
              `RESPOSTA DO ALUNO:\n${i.resposta_aluno.slice(0, 3000)}`,
              `NOTA DO CORRETOR: ${i.pontos}`,
              `FEEDBACK DO CORRETOR: ${i.feedback}`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
      };
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error(`judge ${i.id}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      try {
        const v = JSON.parse(data.choices[0].message.content);
        judge.push({ id: i.id, aurora: i.pontos, ...v, delta: v.nota_auditor - i.pontos });
      } catch {
        console.error(`judge ${i.id}: JSON inválido`);
      }
    }

    const deltas = judge.map((j) => j.delta);
    const absDeltas = deltas.map(Math.abs);
    console.log(`\n=== Auditoria por 2º modelo (${JUDGE_MODEL}, n=${judge.length}) ===`);
    console.log(`viés médio (auditor - aurora): ${media(deltas).toFixed(1)} pts`);
    console.log(`erro absoluto médio: ${media(absDeltas).toFixed(1)} pts`);
    console.log(`divergência >20 pts: ${absDeltas.filter((d) => d > 20).length}/${judge.length}`);
    console.log(`notas julgadas injustas: ${judge.filter((j) => j.nota_justa === false).length}`);
    console.log(`problemas graves: ${judge.filter((j) => j.problema === 'grave').length}`);
    console.log(`feedback considerado inútil: ${judge.filter((j) => j.feedback_util === false).length}`);
    console.log(`\npiores divergências:`);
    for (const j of [...judge].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)) {
      console.log(`  ${j.id} aurora=${j.aurora} auditor=${j.nota_auditor} (${j.problema}) ${j.comentario}`);
    }
  }
}

if (OUT_JSON) {
  await Deno.writeTextFile(
    OUT_JSON,
    JSON.stringify({ resumo: {
      dias: DIAS, total: itens.length, serias: serias.length, descartadas: lixo.length,
      media_serias: +media(ptsSerias).toFixed(2), mediana_serias: mediana(ptsSerias),
      distribuicao: faixas(ptsSerias), por_modelo: Object.fromEntries(
        Object.entries(porModelo).map(([m, ps]) => [m, { n: ps.length, media: +media(ps).toFixed(2) }]),
      ),
    }, por_questao: porQuestao, judge }, null, 2),
  );
  console.log(`\njson -> ${OUT_JSON}`);
}
