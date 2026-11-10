import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Executar em frontend/: node tests/screenshots/build-caderno-erros.mjs
const output = fileURLToPath(new URL('./out/caderno-erros/', import.meta.url));
await mkdir(output, { recursive: true });
const imagens = {};
for (const fase of ['antes', 'depois']) {
  imagens[fase] = {};
  for (const viewport of ['mobile', 'desktop']) {
    imagens[fase][viewport] = {};
    for (const tela of ['lista', 'refazer', 'resposta', 'worst', 'empty', 'one', 'error']) {
      const arquivo = await readFile(`${output}/${fase}/${viewport}/${tela}.png`);
      imagens[fase][viewport][tela] = `data:image/png;base64,${arquivo.toString('base64')}`;
    }
  }
}
const html = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Caderno de Erros · Antes e depois · BoraMed</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#14213a;font:15px/1.6 system-ui,sans-serif}main{max-width:1480px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.2;margin:8px 0 12px}p{color:#546278;max-width:850px}header small{font-weight:700;color:#2554dc}fieldset{border:0;padding:0;margin:0}legend,label{font-size:12px;font-weight:700;color:#526176}select{display:block;min-height:44px;max-width:100%;border:1px solid #d7dfea;border-radius:8px;padding:8px 12px;background:white;color:#14213a;font:inherit}button{font:inherit;cursor:pointer}a{color:#2554dc}.controls{display:flex;gap:20px;flex-wrap:wrap;align-items:end;padding:20px;background:white;border:1px solid #dfe5ef;border-radius:14px;margin:24px 0}.controls div{flex:1 1 180px}.controls button{border:1px solid #d7dfea;border-radius:8px;padding:9px 14px;background:#f8faff;min-height:44px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.comparison figure{margin:0;background:white;border:1px solid #dfe5ef;border-radius:14px;overflow:hidden}.comparison figcaption{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid #dfe5ef;font-weight:700}.comparison img{display:block;width:100%;height:auto}.comparison.mobile figure{max-width:460px;width:100%}.comparison.mobile{justify-items:center}.tag{font-size:11px;font-weight:600;color:#64748b}.notes{background:white;border:1px solid #dfe5ef;border-radius:14px;padding:20px;margin:24px 0}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0;padding:12px}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #2554dc;outline-offset:3px}.single .comparison{grid-template-columns:1fr}.single [data-side="antes"]{display:none}@media(max-width:650px){main{padding:20px 12px}h1{font-size:25px}.comparison{gap:10px}.comparison figcaption{padding:10px;font-size:13px}.tag{display:none}td,th{padding:8px;font-size:12px}.controls{gap:12px;padding:14px}.controls div{flex-basis:120px}}
</style>
<main><header><small>BORAMED · REVISÃO DE UI · 09 NOV 2026</small><h1>Caderno de Erros: antes e depois</h1><p>Capturas do app Angular com os mesmos dados simulados, na mesma largura e com a mesma data. O estado anterior foi renderizado de uma cópia do Git anterior às alterações. Os controles abaixo mudam as capturas, sem acessar dados de alunos.</p></header>
<div class="controls" aria-label="Configurar comparação">
<div><label for="viewport">Dispositivo</label><select id="viewport"><option value="mobile">Celular · 390px</option><option value="desktop">Desktop · 1280px</option></select></div>
<div><label for="dataset">Dados</label><select id="dataset"><option value="demo">Demo · 9 questões</option><option value="worst">Pior caso · textos longos / 1.284 questões</option><option value="empty">Vazio</option><option value="one">Uma questão</option><option value="error">Falha de carregamento</option></select></div>
<div><label for="tela">Etapa do fluxo</label><select id="tela"><option value="lista">Lista de questões</option><option value="refazer">Refazer · antes de responder</option><option value="resposta">Após resposta correta</option></select></div>
<button type="button" id="single" aria-pressed="false">Ver só o depois</button></div>
<div class="notes" id="contexto" role="status"></div>
<section class="comparison mobile" aria-label="Comparação visual">
<figure data-side="antes"><figcaption>Antes <span class="tag">Interface anterior</span></figcaption><a id="link-antes" download="caderno-erros-antes.png" title="Baixar captura em resolução original"><img id="img-antes" alt="Interface anterior do caderno de erros"></a></figure>
<figure data-side="depois"><figcaption>Depois <span class="tag">Implementado no app</span></figcaption><a id="link-depois" download="caderno-erros-depois.png" title="Baixar captura em resolução original"><img id="img-depois" alt="Nova interface do caderno de erros"></a></figure>
</section>
<section class="notes"><h2 style="font-size:18px;margin-top:0">O que mudou</h2><table><thead><tr><th>Antes</th><th>Depois</th><th>Por quê</th></tr></thead><tbody>
<tr><td>Indicadores com o mesmo peso e temas truncados</td><td>Resumo mais compacto, sem altura reservada nos rótulos, com as cores originais e destaque uniforme nos quatro valores</td><td>Equilibrar os quatro indicadores e manter os nomes legíveis</td></tr>
<tr><td>“Mostrar dominadas” trocava o conteúdo da lista</td><td>Seleção explícita: Pendentes / Dominadas</td><td>Tornar o estado previsível</td></tr>
<tr><td>Enunciados reduzidos a poucos caracteres e ações pequenas</td><td>Prévia de duas linhas, Refazer com texto e alvos de 44px</td><td>Reconhecer a questão e tocar com precisão</td></tr>
<tr><td>Refazer sem progresso da fila</td><td>Questão atual, progresso e resultado explícito</td><td>Mostrar contexto e avanço</td></tr>
<tr><td>Explicação recebida, mas não exibida</td><td>Explicação visível após a resposta</td><td>Fechar o ciclo de aprendizado</td></tr>
<tr><td>Gerador prometia aplicar todos os filtros da lista</td><td>Limites da geração explicados antes de iniciar</td><td>Evitar um simulado diferente do esperado</td></tr>
</tbody></table></section><p>Skills principais: emil-design-eng (polimento e interação), revenue-centric-design (hierarquia e próximo passo), break-ui (casos extremos). Movimento restrito ao feedback de toque e ao indicador dos accordions.</p>
</main>
<script>
const imagens=${JSON.stringify(imagens)};
const viewport=document.getElementById('viewport'),dataset=document.getElementById('dataset'),tela=document.getElementById('tela');
function render(){const vp=viewport.value,ds=dataset.value; tela.disabled=ds!=='demo';const key=ds==='demo'?tela.value:ds;document.querySelector('.comparison').classList.toggle('mobile',vp==='mobile');for(const fase of ['antes','depois']){document.getElementById('img-'+fase).src=imagens[fase][vp][key];document.getElementById('link-'+fase).href=imagens[fase][vp][key];}document.getElementById('contexto').textContent=ds==='worst'?'Pior caso: nomes extensos, palavra médica longa, contagem de 1.284 questões, grupos por disciplina e tipo, ausência de revisão de origem e paginação.':ds==='empty'?'Sem erros: o novo estado vazio oferece um caminho para continuar praticando.':ds==='error'?'Falha na lista: a tela permite tentar novamente e não oferece iniciar uma revisão com dados inválidos.':ds==='one'?'Uma questão: contagem no singular e estado de baixa densidade.':tela.value==='resposta'?'Após responder: gabarito revelado, explicação e confirmação de domínio; o progresso avança.':tela.value==='refazer'?'Antes de responder: contexto da sessão, posição na fila e gabarito ainda oculto.':'Lista: mesmo tema aberto nas duas versões, com as mesmas quatro questões.';history.replaceState(null,'','#'+[vp,ds,tela.value].join('/'));}
for(const control of [viewport,dataset,tela])control.addEventListener('change',render);document.getElementById('single').addEventListener('click',e=>{const ativo=document.body.classList.toggle('single');e.currentTarget.setAttribute('aria-pressed',String(ativo));e.currentTarget.textContent=ativo?'Comparar antes e depois':'Ver só o depois';});const hash=location.hash.slice(1).split('/');if(['mobile','desktop'].includes(hash[0]))viewport.value=hash[0];if(['demo','worst','empty','one','error'].includes(hash[1]))dataset.value=hash[1];if(['lista','refazer','resposta'].includes(hash[2]))tela.value=hash[2];render();
</script></html>`;
await writeFile(`${output}/comparacao.html`, html);

// Montagem independente para compartilhar o antes/depois sem abrir o HTML.
const width = 390;
const panels = await Promise.all(
  ['antes', 'depois'].map(async (fase) => {
    const image = await sharp(`${output}/${fase}/mobile/lista.png`)
      .resize({ width })
      .png()
      .toBuffer();
    return { image, height: (await sharp(image).metadata()).height };
  }),
);
const height = Math.max(...panels.map((p) => p.height)) + 52;
const label = (text) =>
  Buffer.from(
    `<svg width="390" height="44"><rect width="390" height="44" fill="white"/><text x="16" y="29" fill="#1e3a8a" font-family="sans-serif" font-size="16" font-weight="bold">${text}</text></svg>`,
  );
await sharp({ create: { width: 812, height, channels: 3, background: '#ffffff' } })
  .composite([
    { input: label('ANTES'), left: 8, top: 0 },
    { input: label('DEPOIS'), left: 414, top: 0 },
    { input: panels[0].image, left: 8, top: 44 },
    { input: panels[1].image, left: 414, top: 44 },
  ])
  .png()
  .toFile(`${output}/comparacao-mobile.png`);
console.log(`Comparação: ${output}/comparacao.html`);
