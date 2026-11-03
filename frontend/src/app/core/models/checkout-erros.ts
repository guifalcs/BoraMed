// Tradução dos erros devolvidos pelas edges de pagamento (mp-processar-*,
// mp-consultar-pagamento) para mensagens que o aluno entende. As edges
// misturam mensagens de produto em PT ("Você já tem um acesso ativo...") com
// erros técnicos de validação em inglês/minúsculas ("unauthorized",
// "invalid form_data", "installments deve ser entre 1 e 6"): estes nunca
// devem chegar à tela crus.

export const ERRO_PROCESSAMENTO =
  'Não foi possível processar o pagamento agora. Verifique sua conexão e tente novamente.';
export const ERRO_MUITAS_TENTATIVAS =
  'Muitas tentativas de pagamento em pouco tempo. Por segurança, aguarde 15 minutos para tentar de novo com cartão, ou pague com Pix agora.';
export const ERRO_SESSAO =
  'Sua sessão expirou. Saia e entre de novo na sua conta para concluir o pagamento. Nenhum valor foi cobrado.';
export const ERRO_PLANO_INDISPONIVEL =
  'Este plano não está disponível no momento. Volte aos planos e escolha outro.';
export const ERRO_REQUISICAO =
  'Não foi possível processar o pagamento. Atualize a página e tente novamente. Nenhum valor foi cobrado.';

/**
 * Mensagens de produto das edges começam com maiúscula ("Você...", "Este
 * cupom..."); as técnicas são minúsculas/inglês ("invalid form_data",
 * "unauthorized", "plano inativo", "attempt_id em uso").
 */
function ehMensagemTecnica(msg: string): boolean {
  const primeira = msg.trim().charAt(0);
  return primeira === '' || primeira !== primeira.toUpperCase() || /^MP_ACCESS_TOKEN/.test(msg);
}

/**
 * Mensagem final para um erro de edge.
 * @param status HTTP status da resposta (undefined = falha de rede/timeout)
 * @param msg    campo `error` do corpo, se houver
 * @param fallback          falha de rede/5xx sem mensagem de produto
 * @param fallbackRequisicao 4xx com erro técnico (dado inválido, sem rede envolvida)
 */
export function traduzirErroEdge(
  status: number | undefined,
  msg: string | null | undefined,
  fallback = ERRO_PROCESSAMENTO,
  fallbackRequisicao = ERRO_REQUISICAO,
): string {
  // Sem resposta (rede caiu, timeout, CORS): a mensagem de conexão é a certa.
  if (status === undefined) return fallback;
  // JWT expirado/inválido: o gateway responde 401 sem o campo `error`.
  if (status === 401) return ERRO_SESSAO;
  const texto = (msg ?? '').trim();
  if (texto && /^plano /i.test(texto)) return ERRO_PLANO_INDISPONIVEL;
  if (texto && !ehMensagemTecnica(texto)) return texto;
  if (status === 429) return ERRO_MUITAS_TENTATIVAS;
  if (status >= 500) return fallback;
  return fallbackRequisicao;
}
