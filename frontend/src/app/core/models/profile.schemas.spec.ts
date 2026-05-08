import { describe, it, expect } from 'vitest';
import { updateProfileSchema, changePasswordSchema } from './profile.schemas';

describe('updateProfileSchema', () => {
  const base = { nome_completo: 'João Silva', tipo_usuario: 'medico' as const };

  it('aceita dados válidos', () => {
    expect(updateProfileSchema.safeParse(base).success).toBe(true);
  });

  it('aceita todas as opções de tipo_usuario', () => {
    const tipos = ['estudante_medicina', 'medico', 'residente', 'cursinho', 'ensino_medio', 'outro'] as const;
    for (const tipo_usuario of tipos) {
      expect(updateProfileSchema.safeParse({ ...base, tipo_usuario }).success).toBe(true);
    }
  });

  it('rejeita nome_completo muito curto', () => {
    const result = updateProfileSchema.safeParse({ ...base, nome_completo: 'J' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Nome muito curto');
  });

  it('rejeita quando tipo_usuario está ausente', () => {
    const result = updateProfileSchema.safeParse({ nome_completo: 'João Silva' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe('tipo_usuario');
  });

  it('rejeita tipo_usuario inválido', () => {
    expect(updateProfileSchema.safeParse({ ...base, tipo_usuario: 'professor' }).success).toBe(false);
  });

  it('aceita periodo de 1 a 12', () => {
    expect(updateProfileSchema.safeParse({ ...base, tipo_usuario: 'estudante_medicina', periodo: 1 }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ ...base, tipo_usuario: 'estudante_medicina', periodo: 12 }).success).toBe(true);
  });

  it('rejeita periodo fora do intervalo', () => {
    expect(updateProfileSchema.safeParse({ ...base, tipo_usuario: 'estudante_medicina', periodo: 0 }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ ...base, tipo_usuario: 'estudante_medicina', periodo: 13 }).success).toBe(false);
  });

  it('aceita periodo nulo (perfil não-estudante)', () => {
    expect(updateProfileSchema.safeParse({ ...base, periodo: null }).success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  const valid = {
    currentPassword: 'senhaAtual123',
    newPassword: 'NovaSenha1!',
    confirmPassword: 'NovaSenha1!',
  };

  it('aceita troca de senha válida', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejeita currentPassword vazia', () => {
    const result = changePasswordSchema.safeParse({ ...valid, currentPassword: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Senha atual obrigatória');
  });

  it('rejeita nova senha sem letra maiúscula', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'semmaius1!', confirmPassword: 'semmaius1!' }).success).toBe(false);
  });

  it('rejeita nova senha sem número', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'SemNumero!', confirmPassword: 'SemNumero!' }).success).toBe(false);
  });

  it('rejeita nova senha sem caractere especial', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'SemEspecial1', confirmPassword: 'SemEspecial1' }).success).toBe(false);
  });

  it('rejeita nova senha com menos de 8 caracteres', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'Cu1!', confirmPassword: 'Cu1!' }).success).toBe(false);
  });

  it('rejeita confirmação diferente da nova senha', () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: 'Diferente1!' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('As senhas não conferem');
  });
});
