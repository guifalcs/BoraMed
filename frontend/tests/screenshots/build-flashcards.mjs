import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = fileURLToPath(new URL('./out/flashcards/', import.meta.url));
await mkdir(output, { recursive: true });
const scenes = {
  oficiais: [
    'Biblioteca · Oficiais',
    'Mesmos decks preparados pela equipe BoraMed. Títulos completos, origem e uma ação explícita de estudo.',
  ],
  comunidade: [
    'Biblioteca · Comunidade',
    'Autoria, curtidas e ordenação. Curtir é um controle independente: o teclado não abre o estudo por engano.',
  ],
  meus: [
    'Biblioteca · Meus decks',
    'Privacidade explícita, criação à vista e ações de editar, excluir e consultar curtidas.',
  ],
  editor: [
    'Editor · Novo deck',
    'Frente e verso com rótulos associados; imagens opcionais recolhidas, adição de cards por texto e orientação de salvamento.',
  ],
  editar: [
    'Editor · Deck existente',
    'Mesmo conteúdo preenchido. Navegação dos cards e ferramentas com área de toque de pelo menos 44px.',
  ],
  pergunta: [
    'Estudo · Pergunta',
    'O card mantém a identidade visual. Mostrar resposta é a próxima ação clara; o resultado da rodada não é prometido como histórico.',
  ],
  resposta: [
    'Estudo · Resposta revelada',
    'No antes, Próximo fica parcialmente fora da tela no celular. No depois, navegação e autoavaliação ocupam linhas separadas.',
  ],
  imagem: [
    'Estudo · Card com imagem',
    'Imagem real do projeto, com o botão de zoom separado do botão de virar. A imagem não é uma ilustração gerada para o comparativo.',
  ],
  resultado: [
    'Estudo · Conclusão',
    'Mesmos dois acertos e um erro. Reforço vira a próxima ação; Refazer deck completo restaura toda a coleção.',
  ],
  worst: [
    'Caso extremo · Nomes longos',
    'Mesmo título extenso de farmacocinética/farmacodinâmica. No depois, o nome necessário para reconhecer o deck não é cortado.',
  ],
  empty: [
    'Estado · Nenhum deck',
    'O estado vazio orienta a explorar a comunidade ou criar um deck.',
  ],
  one: [
    'Estado · Um deck, um card',
    'Contagens no singular, sem preencher a tela com indicadores artificiais.',
  ],
  error: [
    'Estado · Falha de carregamento',
    'No antes, a falha gera toast e biblioteca vazia. No depois, erro e Tentar novamente ficam no conteúdo.',
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
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flashcards · Antes e depois · BoraMed</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:15px/1.6 system-ui,sans-serif}main{max-width:1520px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.2;margin:8px 0 12px}h2{font-size:18px}p{color:#475569;max-width:950px}small{color:#2554dc;font-weight:700}a{color:#2554dc}label{font-size:12px;font-weight:700;color:#475569}select,button{min-height:44px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:white;color:#0f172a;font:inherit}select{display:block;width:100%;margin-top:4px}button{cursor:pointer}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:end;padding:18px;background:white;border:1px solid #e2e8f0;border-radius:14px;margin:24px 0}.controls div{flex:1 1 180px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.comparison figure{margin:0;min-width:0;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.comparison figcaption{padding:12px 18px;border-bottom:1px solid #e2e8f0;font-weight:700}.comparison img{display:block;width:100%;height:auto}.comparison.mobile{justify-items:center}.comparison.mobile figure{max-width:460px;width:100%}.notes{padding:20px;margin:24px 0;border:1px solid #e2e8f0;border-radius:14px;background:white}.notes h2{margin-top:0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0;padding:12px}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #2554dc;outline-offset:3px}.single .comparison{grid-template-columns:1fr}.single [data-side="antes"]{display:none}@media(max-width:650px){main{padding:20px 12px}h1{font-size:25px}.controls{gap:12px;padding:14px}.comparison{gap:10px}.comparison figcaption{padding:10px;font-size:13px}th,td{padding:8px;font-size:12px}}
</style><main><header><small>BORAMED · FLASHCARDS · 10 NOV 2026</small><h1>Escolher, criar e estudar com clareza</h1><p>Capturas reais da interface Angular, com os mesmos dados simulados, mesma data e mesmas larguras. O antes foi registrado antes de alterar os componentes. Compare a biblioteca, o editor e a rodada de estudo, incluindo estados difíceis.</p></header>
<div class="controls" aria-label="Configurar comparação"><div><label for="viewport">Dispositivo</label><select id="viewport"><option value="mobile">Celular · 390 × 844</option><option value="desktop">Desktop · 1280 × 900</option></select></div><div><label for="scene">Etapa ou estado</label><select id="scene">${Object.entries(
  scenes,
)
  .map(([key, value]) => `<option value="${key}">${value[0]}</option>`)
  .join(
    '',
  )}</select></div><button id="single" type="button" aria-pressed="false">Ver só o depois</button></div><p id="contexto" role="status"></p>
<section class="comparison mobile" aria-label="Comparação visual"><figure data-side="antes"><figcaption>Antes</figcaption><a id="link-antes" download="flashcards-antes.png" title="Baixar captura original"><img id="img-antes" alt="Flashcards antes das melhorias"></a></figure><figure data-side="depois"><figcaption>Depois · implementado</figcaption><a id="link-depois" download="flashcards-depois.png" title="Baixar captura original"><img id="img-depois" alt="Flashcards depois das melhorias"></a></figure></section>
<section class="notes"><h2>O que mudou</h2><table><thead><tr><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead><tbody>
<tr><td>Título do deck cortado e criação escondida em Meus decks</td><td>Título completo, origem/privacidade, Estudar e Criar deck à vista</td><td>Reconhecer o material e encontrar a próxima ação</td></tr>
<tr><td>Falha recebida como toast e lista vazia</td><td>Erro persistente no conteúdo, com nova tentativa</td><td>Distinguir falha de ausência de decks</td></tr>
<tr><td>Navegação e avaliação competiam na mesma linha</td><td>Mostrar resposta; depois Errei/Acertei; navegação em linha própria</td><td>Manter todos os controles acessíveis no celular</td></tr>
<tr><td>Zoom dentro do botão de virar e ambas as faces na leitura acessível</td><td>Botões independentes e face oculta fora da leitura</td><td>HTML válido e interação previsível</td></tr>
<tr><td>Campos sem rótulo associado e ferramentas pequenas</td><td>Frente/Pergunta e Verso/Resposta associados, controles de 44px e imagens opcionais</td><td>Reduzir esforço e erros no preenchimento</td></tr>
<tr><td>Saída e embaralhamento descartavam trabalho sem aviso</td><td>Confirmação quando há conteúdo ou respostas a perder</td><td>Preservar o trabalho do estudante</td></tr>
<tr><td>Refazer após reforço repetia apenas a coleção reduzida</td><td>Reforço separado e restauração do deck completo</td><td>Corresponder ao que a ação promete</td></tr>
</tbody></table><p>Skills: <strong>emil-design-eng</strong>, <strong>revenue-centric-design</strong>, <strong>break-ui</strong> e <strong>e2e-testing</strong>. Movimento restrito à virada curta e ao feedback de interação. Resultados de estudo continuam locais à rodada; não foi acrescentado agendamento ou histórico persistente.</p></section><p>Dados de demonstração, sem informações de alunos. O selo Oficial identifica os decks da equipe BoraMed.</p></main>
<script>const images=${JSON.stringify(images)},scenes=${JSON.stringify(scenes)};const vp=document.getElementById('viewport'),scene=document.getElementById('scene');function render(){document.querySelector('.comparison').classList.toggle('mobile',vp.value==='mobile');for(const fase of ['antes','depois']){document.getElementById('img-'+fase).src=images[fase][vp.value][scene.value];document.getElementById('link-'+fase).href=images[fase][vp.value][scene.value];}document.getElementById('contexto').textContent=scenes[scene.value][1];history.replaceState(null,'','#'+vp.value+'/'+scene.value);}vp.addEventListener('change',render);scene.addEventListener('change',render);document.getElementById('single').addEventListener('click',e=>{const ativo=document.body.classList.toggle('single');e.currentTarget.setAttribute('aria-pressed',String(ativo));e.currentTarget.textContent=ativo?'Comparar antes e depois':'Ver só o depois';});const hash=location.hash.slice(1).split('/');if(['mobile','desktop'].includes(hash[0]))vp.value=hash[0];if(hash[1] in scenes)scene.value=hash[1];render();</script></html>`;
await writeFile(`${output}/comparacao.html`, html);
for (const vp of ['mobile', 'desktop']) {
  for (const scene of ['oficiais', 'resposta', 'editor']) {
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
      .toFile(`${output}/comparacao-${scene}-${vp}.png`);
  }
}
console.log(`Galeria: ${output}/comparacao.html`);
