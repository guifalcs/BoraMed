-- Estudante de Medicina passou a ser o único perfil oferecido no formulário de
-- /perfil. Normaliza os registros existentes (nulos e tipos legados) e faz com
-- que novos cadastros já nasçam com esse tipo.
--
-- O CHECK da coluna continua aceitando os demais valores: se voltarmos a
-- oferecer outros perfis, basta reexpor as opções no frontend.

UPDATE public.profiles
   SET tipo_usuario = 'estudante_medicina'
 WHERE tipo_usuario IS DISTINCT FROM 'estudante_medicina';

ALTER TABLE public.profiles
  ALTER COLUMN tipo_usuario SET DEFAULT 'estudante_medicina';
