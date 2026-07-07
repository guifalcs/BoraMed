-- ============================================================================
-- Questões abertas (discursivas) — Fase 1: schema de gabarito aberto + correção
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS (mesmo alerta da 20260624125610):
-- NÃO regenerar `questao`/`alternativa`/`tentativa`/`tentativa_resposta` via
-- `db pull`/`db diff` — o diff autogerado re-emite os GRANTs default do schema
-- e reexpõe o gabarito (incluindo as colunas novas abaixo). Migrations dessas
-- tabelas são escritas à mão. Ver docs/security-audit-2026-06-24.md.
--
-- Modelo de grants vigente (20260624125610):
--   * questao.SELECT é POR COLUNA → coluna nova nasce OCULTA para
--     authenticated. É o desejado para resposta_modelo/pontos_chave/
--     criterios_correcao (gabarito aberto): leitura só via RPCs SECURITY
--     DEFINER (admin_get_questao usa to_jsonb(q), já as inclui; iniciar/
--     retomar_tentativa mascaram em simulado — Fase 3).
--   * questao.INSERT/UPDATE são DE TABELA → admin continua escrevendo as
--     colunas novas direto via PostgREST, sem grant adicional.
--   * tentativa_resposta.SELECT é DE TABELA (RLS restringe ao dono) →
--     enviada_em/pontos nascem legíveis pelo dono, como desejado. Escrita
--     segue revogada (só RPCs SECURITY DEFINER).
-- ============================================================================

------------------------------------------------------------------------------
-- 1. questao — gabarito da questão aberta (D1/D2)
--    Colunas NOVAS, não reutilizar resposta_correta_texto/respostas_aceitas
--    (semântica de match exato, deprecadas para abertas).
------------------------------------------------------------------------------

alter table public.questao
  add column if not exists resposta_modelo text,
  add column if not exists pontos_chave jsonb not null default '[]'::jsonb,
  add column if not exists criterios_correcao text;

comment on column public.questao.resposta_modelo is
  'Resposta padrão/modelo da questão discursiva. SECRETA: sem SELECT grant; leitura só via RPC.';
comment on column public.questao.pontos_chave is
  'Array JSON de strings — checklist de pontos que a resposta do aluno deve cobrir (insumo da correção por IA). SECRETA.';
comment on column public.questao.criterios_correcao is
  'Texto livre com rubrica/estilo de correção (penalizações, concisão etc.). SECRETA.';

-- pontos_chave deve ser um array JSON
alter table public.questao
  add constraint questao_pontos_chave_array_check
  check (jsonb_typeof(pontos_chave) = 'array');

------------------------------------------------------------------------------
-- 2. tentativa_resposta — envio definitivo + pontuação 0–100 (D4/D6)
------------------------------------------------------------------------------

alter table public.tentativa_resposta
  add column if not exists enviada_em timestamptz,
  add column if not exists pontos smallint;

alter table public.tentativa_resposta
  add constraint tentativa_resposta_pontos_check
  check (pontos is null or (pontos >= 0 and pontos <= 100));

comment on column public.tentativa_resposta.enviada_em is
  'Envio definitivo de resposta aberta (NULL = rascunho editável). Setada só por RPC enviar_resposta_aberta.';
comment on column public.tentativa_resposta.pontos is
  'Pontuação 0–100 da resposta (abertas via IA; NULL = não pontuável/ainda sem nota). Agregações usam coalesce(pontos, correta::int*100).';

------------------------------------------------------------------------------
-- 3. resposta_correcao — auditoria/estado da correção por IA (D3)
--    1:1 com tentativa_resposta. Escrita exclusiva de service-role/SECURITY
--    DEFINER; aluno dono da tentativa só lê.
------------------------------------------------------------------------------

create table public.resposta_correcao (
  id uuid primary key default gen_random_uuid(),
  tentativa_resposta_id uuid not null unique
    references public.tentativa_resposta(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'corrigindo', 'corrigida', 'erro', 'sem_ia')),
  pontos smallint check (pontos is null or (pontos >= 0 and pontos <= 100)),
  feedback text,
  pontos_atendidos jsonb,
  pontos_faltantes jsonb,
  erros jsonb,
  provider text,
  modelo text,
  tokens_prompt integer,
  tokens_resposta integer,
  num_tentativas integer not null default 0,
  erro_detalhe text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.resposta_correcao is
  'Estado e resultado da correção por IA de uma resposta aberta (1:1 com tentativa_resposta). Escrita só via service-role/SECURITY DEFINER.';

-- Índice parcial para o worker achar pendências (claim idempotente na edge fn)
create index resposta_correcao_pendentes_idx
  on public.resposta_correcao (status)
  where status in ('pendente', 'erro');

alter table public.resposta_correcao enable row level security;

-- Dono da tentativa lê a própria correção
create policy resposta_correcao_select_own on public.resposta_correcao
  for select to authenticated
  using (
    exists (
      select 1
      from public.tentativa_resposta tr
      join public.tentativa t on t.id = tr.tentativa_id
      where tr.id = resposta_correcao.tentativa_resposta_id
        and t.user_id = (select auth.uid())
    )
  );

-- Sem escrita direta para clientes (nem policy, nem grant)
revoke all on public.resposta_correcao from public, anon, authenticated;
grant select on public.resposta_correcao to authenticated;
grant all on public.resposta_correcao to service_role;

------------------------------------------------------------------------------
-- 4. admin_get_questao — sem mudança necessária: usa to_jsonb(q) e roda como
--    owner (SECURITY DEFINER), então já retorna as 3 colunas novas ao admin.
------------------------------------------------------------------------------
