-- Busca de questões no admin: além do enunciado, agora também busca no
-- texto das alternativas, e normaliza espaços/quebras de linha antes de
-- comparar (assim "linha 1\nlinha 2" casa com "linha 1 linha 2" e espaços
-- duplicados não atrapalham o match). Isso não dá pra fazer só com .ilike()
-- direto no PostgREST porque ele compara contra o valor bruto da coluna —
-- por isso a normalização roda no banco, numa RPC dedicada que devolve os
-- ids de questao que casam.

CREATE OR REPLACE FUNCTION public.admin_buscar_questao_ids_por_texto(p_termo text)
RETURNS TABLE(questao_id uuid)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH termo AS (
    SELECT btrim(regexp_replace(coalesce(p_termo, ''), '\s+', ' ', 'g')) AS valor
  )
  SELECT q.id
  FROM public.questao q, termo
  WHERE termo.valor <> ''
    AND (
      regexp_replace(q.enunciado, '\s+', ' ', 'g') ILIKE '%' || termo.valor || '%'
      OR regexp_replace(coalesce(q.enunciado_apoio, ''), '\s+', ' ', 'g') ILIKE '%' || termo.valor || '%'
    )
  UNION
  SELECT a.questao_id
  FROM public.alternativa a, termo
  WHERE termo.valor <> ''
    AND regexp_replace(a.texto, '\s+', ' ', 'g') ILIKE '%' || termo.valor || '%';
$$;

REVOKE EXECUTE ON FUNCTION public.admin_buscar_questao_ids_por_texto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_buscar_questao_ids_por_texto(text) TO authenticated;
