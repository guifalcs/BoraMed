import { describe, expect, it } from 'vitest';
import { loginSchema, recoverPasswordSchema, resetPasswordSchema, signupSchema } from './auth.schemas';

describe('loginSchema', () => {
  it('aceita credenciais válidas', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'abc' });
    expect(result.success).toBe(true);
  });

  it('rejeita e-mail inválido', () => {
    const result = loginSchema.safeParse({ email: 'nao-email', password: 'abc' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('E-mail inválido');
  });

  it('rejeita senha vazia', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Senha obrigatória');
  });

  it('rejeita objeto vazio', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('signupSchema', () => {
  const valid = {
    fullName: 'João Silva',
    email: 'joao@example.com',
    password: 'Abc1234!',
    confirmPassword: 'Abc1234!',
  };

  it('aceita dados válidos', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it('rejeita nome muito curto', () => {
    const result = signupSchema.safeParse({ ...valid, fullName: 'J' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Nome muito curto');
  });

  it('rejeita e-mail inválido', () => {
    const result = signupSchema.safeParse({ ...valid, email: 'nao-email' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('E-mail inválido');
  });

  it('rejeita senha com menos de 8 caracteres', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'Ab1!', confirmPassword: 'Ab1!' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Mínimo 8 caracteres');
  });

  it('rejeita senha sem letra maiúscula', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'abc1234!', confirmPassword: 'abc1234!' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Deve ter letra maiúscula');
  });

  it('rejeita senha sem número', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'AbcAbcAb!', confirmPassword: 'AbcAbcAb!' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Deve ter número');
  });

  it('rejeita senha sem caractere especial', () => {
    const result = signupSchema.safeParse({ ...valid, password: 'Abcde123', confirmPassword: 'Abcde123' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Deve ter caractere especial');
  });

  it('rejeita quando confirmação não confere', () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: 'Abc1234@' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('As senhas não conferem');
  });
});

describe('recoverPasswordSchema', () => {
  it('aceita e-mail válido', () => {
    expect(recoverPasswordSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
  });

  it('rejeita e-mail inválido', () => {
    const result = recoverPasswordSchema.safeParse({ email: 'invalido' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('E-mail inválido');
  });
});

describe('resetPasswordSchema', () => {
  const valid = { password: 'Abc1234!', confirmPassword: 'Abc1234!' };

  it('aceita dados válidos', () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejeita senha fraca', () => {
    const result = resetPasswordSchema.safeParse({ password: 'fraca', confirmPassword: 'fraca' });
    expect(result.success).toBe(false);
  });

  it('rejeita quando confirmação não confere', () => {
    const result = resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'Outra1234!' });
    expect(result.success).toBe(false);
    const msgs = result.error!.issues.map((i) => i.message);
    expect(msgs).toContain('As senhas não conferem');
  });
});
