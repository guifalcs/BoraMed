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

-- ativo=false: existe só para dar plano_id a uma assinatura de teste (abaixo),
-- nunca para aparecer em listarPlanos(). Ativo, colidia com o Avançado Mensal
-- real: mesmo (tier='avancado', frequency=1) por default de coluna, e o
-- .find() de planos.component.ts pegava o primeiro que casasse — às vezes
-- este de R$10, distorcendo o cálculo de desconto do semestral.
INSERT INTO public.plano (id, slug, nome, preco_centavos, ativo)
VALUES ('99999999-0000-0000-0000-000000000001','plano-dev-local','Plano Dev Local', 1000, false)
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

-- ============================================================================
-- Dados de teste locais para o módulo de Flashcards.
-- Decks oficiais + decks da comunidade (autor: flashcard-tester), para as
-- abas Oficiais/Comunidade e as sugestões da tela de conclusão.
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção.
-- ============================================================================

-- Autor dos decks da comunidade (mesmo usuário do smoke test de flashcards)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'flashcard-tester@boramed.com',
  crypt('Teste123!', gen_salt('bf')), now(),
  '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Flashcard Tester"}',
  now(), now(), false, false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assinatura (user_id, plano_id, status, proxima_cobranca, data_inicio)
SELECT '22222222-2222-2222-2222-222222222222', '99999999-0000-0000-0000-000000000001', 'authorized', now() + interval '90 days', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.assinatura WHERE user_id = '22222222-2222-2222-2222-222222222222' AND status = 'authorized'
);

INSERT INTO public.flashcard_decks (id, user_id, oficial, titulo, descricao, publico) VALUES
('f1a90000-0000-0000-0000-000000000001', NULL, true,  'Farmacologia — Conceitos Básicos', 'Deck oficial de revisão de farmacocinética.', true),
('f1a90000-0000-0000-0000-000000000002', NULL, true,  'Anatomia — Membro Superior', 'Deck oficial com estruturas do membro superior.', true),
('f1a90000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', false, 'Bioquímica — Ciclo de Krebs', 'Etapas e enzimas do ciclo do ácido cítrico.', true),
('f1a90000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', false, 'Histologia — Tecido Epitelial', 'Classificação e características dos epitélios.', true)
ON CONFLICT (id) DO NOTHING;

