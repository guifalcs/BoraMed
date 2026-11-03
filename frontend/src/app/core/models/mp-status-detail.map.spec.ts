import { describe, expect, it } from 'vitest';
import { mapStatusDetail, recusaPorLimite } from './mp-status-detail.map';

describe('mapStatusDetail', () => {
  it('cobre os status_detail de recusa vistos em produção', () => {
    // Todos os códigos já registrados em pagamento_intencao (nov/2026).
    const vistos = [
      'cc_rejected_high_risk',
      'cc_rejected_insufficient_amount',
      'cc_rejected_call_for_authorize',
      'cc_rejected_bad_filled_card_number',
      'cc_amount_rate_limit_exceeded',
      'cc_rejected_card_disabled',
      'card_rejected',
    ];
    for (const codigo of vistos) {
      expect(mapStatusDetail(codigo).titulo, codigo).not.toBe('Pagamento não aprovado');
    }
  });

  it('cobre os códigos da tabela oficial do MP que antes caíam no genérico', () => {
    for (const codigo of [
      'rejected_insufficient_data',
      'rejected_by_regulations',
      'rejected_high_risk',
      'bank_error',
      'cc_rejected_time_out',
      'cc_rejected_expired_operation',
    ]) {
      expect(mapStatusDetail(codigo).titulo, codigo).not.toBe('Pagamento não aprovado');
    }
  });

  it('antifraude orienta trocar de meio (Pix) em vez de repetir o cartão', () => {
    const info = mapStatusDetail('cc_rejected_high_risk');
    expect(info.acao).toBe('trocar_metodo');
    expect(info.mensagem).toMatch(/Pix/);
    expect(info.mensagem).toMatch(/mesmo cartão/);
  });

  it('limite insuficiente explica que o parcelado consome o limite total', () => {
    const info = mapStatusDetail('cc_rejected_insufficient_amount');
    expect(info.titulo).toBe('Saldo ou limite insuficiente');
    expect(info.mensagem).toMatch(/valor total/);
    expect(info.mensagem).toMatch(/Pix/);
  });

  it('usa o código-base quando o backend anexa o motivo bruto após ":"', () => {
    expect(
      mapStatusDetail('card_rejected:cc_val_433_credit_card_validation_has_failed').titulo,
    ).toBe('Cartão recusado');
    expect(mapStatusDetail('mp_request_error:2067').titulo).toBe('Não foi possível processar');
  });

  it('código desconhecido, vazio ou nulo cai no fallback com saída pelo Pix', () => {
    for (const d of ['cc_rejected_codigo_novo_do_mp', '', null, undefined]) {
      const info = mapStatusDetail(d);
      expect(info.titulo).toBe('Pagamento não aprovado');
      expect(info.mensagem).toMatch(/Pix/);
    }
  });

  it('análise antifraude pede para manter a página aberta', () => {
    expect(mapStatusDetail('pending_review_manual').mensagem).toMatch(/página aberta/);
    expect(mapStatusDetail('pending_contingency').acao).toBe('aguardar');
  });
});

describe('recusaPorLimite', () => {
  it('identifica recusas por limite/saldo (inclusive com sufixo)', () => {
    expect(recusaPorLimite('cc_rejected_insufficient_amount')).toBe(true);
    expect(recusaPorLimite('cc_amount_rate_limit_exceeded')).toBe(true);
    expect(recusaPorLimite('cc_rejected_insufficient_amount:extra')).toBe(true);
  });

  it('não confunde com outras recusas', () => {
    expect(recusaPorLimite('cc_rejected_high_risk')).toBe(false);
    expect(recusaPorLimite(null)).toBe(false);
    expect(recusaPorLimite('')).toBe(false);
  });
});
