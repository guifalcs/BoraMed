-- Módulo Materiais de Estudo: bucket privado + categorias + tópicos (preparado) + arquivos PDF.

-- Bucket privado, somente PDFs, 50 MB
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materiais',
  'materiais',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public        = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Categorias do mural
CREATE TABLE IF NOT EXISTS public.material_categoria (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  titulo     text        NOT NULL,
  descricao  text,
  icone      text        NOT NULL DEFAULT 'BookOpen',
  gradiente  text        NOT NULL DEFAULT 'linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)',
  ordem      int         NOT NULL DEFAULT 0,
  ativo      boolean     NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_categoria ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS material_categoria_ordem_idx
  ON public.material_categoria (ordem, criado_em);

REVOKE ALL ON TABLE public.material_categoria FROM anon;
GRANT SELECT ON TABLE public.material_categoria TO authenticated;
GRANT ALL   ON TABLE public.material_categoria TO service_role;

DROP POLICY IF EXISTS material_categoria_select ON public.material_categoria;
CREATE POLICY material_categoria_select
  ON public.material_categoria
  FOR SELECT
  TO authenticated
  USING (
    (ativo AND (SELECT public.tem_assinatura_ativa()))
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS material_categoria_write ON public.material_categoria;
CREATE POLICY material_categoria_write
  ON public.material_categoria
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Tópicos opcionais (FK nullable em material_arquivo; UI de tópicos virá depois)
CREATE TABLE IF NOT EXISTS public.material_topico (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid        NOT NULL REFERENCES public.material_categoria(id) ON DELETE CASCADE,
  titulo       text        NOT NULL,
  ordem        int         NOT NULL DEFAULT 0,
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_topico ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS material_topico_categoria_idx
  ON public.material_topico (categoria_id, ordem);

REVOKE ALL ON TABLE public.material_topico FROM anon;
GRANT SELECT ON TABLE public.material_topico TO authenticated;
GRANT ALL   ON TABLE public.material_topico TO service_role;

DROP POLICY IF EXISTS material_topico_select ON public.material_topico;
CREATE POLICY material_topico_select
  ON public.material_topico
  FOR SELECT
  TO authenticated
  USING (
    (ativo AND (SELECT public.tem_assinatura_ativa()))
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS material_topico_write ON public.material_topico;
CREATE POLICY material_topico_write
  ON public.material_topico
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Arquivos PDF
CREATE TABLE IF NOT EXISTS public.material_arquivo (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id  uuid        NOT NULL REFERENCES public.material_categoria(id) ON DELETE CASCADE,
  topico_id     uuid        REFERENCES public.material_topico(id) ON DELETE SET NULL,
  titulo        text        NOT NULL,
  descricao     text,
  storage_path  text        NOT NULL UNIQUE,
  mime_type     text        NOT NULL DEFAULT 'application/pdf',
  tamanho_bytes bigint,
  ordem         int         NOT NULL DEFAULT 0,
  ativo         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_arquivo_mime_check CHECK (mime_type = 'application/pdf')
);

ALTER TABLE public.material_arquivo ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS material_arquivo_categoria_idx
  ON public.material_arquivo (categoria_id, ordem);

CREATE INDEX IF NOT EXISTS material_arquivo_topico_idx
  ON public.material_arquivo (topico_id)
  WHERE topico_id IS NOT NULL;

REVOKE ALL ON TABLE public.material_arquivo FROM anon;
GRANT SELECT ON TABLE public.material_arquivo TO authenticated;
GRANT ALL   ON TABLE public.material_arquivo TO service_role;

DROP POLICY IF EXISTS material_arquivo_select ON public.material_arquivo;
CREATE POLICY material_arquivo_select
  ON public.material_arquivo
  FOR SELECT
  TO authenticated
  USING (
    (ativo AND (SELECT public.tem_assinatura_ativa()))
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS material_arquivo_write ON public.material_arquivo;
CREATE POLICY material_arquivo_write
  ON public.material_arquivo
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Storage policies para bucket materiais
DROP POLICY IF EXISTS materiais_storage_select ON storage.objects;
CREATE POLICY materiais_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'materiais'
    AND (
      (SELECT public.tem_assinatura_ativa())
      OR (SELECT public.is_admin())
    )
  );

DROP POLICY IF EXISTS materiais_storage_insert ON storage.objects;
CREATE POLICY materiais_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'materiais'
    AND (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS materiais_storage_update ON storage.objects;
CREATE POLICY materiais_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'materiais' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS materiais_storage_delete ON storage.objects;
CREATE POLICY materiais_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'materiais' AND (SELECT public.is_admin()));
