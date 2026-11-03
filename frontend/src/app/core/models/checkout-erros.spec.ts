import { describe, expect, it } from 'vitest';
import {
  ERRO_MUITAS_TENTATIVAS,
  ERRO_PLANO_INDISPONIVEL,
  ERRO_PROCESSAMENTO,
  ERRO_REQUISICAO,
  ERRO_SESSAO,
  traduzirErroEdge,
} from './checkout-erros';

describe('traduzirErroEdge', () => {
  it('falha de rede (sem status) usa a mensagem de conexão', () => {
    expect(traduzirErroEdge(undefined, null)).toBe(ERRO_PROCESSAMENTO);
  });

  it('401 vira sessão expirada, inclusive sem corpo (gateway do Supabase)', () => {
    expect(traduzirErroEdge(401, null)).toBe(ERRO_SESSAO);
    expect(traduzirErroEdge(401, 'unauthorized')).toBe(ERRO_SESSAO);
  });

  it('mantém as mensagens de produto da edge', () => {
    expect(traduzirErroEdge(409, 'Você já tem um acesso ativo no momento.')).toBe(
      'Você já tem um acesso ativo no momento.',
    );
    expect(traduzirErroEdge(400, 'Este cupom expirou.')).toBe('Este cupom expirou.');
    expect(traduzirErroEdge(502, 'Pagamento temporariamente indisponível. Tente novamente.')).toBe(
      'Pagamento temporariamente indisponível. Tente novamente.',
    );
  });

  it('nunca mostra erro técnico cru', () => {
    for (const tecnico of [
      'invalid form_data',
      'invalid attempt_id',
      'attempt_id em uso',
      'installments deve ser entre 1 e 6',
      'missing token',
    ]) {
      expect(traduzirErroEdge(400, tecnico), tecnico).toBe(ERRO_REQUISICAO);
    }
    expect(traduzirErroEdge(500, 'MP_ACCESS_TOKEN not configured')).toBe(ERRO_PROCESSAMENTO);
  });

  it('plano inexistente/inativo orienta voltar aos planos', () => {
    expect(traduzirErroEdge(404, 'plano não encontrado')).toBe(ERRO_PLANO_INDISPONIVEL);
    expect(traduzirErroEdge(400, 'plano inativo')).toBe(ERRO_PLANO_INDISPONIVEL);
  });

  it('429 sem mensagem de produto sugere esperar ou pagar com Pix', () => {
    expect(traduzirErroEdge(429, null)).toBe(ERRO_MUITAS_TENTATIVAS);
    expect(ERRO_MUITAS_TENTATIVAS).toMatch(/Pix/);
  });
});
