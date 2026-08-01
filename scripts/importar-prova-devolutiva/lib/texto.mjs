/**
 * Utilitários de texto — reexportados do pipeline do TPI.
 *
 * `normalizar`, `colapsar`, `desdobrar`, `similaridade` e companhia não têm nada
 * de específico de TPI: são comparação e desdobramento de texto de PDF. Manter
 * uma cópia aqui criaria duas versões para divergir, então este arquivo existe
 * só para o caminho de import ficar local.
 */

export {
  normalizar,
  colapsar,
  tokens,
  similaridade,
  similaridadeVocabulario,
  desdobrar,
  diffPalavras,
  compararCampo,
} from '../../importar-prova-scan/lib/texto.mjs';
