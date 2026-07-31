import { detectarEnumeracaoRomana, separarItensRomanos } from './formatar-enunciado';

/**
 * Normaliza a explicação (devolutiva) de uma questão para exibição em Markdown.
 *
 * O pipeline de importação (`gerar.mjs`) colapsa parágrafos ao gerar o markdown
 * — o mesmo processo que motiva `formatarEnunciado` — e a devolutiva comentada
 * chega como um único bloco de prosa: o comentário de cada alternativa fica
 * grudado no da alternativa seguinte, sem quebra nenhuma. Esta função insere
 * linhas em branco (parágrafos Markdown) nos pontos estruturais mais comuns
 * observados nas devolutivas — rótulos de seção, o comentário de cada
 * alternativa e enumerações romanas — SEM alterar nenhum conteúdo textual:
 * apenas reorganiza o espaçamento visual.
 *
 * Cobertura parcial por natureza: nem toda devolutiva usa um rótulo ou padrão
 * reconhecível (parte é prosa livre, sem marcador algum). Para esses casos não
 * há heurística mecânica confiável — permanecem como texto corrido, e correção
 * fica a cargo de revisão editorial no `/admin/questoes`.
 */

/** Rótulos de seção que a devolutiva costuma emitir inline, sem quebra própria. */
const ROTULO_SECAO =
  /[ \t]*\b(Distratores|Justificativas?(?: das (?:alternativas|op[çc][õo]es) incorretas)?|Explica[çc][ãa]o das alternativas incorretas|Respostas?\s+[Cc]orretas?|Respostas?\s+[Ii]ncorretas?|Gabarito|Refer[êe]ncias?)[ \t]*:[ \t]*/g;

function separarRotulos(texto: string): string {
  return texto.replace(ROTULO_SECAO, (_match, rotulo: string) => `\n\n${rotulo}:\n\n`);
}

/**
 * "A alternativa C está correta" / "A alternativa B está incorreta" — o padrão
 * mais comum quando a devolutiva comenta cada alternativa pela letra.
 */
const ALTERNATIVA_POR_LETRA =
  /\s+(?=A\s+alternativa\s+[A-E]\s+est[áã]o?\s+(?:correta|incorreta)\b)/g;

function separarAlternativaPorLetra(texto: string): string {
  return texto.replace(ALTERNATIVA_POR_LETRA, '\n\n');
}

/** "incorreta - <texto>" / "correta - <texto>" — prefixo de status por distrator. */
const PREFIXO_STATUS = /\s+(?=(?:incorreta|correta)\s*-\s)/gi;

function separarPrefixoStatus(texto: string): string {
  return texto.replace(PREFIXO_STATUS, '\n\n');
}

function separarRomanos(texto: string): string {
  const { maxSeq, marcador } = detectarEnumeracaoRomana(texto);
  if (maxSeq === 0) return texto;
  return separarItensRomanos(texto, maxSeq, marcador);
}

export function formatarExplicacao(texto: string | null | undefined): string {
  if (!texto) return '';
  let t = texto.replace(/\r\n/g, '\n');

  t = separarRotulos(t);
  t = separarAlternativaPorLetra(t);
  t = separarPrefixoStatus(t);
  t = separarRomanos(t);

  t = t.replace(/[ \t]+\n/g, '\n'); // remove espaços no fim das linhas
  t = t.replace(/\n{3,}/g, '\n\n'); // no máximo uma linha em branco
  return t.trim();
}
