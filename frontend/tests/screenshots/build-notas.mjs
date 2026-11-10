import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = fileURLToPath(new URL('./out/notas/', import.meta.url));
await mkdir(output, { recursive: true });
const scenarios = {
  demo: 'Notas parciais',
  empty: 'Nenhuma nota lançada',
  risk: 'Atenção na teoria',
  approved: 'Meta da teoria atingida',
  single: 'Dimensão única',
  worst: 'Nomes extensos e nota zero',
  unsupported: 'Período indisponível',
  'no-period': 'Período não cadastrado',
  error: 'Falha de carregamento',
};
const imagens = {};
for (const fase of ['antes', 'depois']) {
  imagens[fase] = {};
  for (const viewport of ['mobile', 'desktop']) {
    imagens[fase][viewport] = {};
    for (const scenario of Object.keys(scenarios)) {
      const arquivo = await readFile(`${output}/${fase}/${viewport}/${scenario}.png`);
      imagens[fase][viewport][scenario] = `data:image/png;base64,${arquivo.toString('base64')}`;
    }
  }
}
const html = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Minhas notas · Antes e depois · BoraMed</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:15px/1.6 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.2;margin:8px 0 12px}h2{font-size:18px}p{color:#475569;max-width:900px}small{color:#2554dc;font-weight:700}a{color:#2554dc}label{font-size:12px;font-weight:700;color:#475569}select,button{min-height:44px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:white;color:#0f172a;font:inherit}select{display:block;width:100%;margin-top:4px}button{cursor:pointer}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:end;padding:18px;background:white;border:1px solid #e2e8f0;border-radius:14px;margin:24px 0}.controls div{flex:1 1 180px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.comparison figure{margin:0;min-width:0;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.comparison figcaption{padding:12px 18px;border-bottom:1px solid #e2e8f0;font-weight:700}.comparison img{display:block;width:100%;height:auto}.comparison.mobile{justify-items:center}.comparison.mobile figure{max-width:460px;width:100%}.notes{padding:20px;margin:24px 0;border:1px solid #e2e8f0;border-radius:14px;background:white}.notes h2{margin-top:0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0;padding:12px}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #2554dc;outline-offset:3px}.single .comparison{grid-template-columns:1fr}.single [data-side="antes"]{display:none}@media(max-width:650px){main{padding:20px 12px}h1{font-size:25px}.controls{gap:12px;padding:14px}.comparison{gap:10px}.comparison figcaption{padding:10px;font-size:13px}th,td{padding:8px;font-size:12px}}
</style>
<main><header><small>BORAMED · MINHAS NOTAS · 09 NOV 2026</small><h1>Do lançamento à próxima meta</h1><p>Antes e depois da interface Angular, com a mesma composição do 2º período e os mesmos dados simulados em cada cenário. As imagens foram capturadas no app; o antes foi registrado antes de alterar os componentes. Selecione um dispositivo e um estado para comparar.</p></header>
<div class="controls" aria-label="Configurar comparação"><div><label for="viewport">Dispositivo</label><select id="viewport"><option value="mobile">Celular · 390 × 844</option><option value="desktop">Desktop · 1280 × 900</option></select></div><div><label for="scenario">Estado da página</label><select id="scenario">${Object.entries(
  scenarios,
)
  .map(([value, label]) => `<option value="${value}">${label}</option>`)
  .join(
    '',
  )}</select></div><button id="single" type="button" aria-pressed="false">Ver só o depois</button></div>
<p id="contexto" role="status"></p>
<section class="comparison mobile" aria-label="Antes e depois"><figure data-side="antes"><figcaption>Antes</figcaption><a id="link-antes" download="notas-antes.png" title="Baixar captura original"><img id="img-antes" alt="Minhas notas antes da melhoria"></a></figure><figure data-side="depois"><figcaption>Depois · implementado</figcaption><a id="link-depois" download="notas-depois.png" title="Baixar captura original"><img id="img-depois" alt="Minhas notas depois da melhoria"></a></figure></section>
<section class="notes"><h2>O que mudou</h2><table><thead><tr><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead><tbody>
<tr><td>Nome do eixo no title da aba</td><td>Nome completo no conteúdo e contagem das avaliações lançadas</td><td>Contexto acessível também no celular</td></tr>
<tr><td>Traço na barra sem legenda visível</td><td>“Mínimo: 70” junto à barra</td><td>Explicitar a referência da nota</td></tr>
<tr><td>Status comunicado principalmente pela cor</td><td>“Sem notas”, “No caminho”, “Atenção” e “Meta atingida”</td><td>Leitura sem depender da cor</td></tr>
<tr><td>Notas e partes com pouca separação</td><td>Cabeçalhos, agrupamento e peso total da avaliação</td><td>Orientar o preenchimento</td></tr>
<tr><td>Campos de 36px e salvamento implícito</td><td>Campos de pelo menos 44px, indicação de gravação e instruções de edição</td><td>Facilitar o toque e confirmar o resultado</td></tr>
<tr><td>Abas sem setas nem associação explícita ao painel</td><td>Setas, Home/End, foco visível e erros associados ao campo</td><td>Completar a navegação por teclado</td></tr>
</tbody></table><p>Skills aplicadas: <strong>emil-design-eng</strong> (polimento e interação), <strong>revenue-centric-design</strong> (contexto e próximo passo), <strong>break-ui</strong> (casos extremos) e <strong>e2e-testing</strong> (validação). O ganho de altura vem de campos maiores e informações de orientação; a página mantém apenas o eixo selecionado, com regras recolhidas.</p></section>
<p>Calculadora independente. Estas capturas não usam dados de alunos. A nota oficial continua sendo a do portal da faculdade.</p></main>
<script>
const imagens=${JSON.stringify(imagens)};
const viewport=document.getElementById('viewport'),scenario=document.getElementById('scenario');
const contextos={demo:'Mesmas notas: teoria 16/100; prática 29,5/100. A meta da próxima avaliação permanece igual.',empty:'Sem lançamentos: o novo placar diferencia ausência de nota de uma nota zero.',risk:'Teoria: 25 pontos obtidos; é preciso 90% dos 50 pontos restantes para alcançar 70.',approved:'Teoria com 83 pontos; a prática ainda precisa atingir a própria meta. Frequência continua sendo requisito.',single:'PIEPE II tem uma dimensão única; o formulário usa uma coluna sem reservar espaço para outra parte.',worst:'Nomes extensos de eixo, avaliação e subitem; nota zero válida e pesos decimais.',unsupported:'Período ainda sem regulamento: orientação e acesso ao perfil.', 'no-period':'Período não cadastrado: escolha e continuação na própria página.',error:'Falha ao consultar notas: a ação Tentar de novo permite recuperar o carregamento.'};
function render(){const vp=viewport.value,sc=scenario.value;document.querySelector('.comparison').classList.toggle('mobile',vp==='mobile');for(const fase of ['antes','depois']){document.getElementById('img-'+fase).src=imagens[fase][vp][sc];document.getElementById('link-'+fase).href=imagens[fase][vp][sc];}document.getElementById('contexto').textContent=contextos[sc];history.replaceState(null,'','#'+vp+'/'+sc);}
for(const el of [viewport,scenario])el.addEventListener('change',render);document.getElementById('single').addEventListener('click',e=>{const ativo=document.body.classList.toggle('single');e.currentTarget.setAttribute('aria-pressed',String(ativo));e.currentTarget.textContent=ativo?'Comparar antes e depois':'Ver só o depois';});const hash=location.hash.slice(1).split('/');if(['mobile','desktop'].includes(hash[0]))viewport.value=hash[0];if(hash[1] in contextos)scenario.value=hash[1];render();
</script></html>`;
await writeFile(`${output}/comparacao.html`, html);

// Montagem das capturas completas, sem redesenhar nenhum elemento da interface.
for (const viewport of ['mobile', 'desktop']) {
  const width = viewport === 'mobile' ? 390 : 1000;
  const panels = await Promise.all(
    ['antes', 'depois'].map(async (fase) => {
      const image = await sharp(`${output}/${fase}/${viewport}/demo.png`)
        .resize({ width })
        .png()
        .toBuffer();
      return { image, height: (await sharp(image).metadata()).height };
    }),
  );
  const label = (texto) =>
    Buffer.from(
      `<svg width="${width}" height="44"><rect width="100%" height="100%" fill="white"/><text x="16" y="29" fill="#1e40af" font-family="sans-serif" font-size="16" font-weight="bold">${texto}</text></svg>`,
    );
  await sharp({
    create: {
      width: width * 2 + 24,
      height: Math.max(...panels.map((p) => p.height)) + 52,
      channels: 3,
      background: '#ffffff',
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
console.log(`Galeria: ${output}/comparacao.html`);
