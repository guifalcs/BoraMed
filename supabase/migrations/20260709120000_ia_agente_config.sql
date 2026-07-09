-- ============================================================================
-- Configuração dos agentes de IA (Aurora) gerenciável pelo admin.
--
-- Motivação: hoje toda a config da correção por IA vive em env/secrets
-- (AI_GRADING_*) e o prompt está cravado em grading-openai-compat.ts. Esta
-- tabela move a config NÃO-SECRETA para o banco, editável no painel /admin/ia,
-- lida pela edge function `corrigir-resposta-aberta` via service_role.
--
-- ESCOPO (decisão do dono, 2026-07-09): esta tabela guarda só o COMPORTAMENTO
-- da IA gerenciável pelo admin. MODELO E CONEXÃO (provider, base_url, modelo,
-- ordem de fallback, chave) ficam FORA — são responsabilidade do dev, via
-- env/secrets (AI_GRADING_*) + painel do OpenRouter.
--
-- SEGURANÇA (requisito central):
--   * A CHAVE DA API (AI_GRADING_API_KEY) e a conexão NÃO ficam aqui — env/secrets.
--     Esta tabela não guarda nenhum segredo.
--   * RLS admin-only (is_admin()) em TODAS as operações; nada para `anon`.
--     Não-admin autenticado não lê nem escreve. A edge function lê via
--     service_role (bypass de RLS).
--   * CHECK constraints limitam valores (temperatura, limites) — um valor
--     absurdo no painel não passa.
--   * As defesas anti-prompt-injection e o contrato JSON são IMUTÁVEIS no
--     código (montarPrompt); os campos de prompt abaixo são só conteúdo
--     adicional em slots fixos, nunca substituem o núcleo de segurança.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS: não regenerar esta tabela via
--    `db pull`/`db diff` sem revisar o diff — o autogerado pode re-emitir
--    GRANTs default. Migration escrita à mão. Ver docs/security-audit-*.
-- ============================================================================

------------------------------------------------------------------------------
-- 1. Tabela ia_agente (multi-agente por slug; hoje só 'aurora')
------------------------------------------------------------------------------
create table if not exists public.ia_agente (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  nome               text not null,
  ativo              boolean not null default true,
  temperatura        numeric not null default 0
                       check (temperatura >= 0 and temperatura <= 2),
  limite_diario      integer not null default 200
                       check (limite_diario >= 1 and limite_diario <= 1000),
  max_resposta_chars integer not null default 3000
                       check (max_resposta_chars >= 500 and max_resposta_chars <= 8000),
  persona            text,
  tom                text,
  tamanho_feedback   text,
  regras_correcao    text,
  regras_extras      text,
  atualizado_por     uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

comment on table public.ia_agente is
  'Comportamento NÃO-SECRETO dos agentes de IA (Aurora), gerenciável pelo admin. Admin-only (RLS). Modelo/conexão/chave ficam em env/secrets, nunca aqui.';
comment on column public.ia_agente.ativo is
  'Liga/desliga o agente. Desligado => a edge function não corrige => correção vira sem_ia (app segue funcionando).';
comment on column public.ia_agente.limite_diario is
  'Teto de correções por IA que UM aluno pode disparar por dia (anti-abuso/custo). Ao estourar, a correção dele vira 429/sem_ia; não afeta outros alunos.';
comment on column public.ia_agente.regras_correcao is
  'Rubrica principal de correção (bullets sob "Regras de correção:"). Editável; default = o texto cravado antes. Não substitui o núcleo de segurança (anti-injection/JSON).';
comment on column public.ia_agente.regras_extras is
  'Regras pedagógicas adicionais do admin, anexadas ao prompt em slot fixo. Não substituem o núcleo de segurança (anti-injection/JSON).';

------------------------------------------------------------------------------
-- 2. Trigger de atualizado_em (reusa helper existente)
------------------------------------------------------------------------------
drop trigger if exists ia_agente_set_atualizado_em on public.ia_agente;
create trigger ia_agente_set_atualizado_em
  before update on public.ia_agente
  for each row execute function public.set_atualizado_em();

------------------------------------------------------------------------------
-- 3. RLS admin-only. Nada para anon; authenticated só passa via is_admin().
------------------------------------------------------------------------------
alter table public.ia_agente enable row level security;

drop policy if exists "ia_agente_admin_select" on public.ia_agente;
create policy "ia_agente_admin_select"
  on public.ia_agente for select to authenticated
  using (public.is_admin());

drop policy if exists "ia_agente_admin_insert" on public.ia_agente;
create policy "ia_agente_admin_insert"
  on public.ia_agente for insert to authenticated
  with check (public.is_admin());

drop policy if exists "ia_agente_admin_update" on public.ia_agente;
create policy "ia_agente_admin_update"
  on public.ia_agente for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ia_agente_admin_delete" on public.ia_agente;
create policy "ia_agente_admin_delete"
  on public.ia_agente for delete to authenticated
  using (public.is_admin());

-- Grants de tabela: só authenticated (RLS filtra). anon fica de fora.
revoke all on public.ia_agente from anon;
grant select, insert, update, delete on public.ia_agente to authenticated;

------------------------------------------------------------------------------
-- 4. Seed do agente 'aurora' com os defaults hoje vigentes em env/secrets.
--    Idempotente: não sobrescreve se já existir (preserva edições do admin).
------------------------------------------------------------------------------
insert into public.ia_agente (
  slug, nome, ativo, temperatura, limite_diario, max_resposta_chars,
  persona, tom, tamanho_feedback, regras_correcao, regras_extras
) values (
  'aurora',
  'Aurora',
  true,
  0,
  200,
  3000,
  'Você é um corretor de provas discursivas de medicina, rigoroso e justo.',
  'Pedagógico, direto e respeitoso, sem ser condescendente.',
  'Comentário curto: 2 a 4 frases objetivas.',
  E'- "pontos" reflete a cobertura dos pontos-chave e a correção conceitual.\n'
  '- Resposta em branco, sem relação com a pergunta ou apenas repetindo o enunciado = 0.\n'
  '- Identifique o COMANDO do enunciado e exija que a resposta siga esse formato:\n'
  '  • "cite"/"liste"/"enumere"/"quais"/"aponte": basta nomear corretamente os itens;\n'
  '    desenvolver ou explicar além do pedido NÃO penaliza.\n'
  '  • "explique"/"justifique"/"descreva"/"discorra"/"comente"/"por que"/"como"/"relacione":\n'
  '    exija desenvolvimento e raciocínio. Resposta que apenas cita ou lista sem explicar\n'
  '    perde pontos proporcionalmente, mesmo com os termos corretos.\n'
  '- Na dúvida sobre o rigor do formato, prefira ser mais rigoroso do que leniente.\n'
  '- Ao descontar por formato (ex.: pediu explicar e o aluno só citou), diga isso no feedback.',
  ''
)
on conflict (slug) do nothing;