-- Cada deck oficial/comunidade com 12 cards (para testar scroll/carrossel);
-- alguns cards usam imagens estáticas da pasta public/ do frontend (placeholders
-- de teste, sem relação com o conteúdo real da lâmina/estrutura).
INSERT INTO public.flashcard_cards (id, deck_id, posicao, frente, verso, frente_imagem_url) VALUES
-- Farmacologia — Conceitos Básicos
('f1ca0000-0000-0000-0000-000000000001','f1a90000-0000-0000-0000-000000000001',0,'O que é meia-vida de eliminação?','Tempo para a concentração plasmática cair pela metade.',NULL),
('f1ca0000-0000-0000-0000-000000000002','f1a90000-0000-0000-0000-000000000001',1,'O que é biodisponibilidade?','Fração da dose que atinge a circulação sistêmica.',NULL),
('f1ca0000-0000-0000-0000-000000000003','f1a90000-0000-0000-0000-000000000001',2,'O que é clearance?','Volume de plasma depurado do fármaco por unidade de tempo.',NULL),
('f1ca0000-0000-0000-0000-000000000010','f1a90000-0000-0000-0000-000000000001',3,'O que é o volume de distribuição (Vd)?','Relação entre a quantidade de fármaco no corpo e sua concentração plasmática.',NULL),
('f1ca0000-0000-0000-0000-000000000011','f1a90000-0000-0000-0000-000000000001',4,'O que é o efeito de primeira passagem?','Metabolismo do fármaco no fígado antes de atingir a circulação sistêmica, reduzindo a fração biodisponível.',NULL),
('f1ca0000-0000-0000-0000-000000000012','f1a90000-0000-0000-0000-000000000001',5,'O que caracteriza a cinética de ordem zero?','Eliminação de quantidade constante de fármaco por unidade de tempo, independente da concentração.',NULL),
('f1ca0000-0000-0000-0000-000000000013','f1a90000-0000-0000-0000-000000000001',6,'O que caracteriza a cinética de primeira ordem?','Eliminação de uma fração constante do fármaco por unidade de tempo, proporcional à concentração.',NULL),
('f1ca0000-0000-0000-0000-000000000014','f1a90000-0000-0000-0000-000000000001',7,'O que é a janela terapêutica?','Intervalo entre a dose mínima eficaz e a dose tóxica.',NULL),
('f1ca0000-0000-0000-0000-000000000015','f1a90000-0000-0000-0000-000000000001',8,'O que é agonista parcial?','Fármaco que se liga ao receptor mas produz efeito máximo menor que um agonista total.',NULL),
('f1ca0000-0000-0000-0000-000000000016','f1a90000-0000-0000-0000-000000000001',9,'O que é antagonista competitivo?','Liga-se reversivelmente ao mesmo sítio do agonista, podendo ser deslocado por altas doses deste.',NULL),
('f1ca0000-0000-0000-0000-000000000017','f1a90000-0000-0000-0000-000000000001',10,'O que é tolerância farmacológica?','Redução da resposta a um fármaco após exposição repetida, exigindo doses maiores para o mesmo efeito.',NULL),
('f1ca0000-0000-0000-0000-000000000018','f1a90000-0000-0000-0000-000000000001',11,'O que é interação farmacocinética?','Alteração na absorção, distribuição, metabolismo ou excreção de um fármaco causada por outro.',NULL),
-- Anatomia — Membro Superior
('f1ca0000-0000-0000-0000-000000000004','f1a90000-0000-0000-0000-000000000002',0,'Quais ossos formam o antebraço?','Rádio e ulna.',NULL),
('f1ca0000-0000-0000-0000-000000000005','f1a90000-0000-0000-0000-000000000002',1,'Qual nervo passa pelo túnel do carpo?','Nervo mediano.',NULL),
('f1ca0000-0000-0000-0000-000000000019','f1a90000-0000-0000-0000-000000000002',2,'Qual músculo é o principal flexor do cotovelo?','Bíceps braquial.',NULL),
('f1ca0000-0000-0000-0000-000000000020','f1a90000-0000-0000-0000-000000000002',3,'Qual nervo inerva o músculo tríceps braquial?','Nervo radial.',NULL),
('f1ca0000-0000-0000-0000-000000000021','f1a90000-0000-0000-0000-000000000002',4,'Quais ossos formam a articulação do ombro?','Úmero e escápula (articulação glenoumeral).',NULL),
('f1ca0000-0000-0000-0000-000000000022','f1a90000-0000-0000-0000-000000000002',5,'Qual é o osso mais lateral do carpo, na fileira proximal?','Escafoide.',NULL),
('f1ca0000-0000-0000-0000-000000000023','f1a90000-0000-0000-0000-000000000002',6,'Qual nervo, quando lesado, causa a "mão em garra"?','Nervo ulnar.',NULL),
('f1ca0000-0000-0000-0000-000000000024','f1a90000-0000-0000-0000-000000000002',7,'Observe a imagem. Qual região anatômica está representada?','Membro superior — visão geral.','/landing-page/hero-image.webp'),
('f1ca0000-0000-0000-0000-000000000025','f1a90000-0000-0000-0000-000000000002',8,'Qual estrutura está evidenciada nesta ilustração?','Ilustração de referência para consulta rápida durante os estudos.','/landing-page/ilustracao-performance.webp'),
('f1ca0000-0000-0000-0000-000000000026','f1a90000-0000-0000-0000-000000000002',9,'Qual músculo forma o relevo do braço na face anterior?','Bíceps braquial.',NULL),
('f1ca0000-0000-0000-0000-000000000027','f1a90000-0000-0000-0000-000000000002',10,'Qual artéria é palpável na fossa cubital?','Artéria braquial.',NULL),
('f1ca0000-0000-0000-0000-000000000028','f1a90000-0000-0000-0000-000000000002',11,'Qual nervo é comprimido na síndrome do túnel do carpo?','Nervo mediano.',NULL),
-- Bioquímica — Ciclo de Krebs
('f1ca0000-0000-0000-0000-000000000006','f1a90000-0000-0000-0000-000000000003',0,'Qual enzima converte citrato em isocitrato?','Aconitase.',NULL),
('f1ca0000-0000-0000-0000-000000000007','f1a90000-0000-0000-0000-000000000003',1,'Quantos NADH são gerados por volta do ciclo?','3 NADH (+ 1 FADH2 e 1 GTP).',NULL),
('f1ca0000-0000-0000-0000-000000000029','f1a90000-0000-0000-0000-000000000003',2,'Onde ocorre o ciclo de Krebs na célula?','Matriz mitocondrial.',NULL),
('f1ca0000-0000-0000-0000-000000000030','f1a90000-0000-0000-0000-000000000003',3,'Qual molécula inicia o ciclo ao se combinar com oxaloacetato?','Acetil-CoA.',NULL),
('f1ca0000-0000-0000-0000-000000000031','f1a90000-0000-0000-0000-000000000003',4,'Qual enzima catalisa a descarboxilação oxidativa do α-cetoglutarato?','α-cetoglutarato desidrogenase.',NULL),
('f1ca0000-0000-0000-0000-000000000032','f1a90000-0000-0000-0000-000000000003',5,'Qual etapa do ciclo gera GTP diretamente?','Conversão de succinil-CoA em succinato, pela succinil-CoA sintetase.',NULL),
('f1ca0000-0000-0000-0000-000000000033','f1a90000-0000-0000-0000-000000000003',6,'Qual enzima do ciclo está ligada à membrana mitocondrial interna?','Succinato desidrogenase (também Complexo II da cadeia respiratória).',NULL),
('f1ca0000-0000-0000-0000-000000000034','f1a90000-0000-0000-0000-000000000003',7,'Qual reação regenera o oxaloacetato ao final do ciclo?','Oxidação do malato a oxaloacetato pela malato desidrogenase.',NULL),
('f1ca0000-0000-0000-0000-000000000035','f1a90000-0000-0000-0000-000000000003',8,'Quantas moléculas de CO2 são liberadas por volta do ciclo?','2 moléculas de CO2.',NULL),
('f1ca0000-0000-0000-0000-000000000036','f1a90000-0000-0000-0000-000000000003',9,'Qual coenzima é reduzida na conversão de succinato a fumarato?','FAD, a FADH2.',NULL),
('f1ca0000-0000-0000-0000-000000000037','f1a90000-0000-0000-0000-000000000003',10,'Qual o principal papel do ciclo de Krebs no metabolismo energético?','Gerar equivalentes redutores (NADH e FADH2) para a cadeia transportadora de elétrons.',NULL),
('f1ca0000-0000-0000-0000-000000000038','f1a90000-0000-0000-0000-000000000003',11,'Qual enzima é inibida por altas concentrações de ATP e NADH?','Isocitrato desidrogenase.',NULL),
-- Histologia — Tecido Epitelial
('f1ca0000-0000-0000-0000-000000000008','f1a90000-0000-0000-0000-000000000004',0,'O que caracteriza um epitélio estratificado?','Duas ou mais camadas de células.',NULL),
('f1ca0000-0000-0000-0000-000000000009','f1a90000-0000-0000-0000-000000000004',1,'Onde é encontrado o epitélio pseudoestratificado ciliado?','Vias respiratórias (traqueia, brônquios).',NULL),
('f1ca0000-0000-0000-0000-000000000039','f1a90000-0000-0000-0000-000000000004',2,'O que caracteriza um epitélio simples?','Uma única camada de células.',NULL),
('f1ca0000-0000-0000-0000-000000000040','f1a90000-0000-0000-0000-000000000004',3,'Qual tipo de epitélio reveste os alvéolos pulmonares?','Epitélio pavimentoso simples.',NULL),
('f1ca0000-0000-0000-0000-000000000041','f1a90000-0000-0000-0000-000000000004',4,'Qual tipo de epitélio reveste a bexiga urinária?','Epitélio de transição (urotélio).',NULL),
('f1ca0000-0000-0000-0000-000000000042','f1a90000-0000-0000-0000-000000000004',5,'Observe a lâmina. Que tipo de epitélio está representado?','Epitélio cilíndrico simples com microvilosidades — mucosa intestinal.','/landing-page/modo-laboratorio.webp'),
('f1ca0000-0000-0000-0000-000000000043','f1a90000-0000-0000-0000-000000000004',6,'Identifique a estrutura na lâmina histológica.','Corte de pele — epiderme com queratinócitos em diferentes camadas.','/illustrations/funny.webp'),
('f1ca0000-0000-0000-0000-000000000044','f1a90000-0000-0000-0000-000000000004',7,'Qual a função das microvilosidades no epitélio intestinal?','Aumentar a superfície de absorção.',NULL),
('f1ca0000-0000-0000-0000-000000000045','f1a90000-0000-0000-0000-000000000004',8,'O que são desmossomos?','Junções celulares que promovem adesão mecânica entre células epiteliais.',NULL),
('f1ca0000-0000-0000-0000-000000000046','f1a90000-0000-0000-0000-000000000004',9,'Qual epitélio reveste a superfície externa da pele?','Epitélio estratificado pavimentoso queratinizado.',NULL),
('f1ca0000-0000-0000-0000-000000000047','f1a90000-0000-0000-0000-000000000004',10,'O que caracteriza uma glândula exócrina?','Libera secreções através de ductos para superfícies epiteliais ou cavidades.',NULL),
('f1ca0000-0000-0000-0000-000000000048','f1a90000-0000-0000-0000-000000000004',11,'O que caracteriza uma glândula endócrina?','Libera secreções (hormônios) diretamente na corrente sanguínea, sem ductos.',NULL)
ON CONFLICT (id) DO NOTHING;
