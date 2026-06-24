-- ============================================================================
-- ATENÇÃO — ESTA É UMA REGRESSÃO. As mesmas duas falhas já haviam sido fechadas
-- em 20260609120000_seguranca_bloquear_escrita_tentativa e
-- 20260609130000_seguranca_critico1_revogar_gabarito, mas a migration
-- AUTOGERADA 20260612174550_sistema_suporte (criada via `supabase db pull`/
-- `db diff`) re-emitiu os GRANTs e POLICIES default do schema, revertendo o
-- hardening: voltou `grant select on alternativa/questao to authenticated`
-- (reexpondo o gabarito) e `grant insert/update/delete on tentativa[_resposta]`
-- + as policies de escrita (reabrindo a adulteração de nota).
--
-- ⚠️ PROCESSO: NÃO regenerar estas tabelas via `db pull`/`db diff` sem
-- reaplicar este hardening depois — o diff captura os grants default e desfaz
-- o recorte de colunas. Idealmente manter esta migration como a última e/ou
-- adicionar um teste de CI que valide os grants (ver docs/security-audit).
-- ============================================================================
--
-- Correção de segurança — fecha duas falhas de causa-raiz comum:
-- as tabelas-base estavam expostas via PostgREST, e a proteção real (esconder
-- gabarito, validar pontuação) vivia só nas RPCs, que o atacante ignorava
-- consultando/escrevendo a tabela direto.
--
-- (#1 CRÍTICA) Gabarito + soluções legíveis por qualquer usuário autenticado:
--   alternativa.correta e questao.{resposta_correta_texto,respostas_aceitas,
--   explicacao,explicacao_alternativas} eram retornados por
--   GET /rest/v1/alternativa e /questao (RLS qual=true + grant de tabela).
--   => cola em tempo real durante o simulado + dump do acervo.
--
-- (#2 ALTA) Aluno adulterava a própria nota/respostas:
--   UPDATE direto em tentativa (nota, acertos, status) e tentativa_resposta
--   (correta, alternativa_id) — grant amplo + policy de UPDATE com with_check NULL.
--
-- Estratégia: privilégio de coluna no Postgres é ADITIVO — não é possível
-- "revogar uma coluna" enquanto existe GRANT no nível da tabela. Por isso
-- revogamos o SELECT da tabela e reconcedemos apenas as colunas não sensíveis.
-- Toda leitura de gabarito passa a ser exclusiva das RPCs SECURITY DEFINER
-- (iniciar_tentativa, get_revisao_*, get_simulado_impressao, admin_get_questao,
-- get_desafio_diario, ...), que rodam como owner e ignoram este recorte.
--
-- MANUTENÇÃO: como o SELECT deixa de ser no nível da tabela, COLUNAS NOVAS
-- adicionadas a `alternativa`/`questao` NÃO ficam legíveis para `authenticated`
-- por padrão — conceda explicitamente na migration que criar a coluna
-- (ou amplie a lista abaixo). É o comportamento desejado: novo dado nasce oculto.

------------------------------------------------------------------------------
-- #1 — Recortar leitura das colunas de gabarito/solução
------------------------------------------------------------------------------

-- alternativa: esconder `correta`
revoke select on public.alternativa from authenticated;
revoke select on public.alternativa from anon;
grant select (
  id, questao_id, letra, texto, ordem, imagem_url, criado_em, atualizado_em
) on public.alternativa to authenticated;

-- questao: esconder resposta_correta_texto, respostas_aceitas, explicacao,
--          explicacao_alternativas
revoke select on public.questao from authenticated;
revoke select on public.questao from anon;
grant select (
  id, prova_id, ordem_na_prova, codigo_externo, enunciado_apoio, enunciado,
  imagem_url, imagem_legenda, formato, referencia, fonte,
  vezes_respondida, vezes_acertada, taxa_acerto, status, revisado,
  criado_em, atualizado_em, autor_id, revisor_id, aprovada_em, publicada_em,
  origem_geracao, nivel_bloom, formato_prova, apto_desafio_diario,
  disciplina_id, tipo_questao
) on public.questao to authenticated;

------------------------------------------------------------------------------
-- #2 — Tirar a escrita direta de tentativa/tentativa_resposta
--      Toda mutação passa a ser exclusiva das RPCs SECURITY DEFINER, que já
--      validam dono (auth.uid()) e estado da tentativa.
------------------------------------------------------------------------------

-- salvar_resposta_tentativa era SECURITY INVOKER (escrevia como o próprio
-- usuário). Convertendo para DEFINER para que continue funcionando após a
-- revogação. A função já valida posse e estado — corpo idêntico ao atual,
-- apenas com SECURITY DEFINER.
create or replace function public.salvar_resposta_tentativa(
  p_tentativa_id uuid, p_questao_id uuid, p_alternativa_id uuid
)
returns public.tentativa_resposta
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_resposta public.tentativa_resposta;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario nao autenticado' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tentativa t
    where t.id = p_tentativa_id
      and t.user_id = v_user_id
      and t.status <> 'finalizada'
  ) then
    raise exception 'Tentativa nao encontrada, finalizada ou sem permissao' using errcode = 'P0003';
  end if;

  if not exists (
    select 1
    from public.alternativa a
    where a.id = p_alternativa_id
      and a.questao_id = p_questao_id
  ) then
    raise exception 'Alternativa invalida para a questao' using errcode = 'P0004';
  end if;

  update public.tentativa_resposta tr
  set alternativa_id = p_alternativa_id,
      respondida_em = now()
  where tr.tentativa_id = p_tentativa_id
    and tr.questao_id = p_questao_id
  returning * into v_resposta;

  if not found then
    raise exception 'Resposta nao encontrada para a tentativa' using errcode = 'P0005';
  end if;

  return v_resposta;
end;
$function$;

-- Garantir que só authenticated (e roles de serviço) executem a RPC.
revoke all on function public.salvar_resposta_tentativa(uuid, uuid, uuid) from public, anon;
grant execute on function public.salvar_resposta_tentativa(uuid, uuid, uuid) to authenticated;

-- Remover escrita direta. SELECT permanece (RLS já restringe às linhas do dono).
revoke insert, update, delete, truncate on public.tentativa            from authenticated, anon;
revoke insert, update, delete, truncate on public.tentativa_resposta   from authenticated, anon;

-- Policies de escrita recriadas por engano pela 20260612174550_sistema_suporte.
-- Sem WITH CHECK de coluna permitiam reescrever nota/acertos/status/correta.
-- Removidas de novo (o revoke acima já basta; isto é defesa em profundidade).
drop policy if exists tentativa_insert_own          on public.tentativa;
drop policy if exists tentativa_update_own          on public.tentativa;
drop policy if exists tentativa_resposta_insert_own on public.tentativa_resposta;
drop policy if exists tentativa_resposta_update_own on public.tentativa_resposta;
