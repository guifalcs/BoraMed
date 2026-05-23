-- Sistema de notificações in-app + avisos broadcast do admin

-- ─── Tabela: notificacoes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo      TEXT        NOT NULL CHECK (tipo IN ('sistema', 'conquista', 'info', 'aviso')),
  titulo    TEXT        NOT NULL,
  mensagem  TEXT,
  lida      BOOLEAN     NOT NULL DEFAULT false,
  dados     JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS notificacoes_user_lida_idx
  ON public.notificacoes (user_id, lida, criado_em DESC);

CREATE POLICY "notificacoes_select_own"
  ON public.notificacoes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "notificacoes_update_own"
  ON public.notificacoes FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ─── Tabela: avisos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.avisos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     TEXT,
  mensagem   TEXT,
  imagem_url TEXT        NOT NULL,
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS avisos_ativo_idx
  ON public.avisos (ativo) WHERE ativo = true;

CREATE POLICY "avisos_select_authenticated"
  ON public.avisos FOR SELECT TO authenticated
  USING (ativo = true);

CREATE POLICY "avisos_admin_insert"
  ON public.avisos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "avisos_admin_update"
  ON public.avisos FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "avisos_admin_delete"
  ON public.avisos FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─── Tabela: avisos_vistos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.avisos_vistos (
  aviso_id  UUID        NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visto_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aviso_id, user_id)
);

ALTER TABLE public.avisos_vistos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS avisos_vistos_user_idx
  ON public.avisos_vistos (user_id);

CREATE POLICY "avisos_vistos_select_own"
  ON public.avisos_vistos FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "avisos_vistos_insert_own"
  ON public.avisos_vistos FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ─── Storage: bucket avisos ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avisos',
  'avisos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avisos_imagens_select" ON storage.objects;
DROP POLICY IF EXISTS "avisos_imagens_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "avisos_imagens_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "avisos_imagens_admin_delete" ON storage.objects;

CREATE POLICY "avisos_imagens_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avisos');

CREATE POLICY "avisos_imagens_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avisos' AND public.is_admin());

CREATE POLICY "avisos_imagens_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avisos' AND public.is_admin())
  WITH CHECK (bucket_id = 'avisos' AND public.is_admin());

CREATE POLICY "avisos_imagens_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avisos' AND public.is_admin());

-- ─── RPCs ─────────────────────────────────────────────────────────────────────

-- Avisos ativos não vistos pelo usuário atual
CREATE OR REPLACE FUNCTION public.buscar_avisos_pendentes()
RETURNS SETOF public.avisos
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT a.*
  FROM public.avisos a
  WHERE a.ativo = true
    AND NOT EXISTS (
      SELECT 1 FROM public.avisos_vistos v
      WHERE v.aviso_id = a.id
        AND v.user_id = (SELECT auth.uid())
    )
  ORDER BY a.criado_em ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_avisos_pendentes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buscar_avisos_pendentes() TO authenticated;

-- Marca aviso como visto pelo usuário atual
CREATE OR REPLACE FUNCTION public.marcar_aviso_visto(p_aviso_id UUID)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  INSERT INTO public.avisos_vistos (aviso_id, user_id)
  VALUES (p_aviso_id, (SELECT auth.uid()))
  ON CONFLICT DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_aviso_visto(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_aviso_visto(UUID) TO authenticated;

-- Notificações do usuário atual
CREATE OR REPLACE FUNCTION public.buscar_notificacoes(p_limit INT DEFAULT 20)
RETURNS SETOF public.notificacoes
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT *
  FROM public.notificacoes
  WHERE user_id = (SELECT auth.uid())
  ORDER BY criado_em DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_notificacoes(INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buscar_notificacoes(INT) TO authenticated;

-- Marca uma notificação como lida
CREATE OR REPLACE FUNCTION public.marcar_notificacao_lida(p_id UUID)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE public.notificacoes
  SET lida = true
  WHERE id = p_id
    AND user_id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_notificacao_lida(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_notificacao_lida(UUID) TO authenticated;

-- Marca todas as notificações do usuário como lidas
CREATE OR REPLACE FUNCTION public.marcar_todas_notificacoes_lidas()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE public.notificacoes
  SET lida = true
  WHERE user_id = (SELECT auth.uid())
    AND lida = false;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_todas_notificacoes_lidas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_todas_notificacoes_lidas() TO authenticated;

-- RPC admin: listar todos os avisos (incluindo inativos)
CREATE OR REPLACE FUNCTION public.admin_listar_avisos()
RETURNS SETOF public.avisos
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT * FROM public.avisos ORDER BY criado_em DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_listar_avisos() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_avisos() TO authenticated;
