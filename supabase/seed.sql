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
-- faculdade_unidade/periodo preenchidos: sem eles o modal de dados
-- obrigatórios cobre a tela e bloqueia qualquer outro modal (aviso, pesquisa).
UPDATE public.profiles
   SET papel = 'admin',
       nome_completo = COALESCE(nome_completo, 'Admin Teste'),
       faculdade_unidade = COALESCE(faculdade_unidade, 'ipatinga_mg'),
       periodo = COALESCE(periodo, 5)
 WHERE email = 'teste@boramed.com';

UPDATE public.profiles
   SET faculdade_unidade = COALESCE(faculdade_unidade, 'ipatinga_mg'),
       periodo = COALESCE(periodo, 6)
 WHERE email <> 'teste@boramed.com';

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

-- ============================================================================
-- Preço do plano Essencial: alinha o banco local ao valor real de produção.
-- As linhas essencial-mensal/essencial-semestral vêm de uma migration já
-- aplicada (20260717140000_plano_tier_essencial) com o preço de quando foram
-- criadas. Produção teve o preço ajustado depois por UPDATE direto (preço é
-- dado, muda sem migration — ver docs/business-rules.md) e o banco local
-- nunca foi re-sincronizado à mão, causando as telas autenticadas (/planos,
-- /checkout) a mostrar R$29,90/R$119,40 em vez dos R$23,90/R$83,40 reais.
-- NUNCA aplicar em produção — lá o preço já está correto.
-- ============================================================================
UPDATE public.plano SET preco_centavos = 2390 WHERE slug = 'essencial-mensal';
UPDATE public.plano SET preco_centavos = 8340 WHERE slug = 'essencial-semestral';

-- ============================================================================
-- Simulados de teste para o free tier (2 nacionais + 1 bloqueado).
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção — a prova
-- SOI I N1 2025.2 é conteúdo real, seedado por migration; classificá-la aqui
-- (formato/publicada) é só para o dashboard local ter treino nacional visível
-- sem afetar o estado dela em produção, que segue por decisão do time de
-- conteúdo via /admin/provas.
-- ============================================================================

-- Corrige de quebra o qtd_questoes=0 herdado de antes da coluna existir —
-- sem isso o botão "Iniciar" fica desabilitado mesmo com 13 questões ativas.
UPDATE public.prova
   SET formato = 'nacional',
       rede = 'afya',
       subtipo = 'N1',
       publicada = true,
       qtd_questoes = (SELECT count(*) FROM public.prova_questao pq WHERE pq.prova_id = prova.id)
 WHERE id = 'bbbbbbbb-0001-0000-0000-000000000001';

-- Segundo treino nacional: reaproveita as 4 questões de Cardiologia (2
-- múltipla escolha + 2 discursivas) definidas acima, sem prova até aqui —
-- testa formato misto e a correção da Aurora nas discursivas.
INSERT INTO public.prova (id, nome, tipo, origem, formato, rede, periodo, subtipo, publicada, arquivada, disciplina_id)
VALUES (
  'bbbbbbbb-0004-0000-0000-000000000004',
  'Treino Nacional — Cardiologia', 'autoral', 'autoral', 'nacional', 'afya',
  5, 'N1', true, false, 'aaaa0000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET
  formato = excluded.formato, rede = excluded.rede, publicada = excluded.publicada;

INSERT INTO public.prova_questao (prova_id, questao_id, ordem)
SELECT 'bbbbbbbb-0004-0000-0000-000000000004', id, row_number() OVER (ORDER BY criado_em)
FROM public.questao
WHERE id IN (
  'cccc0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000002',
  'dddd0000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000002'
)
ON CONFLICT DO NOTHING;

UPDATE public.prova
   SET qtd_questoes = (SELECT count(*) FROM public.prova_questao pq WHERE pq.prova_id = prova.id)
 WHERE id = 'bbbbbbbb-0004-0000-0000-000000000004';

-- Duas questões processuais mínimas — só para exercitar o bloqueio de nível
-- (gratuito/essencial não acessam formato != 'nacional'). O conteúdo nunca
-- chega a ser exibido: iniciar_tentativa recusa antes de montar a prova.
INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, disciplina_id) VALUES
('eeee0000-0000-0000-0000-000000000001',
 'Paciente de 45 anos chega à consulta relatando dor torácica há 2 horas. Qual é a primeira conduta na anamnese direcionada?',
 'multipla_escolha', 'processual', 'ativa',
 'A caracterização da dor (início, localização, irradiação, fatores de melhora/piora) precede o exame físico e orienta as hipóteses diagnósticas.',
 'aaaa0000-0000-0000-0000-000000000001'),
