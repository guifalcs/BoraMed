#!/usr/bin/env node
/**
 * FASE 3 — Tela de revisão humana.
 *
 * Gera `revisao.html` no diretório de trabalho: auto-contido, abre no
 * navegador via file://, mostra o scan da página à esquerda (posicionado na
 * questão) e a transcrição editável à direita, com as flags do validador e a
 * versão do passe 2 para comparar.
 *
 * As imagens são referenciadas por caminho relativo — o HTML fica leve e é o
 * mesmo diretório de `paginas/`.
 *
 * Uso: node scripts/importar-prova-scan/revisao.mjs <dir-trabalho>
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerJson } from './lib/pdf.mjs';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('uso: node revisao.mjs <dir-trabalho>');
  process.exit(2);
}
const dir = resolve(dirArg);

const validacao = lerJson(join(dir, 'validacao.json'));
const manifesto = lerJson(join(dir, 'manifesto.json'));
const indicePaginas = lerJson(join(dir, 'paginas', 'index.json'));
if (!validacao || !manifesto || !indicePaginas) {
  console.error(`faltam validacao.json/manifesto.json em ${dir} — rode validar.mjs primeiro`);
  process.exit(2);
}

const paginaPorNumero = new Map(indicePaginas.map((p) => [p.pagina_pdf, p]));

// Só o necessário para a tela — evita um HTML gigante com a devolutiva inteira.
const dados = validacao.questoes.map((q) => ({
  numero: q.numero,
  letra_oficial: q.letra_oficial,
  letra_folha: q.letra_folha ?? null,
  gabarito_origem: q.gabarito_origem ?? 'folha',
  paginas: q.paginas ?? [],
  arquivos: (q.paginas ?? []).map((p) => paginaPorNumero.get(p)?.arquivo).filter(Boolean),
  posicao_topo_pct: q.posicao_topo_pct,
  enunciado: q.enunciado ?? '',
  enunciado_apoio: q.enunciado_apoio ?? '',
  alternativas: q.alternativas ?? {},
  passe2: q.enunciado_passe2
    ? { ...q.enunciado_passe2, alternativas: q.alternativas_passe2 ?? {} }
    : null,
  flags: q.flags ?? [],
  severidade_max: q.severidade_max,
  cruzamento: q.cruzamento ?? null,
  tem_imagem: q.tem_imagem ?? false,
  explicacao: q.explicacao ?? '',
  referencia: q.referencia ?? '',
}));

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Revisão — ${escapar(manifesto.pdf)}</title>
<style>
  :root {
    --bg: #0f1115; --painel: #171a21; --borda: #272c37; --txt: #e6e8ee;
    --fraco: #99a0b0; --alta: #ff5c5c; --media: #ffb340; --baixa: #5c9dff;
    --ok: #3ddc97;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--txt); }
  header {
    position: sticky; top: 0; z-index: 10; background: var(--painel);
    border-bottom: 1px solid var(--borda); padding: 10px 16px;
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
  }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  .pill { font-size: 12px; padding: 2px 8px; border-radius: 99px; border: 1px solid var(--borda); color: var(--fraco); }
  .pill.alta { color: var(--alta); border-color: var(--alta); }
  .pill.media { color: var(--media); border-color: var(--media); }
  .pill.baixa { color: var(--baixa); border-color: var(--baixa); }
  .pill.ok { color: var(--ok); border-color: var(--ok); }
  button, select {
    background: #21262f; color: var(--txt); border: 1px solid var(--borda);
    border-radius: 6px; padding: 6px 10px; font: inherit; cursor: pointer;
  }
  button:hover { background: #2a303b; }
  button.primario { background: #2f6feb; border-color: #2f6feb; }
  button.primario:hover { background: #3b7bf5; }
  #lista { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .questao {
    border: 1px solid var(--borda); border-radius: 10px; background: var(--painel);
    display: grid; grid-template-columns: minmax(320px, 44%) 1fr; overflow: hidden;
  }
  .questao.rev { border-color: var(--ok); }
  .scan { border-right: 1px solid var(--borda); background: #000; position: relative; }
  .scan-viewport { height: 620px; overflow: auto; }
  .scan img { width: 100%; display: block; }
  .scan-barra {
    position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 8px;
    background: rgba(0,0,0,.7); font-size: 12px; color: var(--fraco);
    display: flex; gap: 8px; align-items: center;
  }
  .corpo { padding: 14px 16px; min-width: 0; }
  .cabeca { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .cabeca h2 { font-size: 16px; margin: 0; }
  .gab {
    font-weight: 700; background: #2f6feb22; border: 1px solid #2f6feb;
    color: #8ab4ff; padding: 1px 9px; border-radius: 6px; font-size: 13px;
  }
  .flags { margin: 0 0 12px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .flags li { font-size: 12.5px; padding: 6px 9px; border-radius: 6px; border-left: 3px solid var(--borda); background: #1d222b; }
  .flags li.alta { border-left-color: var(--alta); }
  .flags li.media { border-left-color: var(--media); }
  .flags li.baixa { border-left-color: var(--baixa); }
  .flags code { color: #ffd479; font-size: 12px; }
  label.campo { display: block; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--fraco); margin: 10px 0 3px; }
  textarea {
    width: 100%; background: #12151b; color: var(--txt); border: 1px solid var(--borda);
    border-radius: 6px; padding: 8px; font: inherit; resize: vertical;
  }
  textarea:focus { outline: none; border-color: #2f6feb; }
  .alt { display: grid; grid-template-columns: 26px 1fr; gap: 8px; align-items: start; margin-bottom: 6px; }
  .alt .letra { font-weight: 700; text-align: right; padding-top: 8px; color: var(--fraco); }
  .alt.correta .letra { color: #8ab4ff; }
  .alt textarea { min-height: 46px; }
  .alt.correta textarea { border-color: #2f6feb66; }
  .sim { font-size: 11px; color: var(--fraco); padding-top: 8px; }
  details.p2 { margin-top: 12px; border: 1px dashed var(--borda); border-radius: 6px; padding: 8px 10px; }
  details.p2 summary { cursor: pointer; color: var(--fraco); font-size: 12px; }
  details.p2 pre { white-space: pre-wrap; word-break: break-word; font-size: 12.5px; color: #cfd4de; margin: 8px 0 0; }
  .acoes { margin-top: 14px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .vazio { padding: 40px; text-align: center; color: var(--fraco); }
  @media (max-width: 980px) { .questao { grid-template-columns: 1fr; } .scan { border-right: 0; border-bottom: 1px solid var(--borda); } }
</style>
</head>
<body>
<header>
  <h1>Revisão — ${escapar(manifesto.pdf)}</h1>
  <span class="pill" id="contador"></span>
  <select id="filtro">
    <option value="pendentes">Pendentes de revisão</option>
    <option value="alta">Só flag alta</option>
    <option value="media">Alta + média</option>
    <option value="todas">Todas as questões</option>
    <option value="revisadas">Já revisadas</option>
  </select>
  <button id="baixar" class="primario">Baixar questoes-revisadas.json</button>
  <span class="pill" id="salvo">rascunho salvo no navegador</span>
</header>
<div id="lista"></div>

<script>
const QUESTOES = ${JSON.stringify(dados)};
const CHAVE = 'revisao:${escapar(manifesto.pdf)}';
const LETRAS = ['a','b','c','d','e'];

let estado = {};
try { estado = JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { estado = {}; }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function editado(n) {
  return estado[n] ?? null;
}
function valor(q, campo) {
  const e = editado(q.numero);
  if (e && e[campo] !== undefined) return e[campo];
  return q[campo] ?? '';
}
function valorAlt(q, letra) {
  const e = editado(q.numero);
  if (e && e.alternativas && e.alternativas[letra] !== undefined) return e.alternativas[letra];
  return q.alternativas[letra] ?? '';
}
function revisado(q) {
  return Boolean(editado(q.numero)?.revisado);
}

function persistir() {
  localStorage.setItem(CHAVE, JSON.stringify(estado));
  const el = document.getElementById('salvo');
  el.textContent = 'rascunho salvo ' + new Date().toLocaleTimeString('pt-BR');
  el.className = 'pill ok';
}

function mutar(numero, fn) {
  estado[numero] = estado[numero] ?? { alternativas: {} };
  estado[numero].alternativas = estado[numero].alternativas ?? {};
  fn(estado[numero]);
  persistir();
}

function filtrar() {
  const modo = document.getElementById('filtro').value;
  return QUESTOES.filter((q) => {
    const rev = revisado(q);
    if (modo === 'revisadas') return rev;
    if (modo === 'pendentes') return !rev && q.flags.length > 0;
    if (modo === 'alta') return q.severidade_max === 'alta';
    if (modo === 'media') return q.severidade_max === 'alta' || q.severidade_max === 'media';
    return true;
  });
}

function simDe(q, letra) {
  if (!q.cruzamento) return '';
  if (q.letra_oficial && letra === q.letra_oficial.toLowerCase()) {
    const s = q.cruzamento.correta?.sim_comentario;
    return s === undefined || s === null ? '' : 'comentário ' + s;
  }
  const s = q.cruzamento.distratores?.[letra];
  return s === undefined || s === null ? '' : 'distrator ' + s;
}

function render() {
  const lista = document.getElementById('lista');
  const alvo = filtrar();
  document.getElementById('contador').textContent =
    alvo.length + ' de ' + QUESTOES.length + ' • ' +
    QUESTOES.filter(revisado).length + ' revisadas';

  if (alvo.length === 0) {
    lista.innerHTML = '<div class="vazio">Nada aqui com esse filtro.</div>';
    return;
  }

  lista.innerHTML = alvo.map((q) => {
    const gab = (q.letra_oficial || '').toLowerCase();
    const arquivo = q.arquivos[0] || '';
    const flags = q.flags.map((f) =>
      '<li class="' + f.severidade + '"><code>' + esc(f.codigo) + '</code> — ' + esc(f.detalhe) + '</li>'
    ).join('');

    const alts = LETRAS.map((l) => {
      const existe = q.alternativas[l] !== undefined || valorAlt(q, l);
      if (!existe && l !== gab) return '';
      const cls = l === gab ? 'alt correta' : 'alt';
      return '<div class="' + cls + '">' +
        '<div class="letra">' + l.toUpperCase() + '</div>' +
        '<div><textarea data-n="' + q.numero + '" data-alt="' + l + '" rows="2">' +
          esc(valorAlt(q, l)) + '</textarea>' +
          '<div class="sim">' + esc(simDe(q, l)) + '</div></div>' +
        '</div>';
    }).join('');

    const p2 = q.passe2 ? '<details class="p2"><summary>Comparar com o passe 2 (transcrição independente)</summary><pre>' +
      'APOIO: ' + esc(q.passe2.enunciado_apoio) + '\\n\\nPERGUNTA: ' + esc(q.passe2.enunciado) + '\\n\\n' +
      LETRAS.filter((l) => q.passe2.alternativas[l]).map((l) => l.toUpperCase() + ') ' + esc(q.passe2.alternativas[l])).join('\\n') +
      '</pre></details>' : '';

    return '<article class="questao' + (revisado(q) ? ' rev' : '') + '" id="q' + q.numero + '">' +
      '<div class="scan"><div class="scan-viewport" data-topo="' + (q.posicao_topo_pct ?? 0) + '">' +
        (arquivo ? '<img src="' + esc(arquivo) + '" alt="scan p' + q.paginas[0] + '" loading="lazy">' : '<div class="vazio">sem scan</div>') +
        (q.arquivos[1] ? '<img src="' + esc(q.arquivos[1]) + '" alt="scan continuação" loading="lazy">' : '') +
      '</div><div class="scan-barra">' +
        'páginas ' + q.paginas.join(', ') +
        '<button data-zoom="' + q.numero + '">abrir em nova aba</button>' +
      '</div></div>' +
      '<div class="corpo">' +
        '<div class="cabeca"><h2>Questão ' + q.numero + '</h2>' +
          '<span class="gab">gabarito ' + esc((q.letra_oficial || '?').toUpperCase()) +
            (q.gabarito_origem !== 'folha' ? ' · da devolutiva' : '') + '</span>' +
          (q.letra_folha && q.letra_folha !== q.letra_oficial
            ? '<span class="pill media">folha dizia ' + esc(q.letra_folha) + '</span>' : '') +
          (q.severidade_max ? '<span class="pill ' + q.severidade_max + '">' + q.severidade_max + '</span>' : '<span class="pill ok">sem flag</span>') +
          (q.tem_imagem ? '<span class="pill media">tem figura</span>' : '') +
        '</div>' +
        (flags ? '<ul class="flags">' + flags + '</ul>' : '') +
        '<label class="campo">Texto de apoio / caso clínico</label>' +
        '<textarea data-n="' + q.numero + '" data-campo="enunciado_apoio" rows="5">' + esc(valor(q, 'enunciado_apoio')) + '</textarea>' +
        '<label class="campo">Pergunta final</label>' +
        '<textarea data-n="' + q.numero + '" data-campo="enunciado" rows="3">' + esc(valor(q, 'enunciado')) + '</textarea>' +
        '<label class="campo">Alternativas</label>' + alts +
        p2 +
        '<div class="acoes">' +
          '<button class="primario" data-ok="' + q.numero + '">' + (revisado(q) ? 'Revisado ✓' : 'Marcar como revisado') + '</button>' +
          '<button data-reset="' + q.numero + '">Descartar minhas edições</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');

  // Posiciona cada scan na altura em que a questão começa.
  for (const vp of lista.querySelectorAll('.scan-viewport')) {
    const topo = Number(vp.dataset.topo || 0);
    const img = vp.querySelector('img');
    if (!img || !topo) continue;
    const ajustar = () => { vp.scrollTop = Math.max(0, (img.naturalHeight * (topo / 100)) * (img.clientWidth / img.naturalWidth) - 24); };
    img.complete ? ajustar() : img.addEventListener('load', ajustar, { once: true });
  }
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.tagName !== 'TEXTAREA') return;
  const n = t.dataset.n;
  if (!n) return;
  if (t.dataset.alt) mutar(n, (s) => { s.alternativas[t.dataset.alt] = t.value; });
  else if (t.dataset.campo) mutar(n, (s) => { s[t.dataset.campo] = t.value; });
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ok) {
    const n = b.dataset.ok;
    const atual = Boolean(estado[n]?.revisado);
    mutar(n, (s) => { s.revisado = !atual; });
    render();
    document.getElementById('q' + n)?.scrollIntoView({ block: 'center' });
  }
  if (b.dataset.reset) {
    delete estado[b.dataset.reset];
    persistir();
    render();
  }
  if (b.dataset.zoom) {
    const q = QUESTOES.find((x) => String(x.numero) === b.dataset.zoom);
    if (q?.arquivos[0]) window.open(q.arquivos[0], '_blank');
  }
});

document.getElementById('filtro').addEventListener('change', render);

document.getElementById('baixar').addEventListener('click', () => {
  // Só o que foi realmente tocado — gerar.mjs faz merge campo a campo.
  const saida = {};
  for (const [n, v] of Object.entries(estado)) {
    const limpo = {};
    for (const k of ['enunciado', 'enunciado_apoio', 'revisado']) {
      if (v[k] !== undefined) limpo[k] = v[k];
    }
    if (v.alternativas && Object.keys(v.alternativas).length > 0) limpo.alternativas = v.alternativas;
    if (Object.keys(limpo).length > 0) saida[n] = limpo;
  }
  const blob = new Blob([JSON.stringify(saida, null, 2) + '\\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'questoes-revisadas.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

render();
</script>
</body>
</html>
`;

writeFileSync(join(dir, 'revisao.html'), html, 'utf-8');

const alta = validacao.questoes.filter((q) => q.severidade_max === 'alta').length;
const media = validacao.questoes.filter((q) => q.severidade_max === 'media').length;
console.log(`revisao.html gerado — ${validacao.questoes.length} questões (${alta} com flag alta, ${media} com média)`);
console.log(`\nabra:  file://${join(dir, 'revisao.html')}`);
console.log('\nfluxo: corrija → "Marcar como revisado" → "Baixar questoes-revisadas.json"');
console.log(`salve o arquivo baixado em ${dir}/questoes-revisadas.json e rode gerar.mjs`);

function escapar(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
