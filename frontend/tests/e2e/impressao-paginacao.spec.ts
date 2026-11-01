import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { TamanhoFonteImpressao } from '../../src/app/core/models/impressao';
import type { QuestaoComAlternativas } from '../../src/app/core/models/questao';
import { setupTierMocks } from './fixtures/tier.fixture';

type QuestaoTeste = Pick<
  QuestaoComAlternativas,
  | 'id'
  | 'enunciado'
  | 'enunciado_apoio'
  | 'disciplina'
  | 'formato'
  | 'imagem_url'
  | 'imagem_legenda'
  | 'explicacao'
  | 'resposta_modelo'
  | 'alternativas'
  | 'temas'
>;

// Lê o PDF efetivamente paginado pelo Chromium, não as coordenadas da tela
// contínua de emulateMedia('print'), que não contêm quebras de página.
async function lerPdf(page: Page, testInfo: TestInfo) {
  // Artefato opcional para conferir a mesma marcação/CSS no print nativo
  // de outro navegador, sem carregar os scripts/autenticação da aplicação.
  if (process.env['PRINT_HTML_SNAPSHOT']) {
    const html = await page.evaluate(async () => {
      const copia = document.documentElement.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('script').forEach((el) => el.remove());
      const base = copia.querySelector('base');
      if (base) base.href = new URL('/', location.href).href;
      for (const link of Array.from(
        copia.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      )) {
        const style = document.createElement('style');
        style.textContent = await (await fetch(link.href)).text();
        link.replaceWith(style);
      }
      return '<!DOCTYPE html>' + copia.outerHTML;
    });
    await writeFile(testInfo.outputPath('simulado.html'), html);
  }
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = await page.pdf({
    path: testInfo.outputPath('simulado.pdf'),
    preferCSSPageSize: true,
  });
  const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  try {
    const paginas = [];
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const pagina = await pdf.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const itens = conteudo.items.filter((item) => 'str' in item);
      const operadores = await pagina.getOperatorList();
      paginas.push({
        texto: itens
          .map((item) => item.str)
          .join(' ')
          .replace(/\s+/g, ' '),
        itens,
        largura: pagina.view[2],
        altura: pagina.view[3],
        imagens: operadores.fnArray.filter((op) => op === OPS.paintImageXObject).length,
      });
    }
    return paginas;
  } finally {
    await pdf.destroy();
  }
}

function criarQuestao(numero: number, repeticoes = 3): QuestaoTeste {
  const prefixo = `Q${String(numero).padStart(2, '0')}`;
  return {
    id: prefixo,
    enunciado: `${prefixo}INICIO Paciente com sintomas persistentes procura atendimento. ${'Analise os achados clínicos e selecione a conduta mais adequada. '.repeat(repeticoes)} ${prefixo}ENUNCIADOFIM`,
    enunciado_apoio:
      numero % 3 === 0
        ? `${prefixo}APOIO Avalie os dados laboratoriais apresentados a seguir. ${'Os exames devem ser correlacionados com a história clínica. '.repeat(4)}`
        : null,
    disciplina: 'Clínica médica',
    formato: numero % 7 === 0 ? 'resposta_aberta_curta' : 'multipla_escolha',
    imagem_url: null,
    imagem_legenda: null,
    explicacao: `${prefixo}EXPLICACAO ${'A conduta considera os achados descritos no caso. '.repeat(5)} ${prefixo}EXPLICACAOFIM`,
    resposta_modelo:
      numero % 7 === 0 ? `${prefixo}MODELO Conduta fundamentada nos achados clínicos.` : null,
    alternativas:
      numero % 7 === 0
        ? []
        : ['A', 'B', 'C', 'D', 'E'].map((letra, ordem) => ({
            id: `${prefixo}${letra}`,
            questao_id: prefixo,
            letra,
            ordem,
            correta: ordem === 0,
            texto: `${prefixo}ALT${letra} A conduta proposta deve considerar o quadro clínico e os resultados dos exames complementares. ${prefixo}ALT${letra}FIM`,
            imagem_url: null,
          })),
    temas: [],
  };
}

