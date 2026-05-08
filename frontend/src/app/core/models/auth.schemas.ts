import { z } from 'zod';

const emailField = z.string().email('E-mail inválido');

const strongPassword = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Deve ter letra maiúscula')
  .regex(/\d/, 'Deve ter número')
  .regex(/[^A-Za-z0-9]/, 'Deve ter caractere especial');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Senha obrigatória'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    fullName: z.string().min(2, 'Nome muito curto').trim(),
    email: emailField,
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const recoverPasswordSchema = z.object({ email: emailField });
export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
