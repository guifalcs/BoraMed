-- Usuário de teste para E2E (apenas ambiente local)
-- Credenciais: teste@boramed.com / Teste123!
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'teste@boramed.com',
  crypt('Teste123!', gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Usuário de Teste"}',
  now(),
  now(),
  false,
  false
) ON CONFLICT (id) DO NOTHING;
