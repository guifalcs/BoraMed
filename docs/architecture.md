
# Arquitetura — Projeto Med

> Decisões são append-only. Nunca editar uma decisão anterior — apenas adicionar novas.

## ADR-001: Next.js App Router + Supabase

 **Data** : 2025-05
 **Decisão** : Next.js 14 com App Router para frontend; Supabase para DB, Auth e Storage.
 **Motivo** : Stack completa com menor overhead operacional para time de 2 pessoas. Supabase elimina backend próprio. Next.js Server Components reduzem JS no cliente.

## ADR-002: Web-first, mobile-friendly

 **Data** : 2025-05
 **Decisão** : Aplicação web responsiva. Sem app nativo no MVP.
 **Motivo** : Velocidade de entrega. Alunos Afya estudam no notebook e no celular — browser cobre os dois.

## ADR-003: Auth por email/senha

 **Data** : 2025-05
 **Decisão** : Supabase Auth com email/senha. Sem OAuth social por ora.
 **Motivo** : Simplicidade. Cadastro manual no MVP. OAuth pode ser adicionado depois sem quebrar nada.

## ADR-004: Storage de imagens no Supabase

 **Data** : 2025-05
 **Decisão** : Imagens de lâminas e peças armazenadas no Supabase Storage, bucket `questoes-lab`.
 **Motivo** : Integrado ao mesmo projeto, RLS nativo, CDN incluído no plano.

## ADR-005: Deploy Vercel + Supabase Cloud

 **Data** : 2025-05
 **Decisão** : Vercel para frontend, Supabase Cloud para backend.
 **Motivo** : Free tier suficiente para MVP. Integração nativa entre os dois. Zero DevOps.

## ADR-006: Questões reescritas, não copiadas

 **Data** : 2025-05
 **Decisão** : Banco de questões processuais e de laboratório contém questões reescritas/adaptadas pelos sócios, não cópias das provas originais dos professores Afya.
 **Motivo** : Provas elaboradas por professores pertencem à instituição. Reescrita elimina risco jurídico e é suficiente para o propósito pedagógico.

## ADR-007: Geração de simulado server-side

 **Data** : 2025-05
 **Decisão** : Lógica de sorteio e montagem do simulado roda em Server Action, não no cliente.
 **Motivo** : Evita exposição da lógica de seleção e dos IDs das questões antes do aluno responder. Reduz superfície de manipulação.
