/**
 * Parser de explicações de questões fechadas.
 *
 * Muitas explicações do banco vêm como um único bloco de texto no formato
 * "A) Incorreta. … B) Incorreta. … C) Correta. … D) Incorreta. …", tudo em
 * linha corrida — o que é cansativo de ler. Este parser reconhece esse padrão
 * e separa cada alternativa em um item estruturado (letra, status e texto),
 * pronto para um display mais agradável. Quando o texto não segue esse padrão
 * (explicações em prosa), retorna null e o chamador exibe o texto original.
 *
 * A transformação é apenas de apresentação: nada é reescrito no banco.
 */

export type StatusAlternativaExplicacao = 'correta' | 'incorreta' | 'neutra';

export interface AlternativaExplicacao {
  letra: string;
  status: StatusAlternativaExplicacao;
  texto: string;
}

export interface ExplicacaoEstruturada {
  /** Texto introdutório antes da primeira alternativa, se houver. */
  intro: string | null;
  alternativas: AlternativaExplicacao[];
}

/** Marcador de alternativa: uma letra A–E seguida de ")" e espaço. */
const MARCADOR_ALTERNATIVA = /(?:^|\s)([A-E])\)\s+/g;

/** Mínimo de alternativas reconhecidas para considerar a explicação "estruturada". */
const MIN_ALTERNATIVAS = 3;

function limparRuido(raw: string): string {
  let texto = raw.trim();

  // Artefato de geração: "…C) Correta.\nTEMA: …\nEXPLICACAO: <versão completa>".
  // A versão útil e completa é a que vem após o último "EXPLICACAO:".
  const idxExplicacao = texto.toUpperCase().lastIndexOf('EXPLICACAO:');
  if (idxExplicacao !== -1) {
    texto = texto.slice(idxExplicacao + 'EXPLICACAO:'.length).trim();
  }

  // Remove linhas soltas "TEMA: …" e cercas de código markdown órfãs (```).
  texto = texto.replace(/^[ \t]*TEMA:.*$/gim, '');
  texto = texto.replace(/```/g, '');

  return texto.trim();
}

function detectarStatus(corpo: string): StatusAlternativaExplicacao {
  const inicio = corpo.replace(/^[\s*_`"'—–-]+/, '').toLowerCase();
  if (inicio.startsWith('incorreta') || inicio.startsWith('errada')) return 'incorreta';
  if (inicio.startsWith('correta') || inicio.startsWith('certa')) return 'correta';
  return 'neutra';
}

function removerPrefixoStatus(corpo: string): string {
  return corpo
    .replace(/^[\s*_`"'—–-]*(?:Incorreta|Errada|Correta|Certa)\b[\s.:,;)—–-]*/i, '')
    .trim();
}

export function parseExplicacaoEstruturada(
  raw: string | null | undefined,
): ExplicacaoEstruturada | null {
  if (!raw || !raw.trim()) return null;

  const texto = limparRuido(raw);

  const marcadores: { letra: string; inicio: number; fimMarcador: number }[] = [];
  MARCADOR_ALTERNATIVA.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARCADOR_ALTERNATIVA.exec(texto)) !== null) {
    marcadores.push({
      letra: match[1],
      inicio: match.index,
      fimMarcador: match.index + match[0].length,
    });
  }

  if (marcadores.length < MIN_ALTERNATIVAS) return null;

  const intro = texto.slice(0, marcadores[0].inicio).trim();

  const brutas: AlternativaExplicacao[] = marcadores.map((marcador, i) => {
    const fim = i + 1 < marcadores.length ? marcadores[i + 1].inicio : texto.length;
    const corpo = texto.slice(marcador.fimMarcador, fim).trim();
    return {
      letra: marcador.letra,
      status: detectarStatus(corpo),
      texto: removerPrefixoStatus(corpo),
    };
  });

  // Deduplica por letra (mantém a última ocorrência — a mais completa) e ordena A→E.
  const porLetra = new Map<string, AlternativaExplicacao>();
  for (const alt of brutas) porLetra.set(alt.letra, alt);
  const alternativas = [...porLetra.values()].sort((a, b) => a.letra.localeCompare(b.letra));

  if (alternativas.length < MIN_ALTERNATIVAS) return null;

  return { intro: intro || null, alternativas };
}
