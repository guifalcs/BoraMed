-- ============================================================
-- Destinatários de uma campanha, para o modal do admin
--
-- `email_campanha_destinatario` não tem grant para `authenticated`
-- (20260730180000 revogou), então a leitura sai por RPC SECURITY DEFINER — o
-- mesmo caminho de `admin_listar_campanhas_email`.
--
-- Devolve `total` por linha via `count(*) OVER ()`: é a contagem das linhas que
-- casam com o filtro, não da página. Evita uma segunda ida ao banco só para
-- montar o "mostrando 200 de 1.234" da tela.
--
-- Ordem: problema primeiro (falhou → pendente → cancelado → enviado) e e-mail
-- como desempate. Quem abre essa lista quase sempre está investigando o que não
-- chegou, não conferindo o que chegou.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_listar_destinatarios_campanha(
  p_campanha_id uuid,
  p_status      text DEFAULT NULL,
  p_limit       integer DEFAULT 200,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE (
  email         text,
  nome_completo text,
  status        text,
  resend_id     text,
  erro          text,
  enviado_em    timestamptz,
  total         bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  -- Status inválido devolve vazio em vez de ignorar o filtro: melhor a tela
  -- mostrar "nenhum" do que despejar a lista toda achando que filtrou.
  IF p_status IS NOT NULL
     AND p_status NOT IN ('pendente', 'enviado', 'falhou', 'cancelado') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.email,
    d.nome_completo,
    d.status,
    d.resend_id,
    d.erro,
    d.enviado_em,
    count(*) OVER () AS total
  FROM public.email_campanha_destinatario d
  WHERE d.campanha_id = p_campanha_id
    AND (p_status IS NULL OR d.status = p_status)
  ORDER BY
    CASE d.status
      WHEN 'falhou'    THEN 0
      WHEN 'pendente'  THEN 1
      WHEN 'cancelado' THEN 2
      ELSE 3
    END,
    d.email
  -- Teto de 500: o `max_rows` do PostgREST truncaria em 1000 de qualquer forma,
  -- e a tela pagina com "carregar mais".
  LIMIT  least(greatest(coalesce(p_limit, 200), 1), 500)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_destinatarios_campanha(uuid, text, integer, integer)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_destinatarios_campanha(uuid, text, integer, integer)
  TO authenticated;
