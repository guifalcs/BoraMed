-- Adiciona campo faculdade_rede ao perfil do estudante
ALTER TABLE public.profiles
  ADD COLUMN faculdade_rede TEXT
  CHECK (faculdade_rede IN ('rede_afya', 'outros'));
