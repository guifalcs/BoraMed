ALTER TABLE public.profiles
  ADD COLUMN faculdade_rede TEXT
  CHECK (faculdade_rede IN ('rede_afya', 'outros'));;
