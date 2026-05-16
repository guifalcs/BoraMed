
# Arquitetura — BoraMed

> Decisões são append-only. Nunca editar uma decisão anterior — apenas adicionar novas.

## ADR-001: Angular + Supabase

 **Data** : 2025-05
 **Decisão** : Angular 18+ (standalone components, signals) para frontend; Supabase para DB, Auth e Storage.
 **Motivo** : Stack padrão Rebuild já dominada pelo time. Angular standalone + signals reduz boilerplate. Supabase elimina backend próprio para time de 2 pessoas.

## ADR-002: Web-first, mobile-friendly

 **Data** : 2025-05
 **Decisão** : Aplicação web responsiva. Sem app nativo no MVP.
 **Motivo** : Velocidade de entrega. Alunos de medicina estudam no notebook e no celular — browser cobre os dois.

## ADR-003: Auth por email/senha

 **Data** : 2025-05
 **Decisão** : Supabase Auth com email/senha. Sem OAuth social por ora.
 **Motivo** : Simplicidade. Cadastro manual no MVP. OAuth pode ser adicionado depois sem quebrar nada.

## ADR-004: Storage de imagens no Supabase

 **Data** : 2025-05
 **Decisão** : Imagens de lâminas e peças armazenadas no Supabase Storage.
 **Motivo** : Integrado ao mesmo projeto, RLS nativo, CDN incluído no plano.

## ADR-005: Deploy Vercel + Supabase Cloud

 **Data** : 2025-05
 **Decisão** : Vercel para frontend, Supabase Cloud para backend.
 **Motivo** : Free tier suficiente para MVP. Integração nativa entre os dois. Zero DevOps.

## ADR-006: Questões autorais, não copiadas

 **Data** : 2025-05
 **Decisão** : Banco de questões processuais e de laboratório contém questões autorais criadas pelo time, inspiradas em temas, objetivos pedagógicos e formatos de avaliação observados. Não armazenar cópias, transcrições ou adaptações próximas de provas, materiais, imagens, alternativas ou gabaritos oficiais de instituições.
 **Motivo** : Conteúdo institucional e docente pode ter proteção autoral. Conteúdo autoral reduz risco jurídico e é suficiente para o propósito pedagógico.

## ADR-010: Posicionamento independente sobre instituições citadas

 **Data** : 2026-05
 **Decisão** : Textos públicos devem apresentar o BoraMed como plataforma independente. Menções à Afya devem ser nominativas e contextuais, usando linguagem como "foco inicial em alunos da rede Afya" ou "modelo das avaliações", sem sugerir parceria, vínculo oficial, representação, acervo oficial ou uso de questões da instituição.
 **Motivo** : A plataforma precisa atrair alunos do público inicial sem criar risco de confusão de marca, parceria inexistente ou apropriação de conteúdo protegido.

## ADR-007: Sorteio de questões server-side via Supabase RPC

 **Data** : 2025-05
 **Decisão** : Lógica de sorteio e montagem do simulado roda em Supabase RPC ou Edge Function, não no cliente Angular.
 **Motivo** : Evita exposição dos IDs de todas as questões antes do aluno responder. Reduz superfície de manipulação.

## ADR-008: Google OAuth adicionado ao MVP

 **Data** : 2026-05
 **Decisão** : Google OAuth via Supabase Auth adicionado, ao lado de email/senha. ADR-003 revisado.
 **Motivo** : Templates de auth já previam os botões. Supabase OAuth não adiciona complexidade de backend nem exige mudança de schema.

## ADR-009: Onboarding próprio e versionado

 **Data** : 2026-05
 **Decisão** : O onboarding de novos usuários será implementado como componente Angular próprio, orquestrado pelo shell do dashboard e persistido em tabela Supabase `user_onboarding_state` por usuário, fluxo e versão.
 **Motivo** : O BoraMed precisa de uma experiência integrada ao design system, responsiva para sidebar/bottom-nav e segura por RLS. Ferramentas externas de product tour ficam para uma fase futura, quando houver necessidade real de edição no-code, segmentação avançada ou analytics de growth.
