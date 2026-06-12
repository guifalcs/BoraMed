-- Suporte: anexos privados em mensagens de tickets.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'suporte-anexos',
  'suporte-anexos',
  false,
  26214400,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.suporte_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id uuid NOT NULL REFERENCES public.suporte_mensagens(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.suporte_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  mime_type text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suporte_anexos_mime_type_check CHECK (
    mime_type = ANY (ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]::text[])
  ),
  CONSTRAINT suporte_anexos_tamanho_check CHECK (
    tamanho_bytes > 0
    AND tamanho_bytes <= 26214400
  ),
  CONSTRAINT suporte_anexos_storage_owner_check CHECK (
    split_part(storage_path, '/', 1) = user_id::text
  )
);

ALTER TABLE public.suporte_anexos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS suporte_anexos_ticket_idx
  ON public.suporte_anexos (ticket_id, criado_em);

CREATE INDEX IF NOT EXISTS suporte_anexos_mensagem_idx
  ON public.suporte_anexos (mensagem_id, criado_em);

REVOKE ALL ON TABLE public.suporte_anexos FROM anon;
GRANT SELECT, INSERT ON TABLE public.suporte_anexos TO authenticated;
GRANT ALL ON TABLE public.suporte_anexos TO service_role;

DROP POLICY IF EXISTS suporte_anexos_select_ticket ON public.suporte_anexos;
CREATE POLICY suporte_anexos_select_ticket
  ON public.suporte_anexos
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.suporte_tickets t
      WHERE t.id = suporte_anexos.ticket_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS suporte_anexos_insert_own_message ON public.suporte_anexos;
CREATE POLICY suporte_anexos_insert_own_message
  ON public.suporte_anexos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND split_part(storage_path, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.suporte_mensagens m
      JOIN public.suporte_tickets t ON t.id = m.ticket_id
      WHERE m.id = suporte_anexos.mensagem_id
        AND m.ticket_id = suporte_anexos.ticket_id
        AND m.autor_id = (SELECT auth.uid())
        AND (t.user_id = (SELECT auth.uid()) OR public.is_admin())
        AND t.status <> 'resolvido'
    )
  );

DROP POLICY IF EXISTS suporte_anexos_storage_select ON storage.objects;
CREATE POLICY suporte_anexos_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'suporte-anexos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR EXISTS (
        SELECT 1
        FROM public.suporte_anexos a
        JOIN public.suporte_tickets t ON t.id = a.ticket_id
        WHERE a.storage_path = storage.objects.name
          AND t.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS suporte_anexos_storage_insert ON storage.objects;
CREATE POLICY suporte_anexos_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'suporte-anexos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS suporte_anexos_storage_delete_unlinked ON storage.objects;
CREATE POLICY suporte_anexos_storage_delete_unlinked
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'suporte-anexos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.suporte_anexos a
      WHERE a.storage_path = storage.objects.name
    )
  );

CREATE OR REPLACE FUNCTION public.buscar_anexos_ticket(p_ticket_id uuid)
RETURNS SETOF public.suporte_anexos
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT a.*
  FROM public.suporte_anexos a
  WHERE a.ticket_id = p_ticket_id
  ORDER BY a.criado_em;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_anexos_ticket(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buscar_anexos_ticket(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_anexos_mensagem(
  p_mensagem_id uuid,
  p_anexos jsonb
)
RETURNS SETOF public.suporte_anexos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_ticket_id uuid;
  v_existing_count integer;
  v_new_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  IF p_anexos IS NULL OR jsonb_typeof(p_anexos) <> 'array' THEN
    RAISE EXCEPTION 'Lista de anexos invalida';
  END IF;

  v_new_count := jsonb_array_length(p_anexos);
  IF v_new_count = 0 THEN
    RETURN;
  END IF;

  SELECT m.ticket_id
  INTO v_ticket_id
  FROM public.suporte_mensagens m
  JOIN public.suporte_tickets t ON t.id = m.ticket_id
  WHERE m.id = p_mensagem_id
    AND m.autor_id = v_uid
    AND (t.user_id = v_uid OR public.is_admin())
    AND t.status <> 'resolvido';

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Mensagem indisponivel para anexos';
  END IF;

  SELECT COUNT(*)
  INTO v_existing_count
  FROM public.suporte_anexos a
  WHERE a.mensagem_id = p_mensagem_id;

  IF v_existing_count + v_new_count > 3 THEN
    RAISE EXCEPTION 'Limite de 3 anexos por mensagem';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_anexos) AS item
    WHERE COALESCE(item->>'storage_path', '') = ''
      OR COALESCE(item->>'nome_arquivo', '') = ''
      OR COALESCE(item->>'mime_type', '') = ''
      OR COALESCE(item->>'tamanho_bytes', '') = ''
      OR split_part(item->>'storage_path', '/', 1) <> v_uid::text
  ) THEN
    RAISE EXCEPTION 'Metadados de anexo invalidos';
  END IF;

  RETURN QUERY
  INSERT INTO public.suporte_anexos (
    mensagem_id,
    ticket_id,
    user_id,
    storage_path,
    nome_arquivo,
    mime_type,
    tamanho_bytes
  )
  SELECT
    p_mensagem_id,
    v_ticket_id,
    v_uid,
    item->>'storage_path',
    item->>'nome_arquivo',
    item->>'mime_type',
    (item->>'tamanho_bytes')::bigint
  FROM jsonb_array_elements(p_anexos) AS item
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_anexos_mensagem(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_anexos_mensagem(uuid, jsonb) TO authenticated;
