import { describe, it, expect } from 'vitest';
import { TIER_UPGRADE_REQUIRED, isTierUpgradeError } from './tier-error.util';

describe('isTierUpgradeError', () => {
  it('detecta Error com mensagem tier_upgrade_required', () => {
    expect(isTierUpgradeError(new Error(`${TIER_UPGRADE_REQUIRED}: recurso disponivel apenas no plano Avancado`))).toBe(true);
  });

  it('detecta objeto PostgrestError-like com campo message', () => {
    expect(isTierUpgradeError({ message: `${TIER_UPGRADE_REQUIRED}: recurso disponivel apenas no plano Avancado` })).toBe(true);
  });

  it('retorna false para outros erros', () => {
    expect(isTierUpgradeError(new Error('subscription_required: assinatura ativa necessaria'))).toBe(false);
    expect(isTierUpgradeError({ message: 'algum outro erro' })).toBe(false);
  });

  it('retorna false para valores sem mensagem', () => {
    expect(isTierUpgradeError(null)).toBe(false);
    expect(isTierUpgradeError(undefined)).toBe(false);
    expect(isTierUpgradeError('string qualquer')).toBe(false);
  });
});
