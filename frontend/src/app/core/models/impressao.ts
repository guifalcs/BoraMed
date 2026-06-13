import type { QuestaoComAlternativas } from './questao';

/**
 * Payload de um simulado pronto para impressão.
 * `correta`/`explicacao` das questões vêm nulos quando o gabarito não está
 * liberado (aluno ainda não finalizou a prova e não é admin).
 */
export interface SimuladoImpressao {
  nome: string;
  qtdQuestoes: number;
  periodo: number | null;
  formato: string | null;
  questoes: QuestaoComAlternativas[];
  gabaritoLiberado: boolean;
}

export type TamanhoFonteImpressao = 'compacto' | 'normal' | 'grande';

/** Opções configuráveis na barra de impressão (não impressas). */
export interface OpcoesImpressao {
  cartaoResposta: boolean;
  marcacaoNaQuestao: boolean;
  mostrarTema: boolean;
  gabaritoAoFinal: boolean;
  explicacoesNoGabarito: boolean;
  mostrarImagens: boolean;
  tamanhoFonte: TamanhoFonteImpressao;
}

export const OPCOES_IMPRESSAO_PADRAO: OpcoesImpressao = {
  cartaoResposta: false,
  marcacaoNaQuestao: true,
  mostrarTema: true,
  gabaritoAoFinal: false,
  explicacoesNoGabarito: false,
  mostrarImagens: true,
  tamanhoFonte: 'normal',
};
