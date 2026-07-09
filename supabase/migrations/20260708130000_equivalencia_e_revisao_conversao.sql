-- ============================================================================
-- Equivalência de questões (dedup abertas×fechadas) + flag de revisão de conversão
--
-- Contexto: a base de produção é toda de questões FECHADAS. Ao converter algumas
-- para DISCURSIVAS (aberta), passam a existir duas questões com o mesmo conteúdo.
-- Precisamos que o usuário nunca receba as duas "gêmeas" no mesmo simulado e que
-- o rodízio (anti-repetição) as trate como a MESMA questão lógica.
--
--   * grupo_equivalencia_id: UUID compartilhado pelas questões equivalentes.
--     NULL = questão isolada. "Questão lógica" = coalesce(grupo_equivalencia_id, id).
--     Simétrico e extensível (N variantes por grupo).
--   * revisao_conversao: flag DISCRETA (só admin) para questões convertidas em
--     massa que aguardam revisão do sócio. NULL = questão normal.
--     'pendente' = convertida, aguardando revisão. 'revisada' = já conferida.
--     NÃO afeta o aluno nem o sorteio — é só lembrete/curadoria no admin.
--
-- ⚠️ AVISO ANTI-REGRESSÃO DE GRANTS (mesmo alerta da 20260624125610 / 20260707120000):
-- NÃO regenerar `questao` via `db pull`/`db diff` — o diff autogerado re-emite os
-- GRANTs default e reexpõe o gabarito. Migration escrita à mão.
--
-- Modelo de grants vigente: questao.SELECT é POR COLUNA. As colunas abaixo NÃO são
-- secretas (não são gabarito), então precisam de SELECT grant explícito para
-- `authenticated` — senão a leitura de questao pelo cliente quebraria por coluna
-- oculta. INSERT/UPDATE são de tabela, então o admin já escreve sem grant extra.
-- ============================================================================

alter table public.questao
  add column if not exists grupo_equivalencia_id uuid,
  add column if not exists revisao_conversao text;

alter table public.questao
  drop constraint if exists questao_revisao_conversao_check;
alter table public.questao
  add constraint questao_revisao_conversao_check
  check (revisao_conversao is null or revisao_conversao in ('pendente', 'revisada'));

comment on column public.questao.grupo_equivalencia_id is
  'UUID de grupo de questões equivalentes (mesma questão lógica em formatos diferentes: fechada + discursiva gêmea). NULL = questão isolada. Dedup/rodízio usam coalesce(grupo_equivalencia_id, id).';
comment on column public.questao.revisao_conversao is
  'Flag discreta (admin-only): NULL = normal; ''pendente'' = convertida em massa, aguardando revisão do sócio; ''revisada'' = conferida. Não afeta aluno nem sorteio.';

-- Índice para agrupar/deduplicar por grupo no sorteio.
create index if not exists idx_questao_grupo_equivalencia
  on public.questao (grupo_equivalencia_id)
  where grupo_equivalencia_id is not null;

-- Índice parcial para a fila de revisão no admin.
create index if not exists idx_questao_revisao_pendente
  on public.questao (revisao_conversao)
  where revisao_conversao = 'pendente';

-- Colunas NÃO-secretas: precisam de SELECT grant explícito (grant é por coluna).
grant select (grupo_equivalencia_id, revisao_conversao) on public.questao to authenticated;