async function abrirImpressao(
  page: Page,
  questoes: QuestaoTeste[],
  opcoes: {
    fonte?: TamanhoFonteImpressao;
    tema?: boolean;
    imagens?: boolean;
    cartao?: boolean;
    gabarito?: boolean;
    marcacao?: boolean;
    existente?: boolean;
  } = {},
) {
  const simulado = {
    nome: 'Simulado personalizado de paginação',
    qtdQuestoes: questoes.length,
    periodo: null,
    formato: 'processual',
    questoes,
    gabaritoLiberado: opcoes.gabarito ?? false,
  };
  await page.addInitScript(
    ({ simulado, opcoes }) => {
      sessionStorage.setItem('simuladoImpressaoEfemero', JSON.stringify(simulado));
      localStorage.setItem(
        'impressao_opcoes',
        JSON.stringify({
          tamanhoFonte: opcoes.fonte ?? 'normal',
          mostrarTema: opcoes.tema ?? true,
          mostrarImagens: opcoes.imagens ?? true,
          cartaoResposta: opcoes.cartao ?? false,
          marcacaoNaQuestao: opcoes.marcacao ?? true,
        }),
      );
    },
    { simulado, opcoes },
  );
  await setupTierMocks(
    page,
    opcoes.existente
      ? '/imprimir/simulado/prova-paginacao?gabarito=1'
      : '/imprimir/simulado/montado',
    {
      nivel: 'avancado',
      extraRoutes: async (p) => {
        await p.route('**/rest/v1/rpc/get_simulado_impressao', (route) =>
          route.fulfill({
            json: {
              prova: {
                nome: simulado.nome,
                qtd_questoes: questoes.length,
                formato: simulado.formato,
              },
              questoes,
              gabarito_liberado: simulado.gabaritoLiberado,
            },
          }),
        );
      },
    },
  );
  await expect(page.locator('app-questao-impressao')).toHaveCount(questoes.length);
  await expect(
    page.getByRole('button', { name: 'Imprimir', exact: true }).filter({ visible: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => undefined)),
    );
  });
}

function verificarIntegridade(
  paginas: Awaited<ReturnType<typeof lerPdf>>,
  questoes: QuestaoTeste[],
  inteiras = true,
) {
  expect(paginas.length).toBeGreaterThan(1);
  const textoCompleto = paginas.map((p) => p.texto).join(' ');
  for (const q of questoes) {
    const marcadores =
      [q.enunciado, q.enunciado_apoio ?? '', ...q.alternativas.map((a) => a.texto)]
        .join(' ')
        .match(/Q\d{2,3}[A-Z\d]+/g) ?? [];
    const indices = new Set<number>();
    for (const marcador of marcadores) {
      expect(textoCompleto.split(new RegExp(`\\b${marcador}\\b`)).length - 1, marcador).toBe(1);
      indices.add(paginas.findIndex((p) => new RegExp(`\\b${marcador}\\b`).test(p.texto)));
    }
    if (inteiras) expect(indices.size, `${q.id} deve caber inteira na mesma página`).toBe(1);
  }
  for (const [i, pagina] of paginas.entries()) {
    expect(pagina.texto.trim(), `Página ${i + 1} vazia`).not.toBe('');
    // A4, 14 mm laterais e 16 mm verticais. Tolerância para métricas de fonte.
    for (const item of pagina.itens.filter((item) => item.str.trim())) {
      expect(item.transform[4], item.str).toBeGreaterThanOrEqual(38);
      expect(item.transform[4] + item.width, item.str).toBeLessThanOrEqual(pagina.largura - 38);
      expect(item.transform[5], item.str).toBeGreaterThanOrEqual(43);
      expect(item.transform[5] + item.height, item.str).toBeLessThanOrEqual(pagina.altura - 43);
    }
    expect(pagina.texto).not.toContain('Voltar');
    expect(pagina.texto).not.toContain('Tamanho da fonte');
  }
}

