-- Auditoria 2026-07-24 — item A1: fechar o bucket `questao-imagens`.
--
-- PROBLEMA
-- O bucket era `public = true`. Em bucket público o endpoint
--   /storage/v1/object/public/questao-imagens/<path>
-- serve o arquivo SEM autenticação e IGNORANDO as policies de `storage.objects`
-- (as policies só valem para o endpoint autenticado). Ou seja: todo o paywall
-- server-side de conteúdo — RLS em `questao`/`alternativa` + gate de assinatura
-- nas RPCs — não alcançava a imagem.
--
-- Isso vale para 306 questões, das quais 194 são de LABORATÓRIO, onde a imagem
-- É a questão: quem tem a URL tem o item completo, sem login e sem assinar.
-- A URL não é adivinhável (UUID), mas é permanente, viaja em cache/compartilhamento
-- e estava em texto plano no backup versionado (item C1 da mesma auditoria).
--
-- ATENÇÃO — ARMADILHA VERIFICADA EM PRODUÇÃO
-- O bucket NÃO possuía nenhuma policy de SELECT: só existiam as de INSERT/
-- UPDATE/DELETE para admin. A leitura funcionava exclusivamente por ser público.
-- Portanto, virar `public = false` sem criar a policy de SELECT quebraria TODAS
-- as imagens de questão, inclusive para admins. Por isso a policy vem ANTES.
--
-- ESCOLHA DE ESCOPO (deliberada): a leitura exige apenas ESTAR AUTENTICADO, e
-- não assinatura ativa. Motivo: o desafio diário é aberto a não-assinantes por
-- decisão de produto (ver 20260624131517) e 4 questões do desafio têm imagem —
-- exigir assinatura aqui quebraria o desafio para o usuário grátis. O ganho
-- principal já é obtido: acaba o acesso ANÔNIMO e permanente por URL. Um
-- usuário logado sem assinatura continua sem conseguir descobrir as URLs, pois
-- as RPCs que entregam conteúdo é que são gateadas.
-- Se a regra de produto mudar (desafio diário fechado), trocar o USING por
-- `(select public.tem_assinatura_ativa())` fecha o resto.

------------------------------------------------------------------------------
-- 1) Policy de SELECT (precisa existir ANTES de tirar o bucket do modo público)
------------------------------------------------------------------------------
drop policy if exists "questao_imagens_select" on storage.objects;
create policy "questao_imagens_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'questao-imagens');

------------------------------------------------------------------------------
-- 2) Fechar o bucket
--
-- Objetos já existentes continuam no lugar; muda apenas a forma de acesso.
-- O frontend passa a resolver a exibição via `createSignedUrl` (TTL curto),
-- que exige sessão e é avaliado pela policy acima.
-- As URLs gravadas em `questao.imagem_url` / `alternativa.imagem_url`
-- permanecem inalteradas: elas viram apenas um IDENTIFICADOR do objeto, do qual
-- o cliente extrai o path para assinar. Não há data migration.
------------------------------------------------------------------------------
update storage.buckets set public = false where id = 'questao-imagens';

------------------------------------------------------------------------------
-- 3) `questoes-lab`: bucket legado, público e SEM nenhuma policy.
--    Contém 1 objeto e nenhuma linha de `questao`/`alternativa` o referencia
--    (verificado em 2026-07-24). Fechado por higiene — sem impacto funcional.
------------------------------------------------------------------------------
update storage.buckets set public = false where id = 'questoes-lab';
