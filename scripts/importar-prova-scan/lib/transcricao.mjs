/**
 * Carga, validação de contrato e costura das transcrições do scan.
 *
 * Cada página do scan gera um JSON por passe. Uma questão pode aparecer
 * fatiada em duas páginas; a costura remonta a questão inteira e é
 * determinística — nenhuma inferência de conteúdo acontece aqui.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { colapsar } from './texto.mjs';

export const LETRAS = ['a', 'b', 'c', 'd', 'e'];

const CAMPOS_TEXTO = ['enunciado_apoio', 'enunciado'];

/**
 * Lê todos os `pNNN.json` de um diretório de passe e valida o contrato.
 * @returns {{ paginas: Array, erros: string[] }}
 */
export function carregarPasse(dirPasse, paginasEsperadas) {
  const erros = [];
  if (!existsSync(dirPasse)) {
    return { paginas: [], erros: [`diretório inexistente: ${dirPasse}`] };
  }

  const arquivos = readdirSync(dirPasse).filter((f) => /^p\d{3}\.json$/.test(f)).sort();
  const paginas = [];
  const vistas = new Set();

  for (const arquivo of arquivos) {
    const caminho = join(dirPasse, arquivo);
    let dados;
    try {
      dados = JSON.parse(readFileSync(caminho, 'utf-8'));
    } catch (e) {
      erros.push(`${arquivo}: JSON inválido — ${e.message}`);
      continue;
    }

    const esperado = parseInt(arquivo.slice(1, 4), 10);
    const declarado = dados.pagina_pdf;
    if (declarado !== esperado) {
      erros.push(`${arquivo}: pagina_pdf=${declarado} não bate com o nome do arquivo (${esperado})`);
    }
    if (!Array.isArray(dados.questoes)) {
      erros.push(`${arquivo}: campo "questoes" ausente ou não é lista`);
      continue;
    }

    dados.questoes.forEach((q, i) => {
      const ref = `${arquivo}[${i}]`;
      if (q.numero !== null && q.numero !== undefined && !Number.isInteger(q.numero)) {
        erros.push(`${ref}: numero deve ser inteiro ou null`);
      }
      if (typeof q.alternativas !== 'object' || q.alternativas === null) {
        erros.push(`${ref}: alternativas ausente`);
        q.alternativas = {};
      }
      for (const letra of Object.keys(q.alternativas)) {
        if (!LETRAS.includes(letra)) {
          erros.push(`${ref}: letra inesperada "${letra}" (esperado a–e)`);
        }
      }
      // Gabarito jamais vem da transcrição — se o agente emitiu, é violação
      // do contrato e o campo é descartado, nunca usado.
      for (const proibido of ['gabarito', 'correta', 'resposta', 'letra_correta']) {
        if (q[proibido] !== undefined) {
          erros.push(`${ref}: campo proibido "${proibido}" na transcrição (gabarito vem só do PDF oficial)`);
          delete q[proibido];
        }
      }
    });

    vistas.add(esperado);
    paginas.push({ pagina_pdf: esperado, questoes: dados.questoes });
  }

  for (const p of paginasEsperadas) {
    if (!vistas.has(p)) erros.push(`página ${p} não transcrita (falta p${String(p).padStart(3, '0')}.json)`);
  }

  paginas.sort((a, b) => a.pagina_pdf - b.pagina_pdf);
  return { paginas, erros };
}

/**
 * Remonta as questões a partir dos fragmentos por página.
 *
 * O número da questão só é visível onde ela começa (cabeçalho "Nª Questão").
 * Um fragmento de continuação vem com `numero: null` e herda o número da
 * última questão aberta — inferência puramente posicional, validada depois
 * contra a contagem do gabarito oficial.
 *
 * @returns {{ questoes: Map<number, object>, erros: string[], avisos: string[] }}
 */
export function costurar(paginas) {
  const questoes = new Map();
  const erros = [];
  const avisos = [];
  let ultimoNumero = null;

  for (const pagina of paginas) {
    pagina.questoes.forEach((frag, i) => {
      let numero = frag.numero ?? null;

      if (numero === null) {
        if (i !== 0) {
          erros.push(`p${pagina.pagina_pdf}: fragmento ${i} sem número no meio da página`);
          return;
        }
        if (ultimoNumero === null) {
          erros.push(`p${pagina.pagina_pdf}: fragmento de continuação sem questão anterior`);
          return;
        }
        numero = ultimoNumero;
      }

      const existente = questoes.get(numero);

      if (!existente) {
        questoes.set(numero, {
          numero,
          paginas: [pagina.pagina_pdf],
          peso: frag.peso ?? null,
          fonte_original: frag.fonte_original ?? null,
          enunciado_apoio: colapsar(frag.enunciado_apoio ?? ''),
          enunciado: colapsar(frag.enunciado ?? ''),
          alternativas: { ...normalizarAlternativas(frag.alternativas) },
          tem_imagem: Boolean(frag.tem_imagem),
          imagem_topo_pct: frag.imagem_topo_pct ?? null,
          imagem_base_pct: frag.imagem_base_pct ?? null,
          posicao_topo_pct: frag.posicao_topo_pct ?? null,
          observacoes: [frag.observacoes].filter(Boolean),
          costurada: false,
          alternativas_costuradas: [],
        });
        ultimoNumero = numero;
        return;
      }

      // ── Fragmento de continuação: mescla no registro existente ──
      existente.paginas.push(pagina.pagina_pdf);
      existente.costurada = true;

      for (const campo of CAMPOS_TEXTO) {
        const novo = colapsar(frag[campo] ?? '');
        if (!novo) continue;
        existente[campo] = existente[campo] ? `${existente[campo]} ${novo}` : novo;
      }

      for (const [letra, texto] of Object.entries(normalizarAlternativas(frag.alternativas))) {
        if (!existente.alternativas[letra]) {
          existente.alternativas[letra] = texto;
          continue;
        }
        // Mesma letra em duas páginas: alternativa partida pela quebra de
        // página. Concatena e marca para revisão obrigatória.
        existente.alternativas[letra] = `${existente.alternativas[letra]} ${texto}`;
        existente.alternativas_costuradas.push(letra);
      }

      existente.peso ??= frag.peso ?? null;
      existente.fonte_original ??= frag.fonte_original ?? null;
      existente.tem_imagem = existente.tem_imagem || Boolean(frag.tem_imagem);
      existente.imagem_topo_pct ??= frag.imagem_topo_pct ?? null;
      existente.imagem_base_pct ??= frag.imagem_base_pct ?? null;
      if (frag.observacoes) existente.observacoes.push(frag.observacoes);

      ultimoNumero = numero;
    });
  }

  // Continuidade da numeração: qualquer lacuna significa página não
  // transcrita ou questão perdida na costura.
  const nums = [...questoes.keys()].sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] !== nums[i - 1] + 1) {
      erros.push(`lacuna na numeração entre as questões ${nums[i - 1]} e ${nums[i]}`);
    }
  }
  if (nums.length > 0 && nums[0] !== 1) {
    avisos.push(`transcrição começa na questão ${nums[0]}, não na 1`);
  }

  return { questoes, erros, avisos };
}

function normalizarAlternativas(alternativas) {
  const saida = {};
  for (const [letra, texto] of Object.entries(alternativas ?? {})) {
    const l = String(letra).toLowerCase().trim();
    if (!LETRAS.includes(l)) continue;
    const t = colapsar(texto ?? '');
    if (t) saida[l] = t;
  }
  return saida;
}