test.describe('Paginação real dos PDFs de simulados', () => {
  for (const fonte of ['compacto', 'normal', 'grande'] as const) {
    for (const tema of [true, false]) {
      test(`${fonte}, ${tema ? 'com' : 'sem'} tema: preserva questões e alternativas entre páginas`, async ({
        page,
      }, testInfo) => {
        const questoes = Array.from({ length: 24 }, (_, i) => criarQuestao(i + 1, (i % 5) + 1));
        await abrirImpressao(page, questoes, { fonte, tema });
        verificarIntegridade(await lerPdf(page, testInfo), questoes);
      });
    }
  }

  for (const tema of [true, false]) {
    for (const trecho of ['enunciado', 'apoio', 'alternativa'] as const) {
      test(`texto maior que uma folha em ${trecho}, ${tema ? 'com' : 'sem'} tema: continua sem perder linhas`, async ({
        page,
      }, testInfo) => {
        const questao = criarQuestao(1);
        const longo = Array.from(
          { length: 90 },
          (_, i) =>
            `Q01LINHA${String(i).padStart(3, '0')} O acompanhamento clínico exige avaliação cuidadosa dos sintomas e interpretação dos exames complementares.`,
        ).join('\n\n');
        if (trecho === 'enunciado') questao.enunciado += `\n\n${longo}`;
        if (trecho === 'apoio') questao.enunciado_apoio = longo;
        if (trecho === 'alternativa') questao.alternativas[2]!.texto += ` ${longo}`;
        const questoes = [criarQuestao(2), questao, criarQuestao(3)];
        await abrirImpressao(page, questoes, { tema });
        verificarIntegridade(await lerPdf(page, testInfo), questoes, false);
      });
    }
  }

  test('questões próximas do tamanho da folha não são divididas', async ({ page }, testInfo) => {
    const questoes = Array.from({ length: 18 }, (_, i) => criarQuestao(i + 1, 16 + (i % 4)));
    await abrirImpressao(page, questoes, { fonte: 'grande' });
    verificarIntegridade(await lerPdf(page, testInfo), questoes);
  });

  test('questão extensa preserva cada alternativa que cabe em uma página', async ({
    page,
  }, testInfo) => {
    const questao = criarQuestao(1, 32);
    for (const alternativa of questao.alternativas) {
      alternativa.texto = alternativa.texto.replace(
        `${questao.id}ALT${alternativa.letra}FIM`,
        `${'A avaliação clínica fundamenta a decisão terapêutica e a interpretação dos exames complementares. '.repeat(10)} ${questao.id}ALT${alternativa.letra}FIM`,
      );
    }
    await abrirImpressao(page, [questao], { fonte: 'grande' });
    const paginas = await lerPdf(page, testInfo);
    verificarIntegridade(paginas, [questao], false);
    for (const alternativa of questao.alternativas) {
      const prefixo = `${questao.id}ALT${alternativa.letra}`;
      expect(
        paginas.findIndex((p) => new RegExp(`\\b${prefixo}\\b`).test(p.texto)),
        prefixo,
      ).toBe(paginas.findIndex((p) => p.texto.includes(`${prefixo}FIM`)));
    }
  });

  for (const largura of [390, 820, 1024, 1440]) {
    test(`PDF com imagens em viewport ${largura}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: largura, height: 900 });
      const sharp = (await import('sharp')).default;
      const imagem = await sharp({
        create: { width: 500, height: 500, channels: 3, background: '#008d35' },
      })
        .png()
        .toBuffer();
      await page.route('**/imagem-paginacao.png', (route) =>
        route.fulfill({ contentType: 'image/png', body: imagem }),
      );
      const questoes = Array.from({ length: 12 }, (_, i) => {
        const q = criarQuestao(i + 1, 2);
        q.imagem_url = '/imagem-paginacao.png';
        q.imagem_legenda = `${q.id}FIGURA`;
        if (q.alternativas.length) q.alternativas[0]!.imagem_url = '/imagem-paginacao.png';
        return q;
      });
      await abrirImpressao(page, questoes, { cartao: true });
      const paginas = await lerPdf(page, testInfo);
      verificarIntegridade(paginas, questoes);
      // O logo também é uma imagem. Cada figura e imagem de alternativa
      // deve existir no PDF, além do texto verificado acima.
      expect(paginas.reduce((total, p) => total + p.imagens, 0)).toBe(1 + 12 + 11);
      expect(paginas.at(-1)!.texto).toContain('Cartão-resposta');
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.impressao-main')).toHaveCSS('margin-left', '0px');
      await expect(page.locator('.questoes-impressao')).toHaveCSS('display', 'block');
      await expect(page.locator('app-questao-impressao').first()).toHaveCSS(
        'break-inside',
        'avoid-page',
      );
    });
  }

  test('prova existente com cartão e gabarito comentado mantém o conteúdo e as quebras de seção', async ({
    page,
  }, testInfo) => {
    const questoes = Array.from({ length: 35 }, (_, i) => criarQuestao(i + 1));
    await abrirImpressao(page, questoes, {
      existente: true,
      gabarito: true,
      cartao: true,
      marcacao: false,
    });
    await page.getByLabel('Com explicações', { exact: true }).check();
    await expect(page.locator('.explicacoes-impressao')).toContainText('Q01EXPLICACAO');
    const paginas = await lerPdf(page, testInfo);
    verificarIntegridade(paginas, questoes);
    const texto = paginas.map((p) => p.texto).join(' ');
    const cartao = paginas.findIndex((p) => p.texto.includes('Cartão-resposta'));
    const gabarito = paginas.findIndex((p) => p.texto.includes('Gabarito'));
    expect(cartao).toBeGreaterThan(0);
    expect(gabarito).toBeGreaterThan(cartao);
    expect(paginas[cartao]!.texto).not.toMatch(/Q\d{2,3}INICIO/);
    expect(paginas[gabarito - 1]!.texto).not.toContain('Gabarito');
    for (const q of questoes) {
      expect(texto).toContain(`${q.id}EXPLICACAO`);
      expect(texto).toContain(`${q.id}EXPLICACAOFIM`);
      if (q.resposta_modelo) expect(texto).toContain(`${q.id}MODELO`);
      const inicio = paginas.findIndex((p) => p.texto.includes(`${q.id}EXPLICACAO`));
      const fim = paginas.findIndex((p) => p.texto.includes(`${q.id}EXPLICACAOFIM`));
      expect(inicio, `${q.id} explicação inteira`).toBe(fim);
    }
  });

  test('simulado de 100 questões preserva a ordem e não perde conteúdo', async ({
    page,
  }, testInfo) => {
    const questoes = Array.from({ length: 100 }, (_, i) => criarQuestao(i + 1, i % 5));
    await abrirImpressao(page, questoes, { fonte: 'compacto', tema: false, marcacao: false });
    const paginas = await lerPdf(page, testInfo);
    verificarIntegridade(paginas, questoes);
    const texto = paginas.map((p) => p.texto).join(' ');
    const posicoes = questoes.map((q) => texto.indexOf(`${q.id}INICIO`));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });
});
