import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = fileURLToPath(new URL('./out/competitivo/', import.meta.url));
await mkdir(output, { recursive: true });
const scenes = {
  demo: [
    'Desafio e ranking global',
    'Mesmo progresso, questão e participantes. O resumo ocupa menos espaço no celular e o desktop apresenta desafio e ranking lado a lado.',
  ],
  semana: [
    'Ranking da semana',
    'Aba associada ao painel, período visível e sua posição no recorte escolhido. Classificação por XP de atividade.',
  ],
  answered: [
    'Desafio · Resposta correta',
    'Resultado junto da questão, XP recebido, correção por texto e explicação. A próxima oportunidade é o desafio de amanhã.',
  ],
  wrong: [
    'Desafio · Resposta incorreta',
    'Sua escolha e a alternativa correta têm rótulos explícitos; a correção não depende apenas da cor.',
  ],
  image: [
    'Desafio · Com imagem',
    'Imagem real do projeto usada para testar a apresentação. No depois, o botão de ampliar é independente da seleção da resposta.',
  ],
  worst: [
    'Dados extensos e avatar quebrado',
    'Nomes extensos, caracteres compostos, 11 posições, XP no limite de inteiro e enunciado longo. Números completos, nome em várias linhas e inicial quando o avatar falha.',
  ],
  empty: [
    'Sem desafio e sem participantes',
    'Ausência de dados com orientação para estudar. Não se confunde com uma falha de carregamento.',
  ],
  one: [
    'Um participante',
    'Mesmo painel com uma pessoa e pluralização correta. Sua posição permanece visível.',
  ],
  error: [
    'Falhas de carregamento',
    'No antes, XP zero, ranking vazio e desafio indisponível. No depois, mensagens persistentes e nova tentativa para cada área.',
  ],
};
const images = {};
for (const fase of ['antes', 'depois']) {
  images[fase] = {};
  for (const vp of ['mobile', 'desktop']) {
    images[fase][vp] = {};
    for (const scene of Object.keys(scenes)) {
      images[fase][vp][scene] =
        `data:image/png;base64,${(await readFile(`${output}/${fase}/${vp}/${scene}.png`)).toString('base64')}`;
    }
  }
}
const changes = [
  [
    'Resumo em três cards altos no celular',
    'Resumo em linhas compactas, com adaptação ao texto ampliado',
    'Chegar à questão com menos rolagem',
  ],
  [
    'Desafio e ranking empilhados no desktop',
    'Dois painéis lado a lado, mantendo a sequência no celular',
    'Aproveitar a largura disponível',
  ],
  [
    'Tocar na alternativa já enviava a resposta',
    'Escolher, trocar e confirmar explicitamente',
    'Evitar uma resposta irreversível por toque acidental',
  ],
  [
    'Sua posição era carregada e não aparecia',
    'Posição e total de participantes por período',
    'Dar contexto pessoal à classificação',
  ],
  [
    'Nomes truncados e avatar quebrado sem recuperação',
    'Nome completo, inicial alternativa e números tabulares',
    'Identificar as pessoas sem perder informação',
  ],
  [
    'Falha de rede era apresentada como ausência de dados',
    'Mensagens locais com recuperação e seleção preservada',
    'Saber o que aconteceu e como continuar',
  ],
  [
    'Envio salvo e falha de correção permitiam nova tentativa de resposta',
    'Resposta bloqueada após confirmação do servidor; Atualizar correção',
    'Não reenviar o que já foi registrado',
  ],
];
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Competitivo · Antes e depois · BoraMed</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:15px/1.6 system-ui,sans-serif}main{max-width:1520px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.2;margin:8px 0 12px}h2{font-size:18px}p{color:#475569;max-width:950px}small{color:#2554dc;font-weight:700}label{font-size:12px;font-weight:700;color:#475569}select,button{min-height:44px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:white;color:#0f172a;font:inherit}select{display:block;width:100%;margin-top:4px}button{cursor:pointer}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:end;padding:18px;background:#fffffffa;border:1px solid #e2e8f0;border-radius:14px;margin:24px 0;position:sticky;top:8px;z-index:2}.controls div{flex:1 1 180px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.comparison figure{margin:0;min-width:0;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.comparison figcaption{padding:12px 18px;border-bottom:1px solid #e2e8f0;font-weight:700}.comparison img{display:block;width:100%;height:auto}.comparison.mobile{justify-items:center}.comparison.mobile figure{max-width:460px;width:100%}.notes{padding:20px;margin:24px 0;border:1px solid #e2e8f0;border-radius:14px;background:white}.notes h2{margin-top:0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0;padding:12px}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #2554dc;outline-offset:3px}.single .comparison{grid-template-columns:1fr}.single [data-side="antes"]{display:none}@media(max-width:650px){main{padding:20px 12px}h1{font-size:25px}.controls{gap:12px;padding:14px;position:static}.comparison{gap:10px}.comparison figcaption{padding:10px;font-size:13px}th,td{padding:8px;font-size:12px}}
</style><main><header><small>BORAMED · COMPETITIVO · 10 NOV 2026</small><h1>Seu estudo em primeiro plano</h1><p>Capturas reais do Angular com os mesmos dados simulados, data e larguras. O antes usa os componentes publicados antes desta revisão. A comparação inclui o desafio diário, os dois períodos do ranking e estados difíceis. As coroas e o manto do pódio foram preservados.</p></header>
<div class="controls" aria-label="Configurar comparação"><div><label for="viewport">Dispositivo</label><select id="viewport"><option value="mobile">Celular · 390 × 844</option><option value="desktop">Desktop · 1280 × 900</option></select></div><div><label for="scene">Etapa ou estado</label><select id="scene">${Object.entries(
  scenes,
)
  .map(([key, value]) => `<option value="${key}">${value[0]}</option>`)
  .join(
    '',
  )}</select></div><button id="single" type="button" aria-pressed="false">Ver só o depois</button></div><p id="contexto" role="status"></p>
<section class="comparison mobile" aria-label="Comparação visual"><figure data-side="antes"><figcaption>Antes</figcaption><a id="link-antes" download="competitivo-antes.png" title="Baixar captura original"><img id="img-antes" alt="Competitivo antes das melhorias"></a></figure><figure data-side="depois"><figcaption>Depois · implementado</figcaption><a id="link-depois" download="competitivo-depois.png" title="Baixar captura original"><img id="img-depois" alt="Competitivo depois das melhorias"></a></figure></section>
<section class="notes"><h2>O que mudou</h2><table><thead><tr><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead><tbody>${changes.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Skills: <strong>emil-design-eng</strong> (hierarquia e acessibilidade), <strong>revenue-centric-design</strong> (contexto e próxima ação), <strong>break-ui</strong> (dados extremos) e <strong>e2e-testing</strong> (fluxos e recuperação). Sem animação de entrada, contadores ou ordenação. Hover restrito a ponteiro e movimento reduzido respeitado.</p><p>Escolha e confirmação, envio em andamento e recuperação de falhas foram exercitados nos testes de interação. A imagem estática de um desafio concluído não demonstra essas operações.</p></section><p>Dados fictícios de estudo, sem informações reais de alunos. XP, sorteio, anonimato e gabarito continuam sob as regras do servidor.</p></main>
<script>const images=${JSON.stringify(images)},scenes=${JSON.stringify(scenes)};const vp=document.getElementById('viewport'),scene=document.getElementById('scene');function render(){document.querySelector('.comparison').classList.toggle('mobile',vp.value==='mobile');for(const fase of ['antes','depois']){document.getElementById('img-'+fase).src=images[fase][vp.value][scene.value];document.getElementById('link-'+fase).href=images[fase][vp.value][scene.value];}document.getElementById('contexto').textContent=scenes[scene.value][1];history.replaceState(null,'','#'+vp.value+'/'+scene.value);}vp.addEventListener('change',render);scene.addEventListener('change',render);document.getElementById('single').addEventListener('click',e=>{const ativo=document.body.classList.toggle('single');e.currentTarget.setAttribute('aria-pressed',String(ativo));e.currentTarget.textContent=ativo?'Comparar antes e depois':'Ver só o depois';});const hash=location.hash.slice(1).split('/');if(['mobile','desktop'].includes(hash[0]))vp.value=hash[0];if(hash[1] in scenes)scene.value=hash[1];render();</script></html>`;
await writeFile(`${output}/comparacao.html`, html);
for (const vp of ['mobile', 'desktop']) {
  for (const scene of ['demo', 'answered', 'error']) {
    const width = vp === 'mobile' ? 390 : 1000;
    const panels = await Promise.all(
      ['antes', 'depois'].map(async (fase) => {
        const image = await sharp(`${output}/${fase}/${vp}/${scene}.png`)
          .resize({ width })
          .png()
          .toBuffer();
        return { image, height: (await sharp(image).metadata()).height };
      }),
    );
    const label = (text) =>
      Buffer.from(
        `<svg width="${width}" height="44"><rect width="100%" height="100%" fill="white"/><text x="16" y="29" fill="#1e40af" font-family="sans-serif" font-size="16" font-weight="bold">${text}</text></svg>`,
      );
    await sharp({
      create: {
        width: width * 2 + 24,
        height: Math.max(...panels.map((p) => p.height)) + 52,
        channels: 3,
        background: '#e2e8f0',
      },
    })
      .composite([
        { input: label('ANTES'), left: 0, top: 0 },
        { input: label('DEPOIS'), left: width + 24, top: 0 },
        { input: panels[0].image, left: 0, top: 52 },
        { input: panels[1].image, left: width + 24, top: 52 },
      ])
      .png()
      .toFile(`${output}/comparacao-${scene}-${vp}.png`);
  }
}
console.log(`Comparação gerada: ${output}/comparacao.html`);
