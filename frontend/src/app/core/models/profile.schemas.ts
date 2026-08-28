import { z } from 'zod';
import { TIPO_USUARIO_VALUES } from './auth.types';
import { FACULDADE_UNIDADE_VALUES } from './faculdade-unidade';

const strongPassword = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Deve ter letra maiúscula')
  .regex(/\d/, 'Deve ter número')
  .regex(/[^A-Za-z0-9]/, 'Deve ter caractere especial');

export const updateProfileSchema = z.object({
  nome_completo: z.string().min(2, 'Nome muito curto').trim(),
  tipo_usuario: z.enum(TIPO_USUARIO_VALUES, { message: 'Selecione seu perfil' }),
  periodo: z.number().min(1, 'Período inválido').max(12, 'Período inválido').nullable().optional(),
  faculdade_unidade: z.enum(FACULDADE_UNIDADE_VALUES).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateFaculdadeUnidadeSchema = z.object({
  faculdade_unidade: z.enum(FACULDADE_UNIDADE_VALUES, { message: 'Selecione sua unidade Afya' }),
});
export type UpdateFaculdadeUnidadeInput = z.infer<typeof updateFaculdadeUnidadeSchema>;

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
