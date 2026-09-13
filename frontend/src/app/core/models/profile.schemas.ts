import { z } from 'zod';
import { TIPO_USUARIO_VALUES } from './auth.types';
import { FACULDADE_UNIDADE_VALUES } from './faculdade-unidade';
import { PERIODO_MAX, PERIODO_MIN } from './periodo';

const periodoField = z
  .number({ message: 'Selecione seu período' })
  .int('Selecione seu período')
  .min(PERIODO_MIN, 'Selecione seu período')
  .max(PERIODO_MAX, 'Período inválido');

const strongPassword = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Deve ter letra maiúscula')
  .regex(/\d/, 'Deve ter número')
  .regex(/[^A-Za-z0-9]/, 'Deve ter caractere especial');

export const updateProfileSchema = z
  .object({
    nome_completo: z.string().min(2, 'Nome muito curto').trim(),
    tipo_usuario: z.enum(TIPO_USUARIO_VALUES, { message: 'Selecione seu perfil' }),
    periodo: periodoField.nullable().optional(),
    faculdade_unidade: z.enum(FACULDADE_UNIDADE_VALUES).nullable().optional(),
  })
  // Período é obrigatório para estudante de Medicina (único tipo oferecido hoje
  // e exigido já no cadastro). Tipos legados seguem podendo ficar sem período.
  .superRefine((data, ctx) => {
    if (data.tipo_usuario === 'estudante_medicina' && data.periodo == null) {
      ctx.addIssue({ code: 'custom', path: ['periodo'], message: 'Selecione seu período' });
    }
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateFaculdadeUnidadeSchema = z.object({
  faculdade_unidade: z.enum(FACULDADE_UNIDADE_VALUES, { message: 'Selecione sua unidade Afya' }),
});
export type UpdateFaculdadeUnidadeInput = z.infer<typeof updateFaculdadeUnidadeSchema>;

export const updatePeriodoSchema = z.object({ periodo: periodoField });
export type UpdatePeriodoInput = z.infer<typeof updatePeriodoSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual obrigatória'),
    newPassword: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
