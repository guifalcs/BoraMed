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

-- ============================================================================
-- Dados de teste locais para a feature de questões abertas (discursivas).
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção.
-- ============================================================================

-- Admin + assinatura ativa (paywall exige assinatura para iniciar tentativas)
UPDATE public.profiles
   SET papel = 'admin',
       nome_completo = COALESCE(nome_completo, 'Admin Teste')
 WHERE email = 'teste@boramed.com';

INSERT INTO public.plano (id, slug, nome, preco_centavos, ativo)
VALUES ('99999999-0000-0000-0000-000000000001','plano-dev-local','Plano Dev Local', 1000, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assinatura (user_id, plano_id, status, proxima_cobranca, data_inicio)
SELECT '11111111-1111-1111-1111-111111111111','99999999-0000-0000-0000-000000000001','authorized', now()+interval '90 days', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.assinatura
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='authorized'
);

-- Disciplina + temas
INSERT INTO public.disciplina (id, sigla, nome, periodo) VALUES
('aaaa0000-0000-0000-0000-000000000001','CARDIO','Cardiologia',5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tema (id, nome, disciplina_id) VALUES
('bbbb0000-0000-0000-0000-000000000001','Fisiologia Cardíaca','aaaa0000-0000-0000-0000-000000000001'),
('bbbb0000-0000-0000-0000-000000000002','Emergências Cardiológicas','aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Questões de múltipla escolha (para simulado misto/objetivo)
INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, disciplina_id) VALUES
('cccc0000-0000-0000-0000-000000000001','Qual íon é o principal responsável pela fase 0 do potencial de ação das fibras rápidas do miocárdio?','multipla_escolha','nacional','ativa','A fase 0 (despolarização rápida) das fibras rápidas depende do influxo de **Na⁺** pelos canais rápidos de sódio.','aaaa0000-0000-0000-0000-000000000001'),
('cccc0000-0000-0000-0000-000000000002','A tríade de Charcot está associada a qual condição?','multipla_escolha','nacional','ativa','Febre, icterícia e dor em hipocôndrio direito compõem a tríade de Charcot, sugestiva de **colangite aguda**.','aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem) VALUES
('cccc0000-0000-0000-0000-000000000001','A','Sódio (Na⁺)',true,1),
('cccc0000-0000-0000-0000-000000000001','B','Cálcio (Ca²⁺)',false,2),
('cccc0000-0000-0000-0000-000000000001','C','Potássio (K⁺)',false,3),
('cccc0000-0000-0000-0000-000000000002','A','Colangite aguda',true,1),
('cccc0000-0000-0000-0000-000000000002','B','Pancreatite',false,2),
('cccc0000-0000-0000-0000-000000000002','C','Apendicite',false,3)
ON CONFLICT DO NOTHING;

-- Questões discursivas com resposta modelo + pontos-chave
INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, resposta_modelo, pontos_chave, criterios_correcao, disciplina_id) VALUES
('dddd0000-0000-0000-0000-000000000001','Descreva a tríade de Charcot e sua relevância clínica.','resposta_aberta_curta','nacional','ativa',
 'A tríade de Charcot é composta por **febre**, **icterícia** e **dor em hipocôndrio direito**, e sugere colangite aguda — uma emergência que exige antibioticoterapia e drenagem biliar.',
 '["Cita febre","Cita icterícia","Cita dor em hipocôndrio direito","Associa a colangite"]'::jsonb,
 'Resposta curta e objetiva; valorizar a associação com colangite.','aaaa0000-0000-0000-0000-000000000001'),
('dddd0000-0000-0000-0000-000000000002','Explique a diferença entre resposta rápida e resposta lenta no potencial de ação cardíaco.','resposta_aberta_curta','nacional','ativa',
 'A **resposta rápida** (ventrículos, átrios, Purkinje) depende de canais rápidos de **Na⁺** com despolarização abrupta; a **resposta lenta** (nódulos SA e AV) depende de canais de **Ca²⁺** tipo L, com despolarização gradual e automaticidade.',
 '["Menciona canais de sódio","Menciona canais de cálcio","Cita nódulos SA/AV","Cita automaticidade"]'::jsonb,
 'Espera-se distinção clara entre os dois tipos.','aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.questao_tema (questao_id, tema_id) VALUES
('cccc0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001'),
('cccc0000-0000-0000-0000-000000000002','bbbb0000-0000-0000-0000-000000000002'),
('dddd0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000002'),
('dddd0000-0000-0000-0000-000000000002','bbbb0000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Marca o onboarding como concluído para o usuário de teste (evita o tour
-- cobrir a tela nos e2e).
INSERT INTO public.user_onboarding_state (user_id, flow_key, flow_version, status, completed_at)
VALUES ('11111111-1111-1111-1111-111111111111','dashboard_intro',1,'completed', now())
ON CONFLICT (user_id, flow_key, flow_version) DO UPDATE SET status='completed', completed_at=now();