('eeee0000-0000-0000-0000-000000000002',
 'Durante o exame físico cardiovascular, qual é a sequência correta de inspeção, palpação e ausculta?',
 'multipla_escolha', 'processual', 'ativa',
 'A sequência semiológica clássica é inspeção, palpação, percussão e ausculta, preservando achados que a manipulação poderia mascarar.',
 'aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem) VALUES
('eeee0000-0000-0000-0000-000000000001', 'A', 'Caracterizar a dor: início, localização, irradiação e fatores de melhora/piora', true, 1),
('eeee0000-0000-0000-0000-000000000001', 'B', 'Solicitar exames laboratoriais imediatamente', false, 2),
('eeee0000-0000-0000-0000-000000000001', 'C', 'Iniciar o exame físico antes de qualquer pergunta', false, 3),
('eeee0000-0000-0000-0000-000000000002', 'A', 'Ausculta, palpação, inspeção', false, 1),
('eeee0000-0000-0000-0000-000000000002', 'B', 'Inspeção, palpação, ausculta', true, 2),
('eeee0000-0000-0000-0000-000000000002', 'C', 'Palpação, ausculta, inspeção', false, 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.prova (id, nome, tipo, origem, formato, rede, periodo, publicada, arquivada, disciplina_id)
VALUES (
  'bbbbbbbb-0003-0000-0000-000000000003',
  'Simulado Processual — Anamnese e Exame Físico', 'autoral', 'autoral', 'processual', 'afya',
  1, true, false, 'aaaa0000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO UPDATE SET
  nome = excluded.nome, formato = excluded.formato, publicada = excluded.publicada;

INSERT INTO public.prova_questao (prova_id, questao_id, ordem) VALUES
('bbbbbbbb-0003-0000-0000-000000000003', 'eeee0000-0000-0000-0000-000000000001', 1),
('bbbbbbbb-0003-0000-0000-000000000003', 'eeee0000-0000-0000-0000-000000000002', 2)
ON CONFLICT DO NOTHING;

UPDATE public.prova SET qtd_questoes = 2 WHERE id = 'bbbbbbbb-0003-0000-0000-000000000003';

-- ============================================================================
-- Casos clínicos longos para testar o marca-texto (grifos) da prova.
-- O que a feature precisa e o resto do seed não tinha: texto de apoio de
-- verdade, enunciado com Markdown (negrito, lista) e cinco alternativas
-- extensas — o material que o aluno grifaria numa prova impressa.
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção.
-- ============================================================================

INSERT INTO public.questao (id, enunciado_apoio, enunciado, formato, tipo_questao, status, explicacao, referencia, disciplina_id) VALUES
('cccc0000-0000-0000-0000-000000000003',
 E'Homem de 58 anos, tabagista de longa data (40 anos-maço) e hipertenso em uso irregular de losartana, procura a emergência com **dor torácica retroesternal em aperto** iniciada há 2 horas, de forte intensidade, com irradiação para o membro superior esquerdo e mandíbula, acompanhada de sudorese fria, náuseas e sensação de morte iminente. Relata episódios semelhantes, porém mais leves e desencadeados por esforço, nas últimas três semanas.

Ao exame: regular estado geral, descorado 1+/4+, sudoreico. PA 158 x 96 mmHg, FC 104 bpm, FR 22 irpm, SatO₂ 95% em ar ambiente. Ausculta cardíaca com ritmo regular em 2 tempos, bulhas hipofonéticas, presença de **B4**, sem sopros. Ausculta pulmonar com estertores crepitantes em bases. Pulsos periféricos simétricos e cheios.

O eletrocardiograma realizado na admissão evidencia supradesnivelamento do segmento ST de 3 mm em V1 a V4, com imagem em espelho na parede inferior.',
 E'Considerando o quadro clínico, o exame físico e o eletrocardiograma descritos, qual é a **conduta inicial mais adequada** para este paciente?',
 'multipla_escolha', 'nacional', 'ativa',
 E'O quadro é de **infarto agudo do miocárdio com supradesnivelamento de ST (IAMCSST) de parede anterior extensa**. Na presença de supra de ST com menos de 12 horas de evolução, a prioridade absoluta é a **terapia de reperfusão**, preferencialmente angioplastia primária, com meta porta-balão de até 90 minutos. A dupla antiagregação e a anticoagulação acompanham a reperfusão, não a substituem. Solicitar troponina seriada e aguardar o resultado atrasa a reperfusão e piora o prognóstico — com supra de ST, o diagnóstico é eletrocardiográfico.',
 'Diretriz da Sociedade Brasileira de Cardiologia sobre Síndromes Coronarianas Agudas.',
 'aaaa0000-0000-0000-0000-000000000001'),
('cccc0000-0000-0000-0000-000000000004',
 E'Mulher de 34 anos, previamente hígida, chega ao pronto-socorro com **dispneia súbita** e dor torácica ventilatório-dependente iniciadas há 6 horas. Fez viagem aérea de 11 horas há 3 dias e usa anticoncepcional oral combinado há 8 anos. Nega febre, tosse ou trauma.

Ao exame: taquipneica, ansiosa. PA 108 x 70 mmHg, FC 118 bpm, FR 28 irpm, SatO₂ 89% em ar ambiente. Ausculta pulmonar sem ruídos adventícios. Membro inferior direito com **edema assimétrico** e dor à palpação da panturrilha.

Exames iniciais:

- Gasometria arterial: pH 7,49 | pCO₂ 28 mmHg | pO₂ 58 mmHg
- D-dímero: 3.200 ng/mL
- Radiografia de tórax: sem alterações significativas
- ECG: taquicardia sinusal com padrão S1Q3T3',
 E'Diante da principal hipótese diagnóstica, qual exame deve ser solicitado para **confirmação** e qual conduta deve ser adotada **enquanto se aguarda o resultado**?',
 'multipla_escolha', 'nacional', 'ativa',
 E'O quadro é clássico de **tromboembolismo pulmonar (TEP)**: fatores de risco (viagem prolongada, anticoncepcional), dispneia súbita, hipoxemia com alcalose respiratória, sinais de trombose venosa profunda e S1Q3T3. O exame confirmatório de escolha é a **angiotomografia de tórax**. Como a probabilidade clínica é alta e a paciente está hemodinamicamente estável, a **anticoagulação plena deve ser iniciada empiricamente**, antes mesmo do resultado — o risco de aguardar supera o risco do sangramento. Trombólise só entra no TEP maciço com instabilidade hemodinâmica, o que não é o caso.',
 'Diretriz de Tromboembolismo Venoso — Sociedade Brasileira de Angiologia e Cirurgia Vascular.',
 'aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem) VALUES
('cccc0000-0000-0000-0000-000000000003','A','Solicitar troponina ultrassensível seriada e aguardar o resultado antes de definir a conduta, mantendo o paciente em observação com monitorização contínua.',false,1),
('cccc0000-0000-0000-0000-000000000003','B','Acionar imediatamente a terapia de reperfusão, com angioplastia primária como primeira escolha, associada a dupla antiagregação plaquetária e anticoagulação.',true,2),
('cccc0000-0000-0000-0000-000000000003','C','Administrar nitrato sublingual e morfina, reavaliar o eletrocardiograma em 6 horas e encaminhar para teste ergométrico ambulatorial se houver melhora da dor.',false,3),
('cccc0000-0000-0000-0000-000000000003','D','Iniciar apenas anticoagulação plena com heparina não fracionada e encaminhar o paciente para cateterismo eletivo em até 72 horas da admissão.',false,4),
('cccc0000-0000-0000-0000-000000000003','E','Solicitar ecocardiograma transtorácico de urgência para avaliar a contratilidade segmentar antes de indicar qualquer estratégia de reperfusão.',false,5),
('cccc0000-0000-0000-0000-000000000004','A','Cintilografia de ventilação-perfusão, mantendo apenas oxigenoterapia e analgesia até a definição diagnóstica pelo exame de imagem.',false,1),
('cccc0000-0000-0000-0000-000000000004','B','Angiotomografia de tórax, iniciando anticoagulação plena empiricamente por se tratar de alta probabilidade clínica com paciente estável.',true,2),
('cccc0000-0000-0000-0000-000000000004','C','Angiotomografia de tórax, com trombólise sistêmica imediata pela gravidade da hipoxemia apresentada na gasometria arterial.',false,3),
('cccc0000-0000-0000-0000-000000000004','D','Ecocardiograma transtorácico, aguardando sinais de sobrecarga de ventrículo direito para então iniciar qualquer terapia antitrombótica.',false,4),
('cccc0000-0000-0000-0000-000000000004','E','Ultrassonografia com Doppler de membros inferiores, postergando a anticoagulação até a confirmação de trombose venosa profunda.',false,5)
ON CONFLICT DO NOTHING;

INSERT INTO public.questao_tema (questao_id, tema_id) VALUES
('cccc0000-0000-0000-0000-000000000003','bbbb0000-0000-0000-0000-000000000002'),
('cccc0000-0000-0000-0000-000000000004','bbbb0000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- Entram no treino nacional de Cardiologia, nas duas primeiras posições: o
-- caso clínico longo é o que exercita o marca-texto logo na abertura da prova.
INSERT INTO public.prova_questao (prova_id, questao_id, ordem) VALUES
('bbbbbbbb-0004-0000-0000-000000000004','cccc0000-0000-0000-0000-000000000003',0),
('bbbbbbbb-0004-0000-0000-000000000004','cccc0000-0000-0000-0000-000000000004',1)
ON CONFLICT DO NOTHING;

UPDATE public.prova
   SET qtd_questoes = (SELECT count(*) FROM public.prova_questao pq WHERE pq.prova_id = prova.id)
 WHERE id = 'bbbbbbbb-0004-0000-0000-000000000004';

-- ============================================================================
-- Dados de teste locais do módulo de Pesquisas.
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção.
--
--   Pesquisa A → no ar, sem respostas: é a que aparece no modal ao entrar.
--   Pesquisa B → despublicada e já respondida por 6 alunos sintéticos: serve
--                para conferir a tela de resultados com dado de verdade.
--   Pesquisa C → no ar, mas só para o plano gratuito: prova o recorte por
--                segmento (o usuário de teste é assinante e NÃO deve vê-la).
-- ============================================================================

-- ─── Alunos sintéticos (só para popular os resultados da Pesquisa B) ─────────
DO $$
DECLARE
  v_i INT;
  v_id UUID;
BEGIN
  FOR v_i IN 1..6 LOOP
    v_id := ('a5544444-0000-0000-0000-00000000000' || v_i)::UUID;
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
    ) VALUES (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'aluno-pesquisa-' || v_i || '@boramed.com',
      crypt('Teste123!', gen_salt('bf')), now(),
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}',
      ('{"full_name":"Aluno Pesquisa ' || v_i || '"}')::jsonb,
      now(), now(), false, false
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ─── Pesquisa A: no ar, é a que o modal exibe ───────────────────────────────
INSERT INTO public.pesquisa (id, titulo, descricao, segmento, ativa) VALUES (
  'a5511111-0000-0000-0000-000000000001',
  'Como está sendo sua experiência no BoraMed?',
  'São 5 perguntas rápidas. Só a primeira é obrigatória — suas respostas definem o que a gente constrói no próximo mês.',
  'todos', true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pesquisa_pergunta (id, pesquisa_id, ordem, tipo, enunciado, ajuda, obrigatoria, escala_min, escala_max, escala_min_label, escala_max_label) VALUES
('a5522222-0000-0000-0000-000000000001','a5511111-0000-0000-0000-000000000001',1,'nps','De 0 a 10, o quanto você recomendaria o BoraMed para um colega de turma?',NULL,true,1,5,NULL,NULL),
('a5522222-0000-0000-0000-000000000002','a5511111-0000-0000-0000-000000000001',2,'escolha_unica','Qual módulo você mais usa hoje?',NULL,false,1,5,NULL,NULL),
('a5522222-0000-0000-0000-000000000003','a5511111-0000-0000-0000-000000000001',3,'multipla_escolha','O que você gostaria de ver primeiro na plataforma?','Pode marcar mais de uma.',false,1,5,NULL,NULL),
('a5522222-0000-0000-0000-000000000004','a5511111-0000-0000-0000-000000000001',4,'escala','O quanto as explicações das questões te ajudam a entender o erro?',NULL,false,1,5,'Pouco','Muito'),
('a5522222-0000-0000-0000-000000000005','a5511111-0000-0000-0000-000000000001',5,'texto_longo','O que mais faz falta hoje no BoraMed?',NULL,false,1,5,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pesquisa_opcao (id, pergunta_id, ordem, label) VALUES
('a5533333-0000-0000-0000-000000000001','a5522222-0000-0000-0000-000000000002',1,'Treinos nacionais'),
('a5533333-0000-0000-0000-000000000002','a5522222-0000-0000-0000-000000000002',2,'Simulados montados por tema'),
('a5533333-0000-0000-0000-000000000003','a5522222-0000-0000-0000-000000000002',3,'Flashcards'),
('a5533333-0000-0000-0000-000000000004','a5522222-0000-0000-0000-000000000002',4,'Materiais'),
('a5533333-0000-0000-0000-000000000005','a5522222-0000-0000-0000-000000000003',1,'Mais questões de laboratório'),
('a5533333-0000-0000-0000-000000000006','a5522222-0000-0000-0000-000000000003',2,'Correção discursiva mais detalhada'),
('a5533333-0000-0000-0000-000000000007','a5522222-0000-0000-0000-000000000003',3,'Aplicativo para celular'),
('a5533333-0000-0000-0000-000000000008','a5522222-0000-0000-0000-000000000003',4,'Ranking entre amigos')
ON CONFLICT (id) DO NOTHING;

-- ─── Pesquisa B: já rodou e tem respostas (tela de resultados) ───────────────
INSERT INTO public.pesquisa (id, titulo, descricao, segmento, ativa) VALUES (
  'a5511111-0000-0000-0000-000000000002',
  'Sondagem de conteúdo — 2026.1',
  'Rodou no começo do semestre para decidir a ordem do acervo.',
  'todos', false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pesquisa_pergunta (id, pesquisa_id, ordem, tipo, enunciado, ajuda, obrigatoria, escala_min, escala_max, escala_min_label, escala_max_label) VALUES
('a5522222-0000-0000-0000-000000000011','a5511111-0000-0000-0000-000000000002',1,'nps','De 0 a 10, o quanto você recomendaria o BoraMed?',NULL,true,1,5,NULL,NULL),
('a5522222-0000-0000-0000-000000000012','a5511111-0000-0000-0000-000000000002',2,'escolha_unica','Qual disciplina você mais quer no acervo?',NULL,false,1,5,NULL,NULL),
('a5522222-0000-0000-0000-000000000013','a5511111-0000-0000-0000-000000000002',3,'escala','O quanto o nível das questões está compatível com as provas da sua faculdade?',NULL,false,1,5,'Muito fácil','Muito difícil'),
('a5522222-0000-0000-0000-000000000014','a5511111-0000-0000-0000-000000000002',4,'texto_longo','Alguma coisa que te irritou usando a plataforma?',NULL,false,1,5,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pesquisa_opcao (id, pergunta_id, ordem, label) VALUES
('a5533333-0000-0000-0000-000000000011','a5522222-0000-0000-0000-000000000012',1,'Clínica médica'),
('a5533333-0000-0000-0000-000000000012','a5522222-0000-0000-0000-000000000012',2,'Pediatria'),
('a5533333-0000-0000-0000-000000000013','a5522222-0000-0000-0000-000000000012',3,'Ginecologia e obstetrícia'),
('a5533333-0000-0000-0000-000000000014','a5522222-0000-0000-0000-000000000012',4,'Cirurgia')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pesquisa_resposta (id, pesquisa_id, user_id, criado_em) VALUES
('a5555555-0000-0000-0000-000000000001','a5511111-0000-0000-0000-000000000002','a5544444-0000-0000-0000-000000000001', now() - interval '9 days'),
('a5555555-0000-0000-0000-000000000002','a5511111-0000-0000-0000-000000000002','a5544444-0000-0000-0000-000000000002', now() - interval '8 days'),
('a5555555-0000-0000-0000-000000000003','a5511111-0000-0000-0000-000000000002','a5544444-0000-0000-0000-000000000003', now() - interval '7 days'),
('a5555555-0000-0000-0000-000000000004','a5511111-0000-0000-0000-000000000002','a5544444-0000-0000-0000-000000000004', now() - interval '6 days'),
('a5555555-0000-0000-0000-000000000005','a5511111-0000-0000-0000-000000000002','a5544444-0000-0000-0000-000000000005', now() - interval '5 days'),
('a5555555-0000-0000-0000-000000000006','a5511111-0000-0000-0000-000000000002','a5544444-0000-0000-0000-000000000006', now() - interval '4 days')
ON CONFLICT (id) DO NOTHING;

-- NPS: 10, 9, 8, 10, 6, 9 → 4 promotores, 1 neutro, 1 detrator = 50
INSERT INTO public.pesquisa_resposta_item (resposta_id, pergunta_id, valor_numero) VALUES
('a5555555-0000-0000-0000-000000000001','a5522222-0000-0000-0000-000000000011',10),
('a5555555-0000-0000-0000-000000000002','a5522222-0000-0000-0000-000000000011',9),
('a5555555-0000-0000-0000-000000000003','a5522222-0000-0000-0000-000000000011',8),
('a5555555-0000-0000-0000-000000000004','a5522222-0000-0000-0000-000000000011',10),
('a5555555-0000-0000-0000-000000000005','a5522222-0000-0000-0000-000000000011',6),
('a5555555-0000-0000-0000-000000000006','a5522222-0000-0000-0000-000000000011',9)
ON CONFLICT (resposta_id, pergunta_id) DO NOTHING;

INSERT INTO public.pesquisa_resposta_item (resposta_id, pergunta_id, opcao_ids) VALUES
('a5555555-0000-0000-0000-000000000001','a5522222-0000-0000-0000-000000000012','{a5533333-0000-0000-0000-000000000011}'),
('a5555555-0000-0000-0000-000000000002','a5522222-0000-0000-0000-000000000012','{a5533333-0000-0000-0000-000000000012}'),
('a5555555-0000-0000-0000-000000000003','a5522222-0000-0000-0000-000000000012','{a5533333-0000-0000-0000-000000000011}'),
('a5555555-0000-0000-0000-000000000004','a5522222-0000-0000-0000-000000000012','{a5533333-0000-0000-0000-000000000014}'),
('a5555555-0000-0000-0000-000000000005','a5522222-0000-0000-0000-000000000012','{a5533333-0000-0000-0000-000000000011}'),
('a5555555-0000-0000-0000-000000000006','a5522222-0000-0000-0000-000000000012','{a5533333-0000-0000-0000-000000000013}')
ON CONFLICT (resposta_id, pergunta_id) DO NOTHING;

INSERT INTO public.pesquisa_resposta_item (resposta_id, pergunta_id, valor_numero) VALUES
('a5555555-0000-0000-0000-000000000001','a5522222-0000-0000-0000-000000000013',4),
('a5555555-0000-0000-0000-000000000002','a5522222-0000-0000-0000-000000000013',3),
('a5555555-0000-0000-0000-000000000003','a5522222-0000-0000-0000-000000000013',5),
('a5555555-0000-0000-0000-000000000004','a5522222-0000-0000-0000-000000000013',4),
('a5555555-0000-0000-0000-000000000006','a5522222-0000-0000-0000-000000000013',3)
ON CONFLICT (resposta_id, pergunta_id) DO NOTHING;

INSERT INTO public.pesquisa_resposta_item (resposta_id, pergunta_id, valor_texto) VALUES
('a5555555-0000-0000-0000-000000000001','a5522222-0000-0000-0000-000000000014','As imagens das questões de laboratório demoram para carregar no 4G.'),
('a5555555-0000-0000-0000-000000000003','a5522222-0000-0000-0000-000000000014','Queria poder pausar o simulado e voltar depois sem perder o tempo corrido.'),
('a5555555-0000-0000-0000-000000000005','a5522222-0000-0000-0000-000000000014','Nada me irritou, só senti falta de mais questões de pediatria mesmo.')
ON CONFLICT (resposta_id, pergunta_id) DO NOTHING;

-- Dois alunos viram a pesquisa e fecharam: alimenta a taxa de resposta.
INSERT INTO public.pesquisa_dispensa (pesquisa_id, user_id) VALUES
('a5511111-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
('a5511111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- ─── Pesquisa C: no ar, mas fora do segmento do usuário de teste ────────────
INSERT INTO public.pesquisa (id, titulo, descricao, segmento, ativa) VALUES (
  'a5511111-0000-0000-0000-000000000003',
  'O que te faria assinar o BoraMed?',
  'Esta só aparece para quem está no plano gratuito — o usuário de teste é assinante e não deve vê-la.',
  'gratuitos', true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pesquisa_pergunta (id, pesquisa_id, ordem, tipo, enunciado, ajuda, obrigatoria, escala_min, escala_max, escala_min_label, escala_max_label) VALUES
('a5522222-0000-0000-0000-000000000021','a5511111-0000-0000-0000-000000000003',1,'texto_curto','O que falta para você assinar?',NULL,false,1,5,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Caderno de Erros: 1 questão processual + 1 de laboratório (as nacionais já
-- existem lá em cima: cccc0000...0001/0002), e uma tentativa FINALIZADA do
-- usuário de teste com 1 acerto e 3 erros propositais (1 por tipo_questao),
-- para o Caderno de Erros nascer populado em dev.
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção.
-- ============================================================================

INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, disciplina_id) VALUES
('caad0000-0000-0000-0000-000000000001','[Processual] Paciente com dor abdominal em fossa ilíaca direita e sinal de Blumberg positivo. Qual a conduta inicial mais apropriada?','multipla_escolha','processual','ativa','Sinais de irritação peritoneal em fossa ilíaca direita sugerem apendicite aguda — a conduta inicial é solicitar exames complementares e indicar avaliação cirúrgica precoce.','aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem) VALUES
('caad0000-0000-0000-0000-000000000001','A','Solicitar avaliação cirúrgica e exames complementares',true,1),
('caad0000-0000-0000-0000-000000000001','B','Prescrever analgésico e reavaliar em 7 dias',false,2),
('caad0000-0000-0000-0000-000000000001','C','Alta com orientações gerais',false,3)
ON CONFLICT DO NOTHING;

INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, imagem_url, imagem_legenda, disciplina_id) VALUES
('caad0000-0000-0000-0000-000000000002','Observe a lâmina histológica. Qual tipo de epitélio está representado?','multipla_escolha','laboratorio','ativa','A lâmina mostra epitélio cilíndrico simples com microvilosidades, típico da mucosa intestinal.','/landing-page/modo-laboratorio.webp','Lâmina de mucosa intestinal (HE, 40x)','aaaa0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem) VALUES
('caad0000-0000-0000-0000-000000000002','A','Epitélio cilíndrico simples',true,1),
('caad0000-0000-0000-0000-000000000002','B','Epitélio pavimentoso estratificado',false,2),
('caad0000-0000-0000-0000-000000000002','C','Epitélio de transição',false,3)
ON CONFLICT DO NOTHING;

INSERT INTO public.questao_tema (questao_id, tema_id) VALUES
('caad0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000002'),
('caad0000-0000-0000-0000-000000000002','bbbb0000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Duas nacionais SEM TEMA, pra reproduzir em dev a cascata de agrupamento
-- que existe pra prod de verdade (checado via MCP em 18/09: 91% das
-- nacionais reais não têm tema, 47% nem disciplina):
--   caad0003...0001: tem disciplina (CARDIO), sem tema -> cai no grupo "CARDIO".
--   caad0003...0002: sem disciplina E sem tema -> cai no grupo "Nacional".
INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, disciplina_id) VALUES
('caad0003-0000-0000-0000-000000000001','[Sem tema] Qual a principal causa de estenose mitral no Brasil?','multipla_escolha','nacional','ativa','A febre reumática (sequela de faringite estreptocócica não tratada) é a principal causa de estenose mitral no Brasil.','aaaa0000-0000-0000-0000-000000000001'),
('caad0003-0000-0000-0000-000000000002','[Sem tema e sem disciplina] Qual vitamina tem sua síntese estimulada pela exposição solar?','multipla_escolha','nacional','ativa','A vitamina D é sintetizada na pele a partir do 7-dehidrocolesterol sob ação da radiação UVB.',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem) VALUES
('caad0003-0000-0000-0000-000000000001','A','Febre reumática',true,1),
('caad0003-0000-0000-0000-000000000001','B','Endocardite infecciosa',false,2),
('caad0003-0000-0000-0000-000000000001','C','Calcificação senil',false,3),
('caad0003-0000-0000-0000-000000000002','A','Vitamina D',true,1),
('caad0003-0000-0000-0000-000000000002','B','Vitamina C',false,2),
('caad0003-0000-0000-0000-000000000002','C','Vitamina K',false,3)
ON CONFLICT DO NOTHING;
-- Sem INSERT em questao_tema pra nenhuma das duas: é o ponto do exemplo.

INSERT INTO public.prova (id, nome, periodo, tipo, origem, formato, qtd_questoes, publicada, arquivada)
VALUES ('caad0000-0000-0000-0000-0000000000f0','[DEV] Simulado seed — Caderno de Erros',0,'autoral','personalizado',NULL,6,false,false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.prova_questao (prova_id, questao_id, ordem) VALUES
('caad0000-0000-0000-0000-0000000000f0','cccc0000-0000-0000-0000-000000000001',1),
('caad0000-0000-0000-0000-0000000000f0','cccc0000-0000-0000-0000-000000000002',2),
('caad0000-0000-0000-0000-0000000000f0','caad0000-0000-0000-0000-000000000001',3),
('caad0000-0000-0000-0000-0000000000f0','caad0000-0000-0000-0000-000000000002',4),
('caad0000-0000-0000-0000-0000000000f0','caad0003-0000-0000-0000-000000000001',5),
('caad0000-0000-0000-0000-0000000000f0','caad0003-0000-0000-0000-000000000002',6)
ON CONFLICT DO NOTHING;

INSERT INTO public.tentativa (id, user_id, prova_id, modo, status, total_questoes, total_respondidas, acertos, nota, iniciada_em, finalizada_em, criado_em)
VALUES (
  'caad0000-0000-0000-0000-0000000000fa','11111111-1111-1111-1111-111111111111','caad0000-0000-0000-0000-0000000000f0',
  'simulado','finalizada',6,6,1,16.67, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'
)
ON CONFLICT (id) DO NOTHING;

-- cccc...0001 (nacional, com tema): acerta, marcando a alternativa A (Sódio).
-- cccc...0002 (nacional, com tema): ERRA, marcando B (Pancreatite) em vez de A (Colangite).
-- caad0000...0001 (processual, com tema): ERRA, marcando B em vez de A.
-- caad0000...0002 (laboratorio, com tema): ERRA, marcando B em vez de A.
-- caad0003...0001 (nacional, SEM tema, com disciplina): ERRA, marcando B.
-- caad0003...0002 (nacional, SEM tema e SEM disciplina): ERRA, marcando B.
-- Nenhuma discursiva aqui de propósito: Caderno de Erros ainda não cobre
-- questões abertas (fora de escopo por enquanto).
INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, alternativa_id, correta, ordem_na_tentativa, respondida_em, anulada_usuario)
SELECT 'caad0000-0000-0000-0000-0000000000fa', q.questao_id, alt.id, alt.correta, q.ordem, now() - interval '2 days', false
FROM (VALUES
  ('cccc0000-0000-0000-0000-000000000001'::uuid, 1, 'A'),
  ('cccc0000-0000-0000-0000-000000000002'::uuid, 2, 'B'),
  ('caad0000-0000-0000-0000-000000000001'::uuid, 3, 'B'),
  ('caad0000-0000-0000-0000-000000000002'::uuid, 4, 'B'),
  ('caad0003-0000-0000-0000-000000000001'::uuid, 5, 'B'),
  ('caad0003-0000-0000-0000-000000000002'::uuid, 6, 'B')
) AS q(questao_id, ordem, letra_escolhida)
JOIN public.alternativa alt ON alt.questao_id = q.questao_id AND alt.letra = q.letra_escolhida
WHERE NOT EXISTS (
  SELECT 1 FROM public.tentativa_resposta tr
  WHERE tr.tentativa_id = 'caad0000-0000-0000-0000-0000000000fa' AND tr.questao_id = q.questao_id
);

-- Mais 9 questões nacionais erradas (geradas via generate_series), só para o
-- Caderno de Erros nascer com 12 pendências em dev — o suficiente para
-- exercitar a paginação (10 por página) manualmente. Sem valor de conteúdo.
INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, disciplina_id)
SELECT
  ('caad0001-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid,
  '[Seed paginação] Questão de teste nº ' || gs || ' — qual das alternativas abaixo está correta?',
  'multipla_escolha', 'nacional', 'ativa',
  'Alternativa A é a correta nesta questão de teste (gerada só para popular a paginação em dev).',
  'aaaa0000-0000-0000-0000-000000000001'
FROM generate_series(1, 9) AS gs
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem)
SELECT ('caad0001-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid, alt.letra, alt.texto, alt.correta, alt.ordem
FROM generate_series(1, 9) AS gs
CROSS JOIN (VALUES ('A','Alternativa correta',true,1), ('B','Alternativa errada',false,2), ('C','Outra alternativa errada',false,3))
  AS alt(letra, texto, correta, ordem)
ON CONFLICT DO NOTHING;

INSERT INTO public.questao_tema (questao_id, tema_id)
SELECT ('caad0001-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid, 'bbbb0000-0000-0000-0000-000000000001'
FROM generate_series(1, 9) AS gs
ON CONFLICT DO NOTHING;

INSERT INTO public.prova_questao (prova_id, questao_id, ordem)
SELECT 'caad0000-0000-0000-0000-0000000000f0', ('caad0001-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid, gs + 4
FROM generate_series(1, 9) AS gs
ON CONFLICT DO NOTHING;

UPDATE public.prova SET qtd_questoes = 13 WHERE id = 'caad0000-0000-0000-0000-0000000000f0';
UPDATE public.tentativa SET total_questoes = 13, total_respondidas = 13 WHERE id = 'caad0000-0000-0000-0000-0000000000fa';

INSERT INTO public.tentativa_resposta (tentativa_id, questao_id, alternativa_id, correta, ordem_na_tentativa, respondida_em, anulada_usuario)
SELECT
  'caad0000-0000-0000-0000-0000000000fa', q.id, alt.id, alt.correta,
  4 + row_number() over (order by q.id), now() - interval '2 days', false
FROM public.questao q
JOIN public.alternativa alt ON alt.questao_id = q.id AND alt.letra = 'B'
WHERE q.id IN (
  SELECT ('caad0001-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid FROM generate_series(1, 9) AS gs
)
AND NOT EXISTS (
  SELECT 1 FROM public.tentativa_resposta tr
  WHERE tr.tentativa_id = 'caad0000-0000-0000-0000-0000000000fa' AND tr.questao_id = q.id
);

-- ============================================================================
-- Perfil de volume "estilo usuária real" (checado via MCP em 19/09 contra
-- uma assinante que usa muito a plataforma: 95 erros pendentes reais, 20
-- grupos de tema — nomes de tema abaixo são os REAIS dela, sem nenhum dado
-- pessoal/sensível). Amostra proporcional, NÃO os 95 completos (~34 novas
-- questões em 14 grupos, somando aos 4 grupos já existentes acima = 18
-- grupos, ~48 pendentes no total) — o bastante pra sentir o accordion com
-- volume alto sem replicar prod inteiro.
-- Idempotente; roda a cada `db reset`. NUNCA aplicar em produção.
-- ============================================================================
DO $$
DECLARE
  v_prova_id uuid := 'caad0000-0000-0000-0000-0000000000f0';
  v_tentativa_id uuid := 'caad0000-0000-0000-0000-0000000000fa';
  v_disciplina_id uuid := 'aaaa0000-0000-0000-0000-000000000001';
  v_ordem int;
  v_tema_id uuid;
  v_questao_id uuid;
  v_alt_errada_id uuid;
  v_i int;
  grupo record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.questao WHERE enunciado LIKE '[Seed volume]%') THEN
    RETURN;
  END IF;

  SELECT coalesce(max(ordem), 0) INTO v_ordem FROM public.prova_questao WHERE prova_id = v_prova_id;

  FOR grupo IN
    SELECT * FROM (VALUES
      ('IESC I', 'nacional', 6),
      ('MCM I', 'nacional', 4),
      ('HAM I', 'nacional', 3),
      ('Ciclo Cardíaco, Débito e Adaptações ao Exercício', 'processual', 3),
      ('Histofisiologia Vascular e Retorno Venoso (Membros Inferiores)', 'processual', 3),
      ('Embriologia Geral', 'laboratorio', 3),
      ('Sinais Vitais e Regulação da Pressão Arterial', 'processual', 2),
      ('Eletrofisiologia Cardíaca e Acoplamento Excitação-Contração', 'processual', 2),
      ('Hematopoiese e Composição Sanguínea', 'nacional', 2),
      ('Anatomia, Fisiologia e Histologia do Sistema Linfático', 'processual', 2),
      ('SOI I', 'nacional', 1),
      ('Anatomia e Histologia Cardíaca (Sistêmica e Coronária)', 'processual', 1),
      ('Genética', 'laboratorio', 1),
      ('Imunidade e Hipersensibilidade', 'nacional', 1)
    ) AS t(tema_nome, tipo_questao, qtd)
  LOOP
    SELECT id INTO v_tema_id FROM public.tema WHERE nome = grupo.tema_nome AND disciplina_id = v_disciplina_id;
    IF v_tema_id IS NULL THEN
      INSERT INTO public.tema (id, nome, disciplina_id)
      VALUES (gen_random_uuid(), grupo.tema_nome, v_disciplina_id)
      RETURNING id INTO v_tema_id;
    END IF;

    FOR v_i IN 1..grupo.qtd LOOP
      v_ordem := v_ordem + 1;

      INSERT INTO public.questao (id, enunciado, formato, tipo_questao, status, explicacao, disciplina_id)
      VALUES (
        gen_random_uuid(),
        '[Seed volume] ' || grupo.tema_nome || ' — questão de exemplo nº ' || v_i,
        'multipla_escolha', grupo.tipo_questao, 'ativa',
        'Explicação de exemplo para ' || grupo.tema_nome || '.', v_disciplina_id
      )
      RETURNING id INTO v_questao_id;

      INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem)
      VALUES (v_questao_id, 'A', 'Alternativa correta', true, 1);

      INSERT INTO public.alternativa (id, questao_id, letra, texto, correta, ordem)
      VALUES (gen_random_uuid(), v_questao_id, 'B', 'Alternativa errada', false, 2)
      RETURNING id INTO v_alt_errada_id;

      INSERT INTO public.alternativa (questao_id, letra, texto, correta, ordem)
      VALUES (v_questao_id, 'C', 'Outra alternativa errada', false, 3);

      INSERT INTO public.questao_tema (questao_id, tema_id) VALUES (v_questao_id, v_tema_id);
      INSERT INTO public.prova_questao (prova_id, questao_id, ordem) VALUES (v_prova_id, v_questao_id, v_ordem);

      INSERT INTO public.tentativa_resposta (
        tentativa_id, questao_id, alternativa_id, correta, ordem_na_tentativa, respondida_em, anulada_usuario
      )
      VALUES (v_tentativa_id, v_questao_id, v_alt_errada_id, false, v_ordem, now() - interval '2 days', false);
    END LOOP;
  END LOOP;

  UPDATE public.prova
     SET qtd_questoes = (SELECT count(*) FROM public.prova_questao WHERE prova_id = v_prova_id)
   WHERE id = v_prova_id;

  UPDATE public.tentativa t
     SET total_questoes = (SELECT count(*) FROM public.tentativa_resposta WHERE tentativa_id = v_tentativa_id),
         total_respondidas = (SELECT count(*) FROM public.tentativa_resposta WHERE tentativa_id = v_tentativa_id),
         acertos = (SELECT count(*) FILTER (WHERE correta) FROM public.tentativa_resposta WHERE tentativa_id = v_tentativa_id),
         nota = round(
           100.0 * (SELECT count(*) FILTER (WHERE correta) FROM public.tentativa_resposta WHERE tentativa_id = v_tentativa_id)
           / (SELECT count(*) FROM public.tentativa_resposta WHERE tentativa_id = v_tentativa_id), 2
         )
   WHERE t.id = v_tentativa_id;
END $$;
