import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = fileURLToPath(new URL('./out/historico/', import.meta.url));
await mkdir(output, { recursive: true });
const imagens = {};
for (const fase of ['antes', 'depois']) {
  imagens[fase] = {};
  for (const viewport of ['mobile', 'desktop']) {
    imagens[fase][viewport] = {};
    for (const scenario of ['demo', 'worst', 'empty', 'one', 'error', 'partial']) {
      const png = await readFile(`${output}/${fase}/${viewport}/${scenario}.png`);
      imagens[fase][viewport][scenario] = `data:image/png;base64,${png.toString('base64')}`;
    }
  }
}
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Histórico · Antes e depois · BoraMed</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#0f172a;font:15px/1.6 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.2}h2{font-size:18px}p{color:#475569;max-width:850px}.controls{display:flex;gap:20px;flex-wrap:wrap;align-items:end;background:white;border:1px solid #e2e8f0;padding:20px;border-radius:12px;margin:24px 0}.controls label{flex:1 1 180px;font-size:12px;font-weight:600}select,button{font:inherit;min-height:44px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#0f172a;cursor:pointer}select{display:block;width:100%;font-size:14px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.comparison figure{margin:0;background:white;border:1px solid #dfe5ef;border-radius:12px;overflow:hidden}.comparison figcaption{font-weight:700;padding:12px 18px;border-bottom:1px solid #e2e8f0}.comparison img{width:100%;display:block;height:auto}.comparison.mobile figure{width:100%;max-width:460px}.comparison.mobile{justify-items:center}.single .comparison{grid-template-columns:1fr}.single [data-fase=antes]{display:none}.notes{padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:white;margin:24px 0}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top}:focus-visible{outline:3px solid #2554dc;outline-offset:3px}@media(max-width:650px){main{padding:20px 12px}.comparison{gap:10px}td,th{font-size:12px;padding:8px}h1{font-size:24px}}</style>
<main><small>BORAMED · REVISÃO DE UI · 09 NOV 2026</small><h1>Histórico: entender, filtrar e revisar</h1><p>Capturas do app Angular com os mesmos dados simulados e a mesma data nas duas versões. A navegação fixa e o suporte foram ocultados apenas nos prints de página inteira. Nenhum dado de aluno é usado.</p>
<div class="controls"><label>Dispositivo<select id="viewport"><option value="mobile">Celular · 390px</option><option value="desktop">Desktop · 1280px</option></select></label><label>Dados<select id="scenario"><option value="demo">Demo · 6 tentativas</option><option value="worst">Pior caso · nomes longos e 50 tentativas</option><option value="empty">Histórico vazio</option><option value="one">Uma tentativa</option><option value="error">Falha total</option><option value="partial">Falha só nas tentativas</option></select></label><button id="single" aria-pressed="false">Ver só o depois</button></div>
<p id="context" role="status"></p><section class="comparison mobile" aria-label="Comparação visual"><figure data-fase="antes"><figcaption>Antes</figcaption><a id="download-antes" download="historico-antes.png"><img id="img-antes" alt="Histórico antes da melhoria"></a></figure><figure data-fase="depois"><figcaption>Depois · implementado</figcaption><a id="download-depois" download="historico-depois.png"><img id="img-depois" alt="Histórico depois da melhoria"></a></figure></section>
<div class="notes"><h2>O que mudou</h2><table><thead><tr><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead><tbody><tr><td>Indicadores sem contexto no celular</td><td>Acerto geral com fundo azul preenchido; demais cards com cores semânticas e contexto visível</td><td>Entender os números de relance</td></tr><tr><td>Recomendação depois dos gráficos</td><td>Próximo foco junto do resumo</td><td>Transformar desempenho em um próximo passo</td></tr><tr><td>Filtros pequenos e de escopo implícito</td><td>Campos de 44px e escopo explícito</td><td>Distinguir dados acumulados do recorte selecionado</td></tr><tr><td>Tabela larga no celular</td><td>Lista com títulos completos, nota, acertos e resultado</td><td>Consultar sem rolagem horizontal</td></tr><tr><td>Falha parcial parecia primeiro uso</td><td>Indicadores preservados e mensagem de erro específica</td><td>Não confundir indisponibilidade com ausência de dados</td></tr><tr><td>Falha ao favoritar era silenciosa</td><td>Reversão, mensagem e bloqueio durante envio</td><td>Confirmar se a escolha foi salva</td></tr></tbody></table><p>Skills aplicadas: emil-design-eng, revenue-centric-design e break-ui. O texto de variação compara só a primeira e a última nota do recorte, sem inferir tendência estatística. A consulta continua limitada às 50 tentativas mais recentes.</p></div></main>
<script>const imagens=${JSON.stringify(imagens)};const viewport=document.getElementById('viewport'),scenario=document.getElementById('scenario');const contextos={demo:'Os mesmos 6 simulados nas duas versões.',worst:'Nomes extensos, 1.284 simulados no indicador, 50 tentativas disponíveis, notas 0/100/ausente e prova removida com resultado preservado.',empty:'Primeiro uso: um único estado vazio com caminho para iniciar.',one:'Uma tentativa: o gráfico mostra um ponto, sem inventar tendência.',error:'Falha total: mensagens de erro e opção de tentar novamente.',partial:'Falha parcial: indicadores e temas disponíveis continuam visíveis.'};function render(){for(const fase of ['antes','depois']){const src=imagens[fase][viewport.value][scenario.value];document.getElementById('img-'+fase).src=src;document.getElementById('download-'+fase).href=src;}document.querySelector('.comparison').classList.toggle('mobile',viewport.value==='mobile');document.getElementById('context').textContent=contextos[scenario.value];history.replaceState(null,'','#'+viewport.value+'/'+scenario.value);}viewport.addEventListener('change',render);scenario.addEventListener('change',render);document.getElementById('single').addEventListener('click',e=>{const ativo=document.body.classList.toggle('single');e.currentTarget.setAttribute('aria-pressed',String(ativo));e.currentTarget.textContent=ativo?'Comparar antes e depois':'Ver só o depois';});const hash=location.hash.slice(1).split('/');if(['mobile','desktop'].includes(hash[0]))viewport.value=hash[0];if(Object.keys(contextos).includes(hash[1]))scenario.value=hash[1];render();</script></html>`;
await writeFile(`${output}/comparacao.html`, html);
for (const viewport of ['mobile', 'desktop']) {
  const width = viewport === 'mobile' ? 390 : 900;
  const panels = await Promise.all(
    ['antes', 'depois'].map(async (fase) => {
      const image = await sharp(`${output}/${fase}/${viewport}/demo.png`)
        .resize({ width })
        .png()
        .toBuffer();
      return { image, height: (await sharp(image).metadata()).height };
    }),
  );
  const label = (text) =>
    Buffer.from(
      `<svg width="${width}" height="44"><rect width="100%" height="44" fill="white"/><text x="16" y="29" fill="#1e40af" font-family="sans-serif" font-size="18" font-weight="bold">${text}</text></svg>`,
    );
  await sharp({
    create: {
      width: width * 2 + 24,
      height: Math.max(...panels.map((p) => p.height)) + 52,
      channels: 3,
      background: '#f1f5f9',
    },
  })
    .composite([
      { input: label('ANTES'), left: 8, top: 0 },
      { input: label('DEPOIS'), left: width + 16, top: 0 },
      { input: panels[0].image, left: 8, top: 44 },
      { input: panels[1].image, left: width + 16, top: 44 },
    ])
    .png()
    .toFile(`${output}/comparacao-${viewport}.png`);
}
console.log(`Comparação: ${output}/comparacao.html`);
