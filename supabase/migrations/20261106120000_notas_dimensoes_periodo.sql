-- ════════════════════════════════════════════════════════════════════════════
-- Minhas notas: dimensões de nota por período
--
-- A partir de 2026.2 cada período tem um regulamento com a composição da nota
-- de cada eixo (SOI, HAM, IESC, MCM, PIEPE…), separada em dimensões
-- independentes (Cognitiva × Habilidades e Atitudes, ou Dimensão Única), cada
-- uma com os seus itens avaliativos e pesos. O aluno do período lança as notas
-- que já saíram e a plataforma mostra quanto falta para os 70.
--
-- Posicionamento: calculadora independente montada a partir do regulamento
-- divulgado aos alunos. Nenhum vínculo com a Afya; a nota oficial é a do
-- portal da faculdade.
--
-- Estrutura (árvore editada inteira pelo admin/MCP, ids preservados):
--   notas_regulamento → 1 por período/semestre (rascunho|publicado|arquivado)
--     notas_eixo      → SOI I, HAM I… (exame_especial = cognitiva recuperável)
--       notas_dimensao → cognitiva | habilidades | unica
--         notas_item   → Prova N1 (20), APG (35)… com subitens opcionais
--                        (pai_id: 1 nível só; a nota vai na FOLHA)
--   notas_lancamento    → nota do aluno por item-folha (PK user_id, item_id)
--
-- Acesso:
--   * Estrutura: RLS admin-only; o aluno lê o regulamento PUBLICADO do próprio
--     período por `get_minhas_notas` (SECURITY DEFINER). Escrita só por RPC.
--   * Lançamentos: o aluno lê os seus (RLS) e grava por `salvar_nota_lancamento`,
--     que valida item-folha, regulamento publicado do período dele e o
--     intervalo 0..pontos. Sem grant de escrita direta na tabela.
--   * Só um regulamento PUBLICADO por período: publicar um novo arquiva o
--     anterior (troca de semestre).
--
-- ⚠️ Migration escrita à mão e testada local (não regenerar via db pull: o
-- autogerado re-emite grants default e reabre as tabelas para `anon`).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tabelas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notas_regulamento (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo            SMALLINT     NOT NULL CHECK (periodo BETWEEN 1 AND 12),
  semestre           TEXT         NOT NULL CHECK (semestre ~ '^[0-9]{4}\.[12]$'),
  -- Opcional: sem título a UI monta "1º período · 2026.2".
  titulo             TEXT         CHECK (titulo IS NULL OR length(btrim(titulo)) BETWEEN 1 AND 120),
  -- De onde veio a composição (ex.: "Regulamento do sistema de avaliação 2026.2").
  fonte              TEXT         CHECK (fonte IS NULL OR length(btrim(fonte)) BETWEEN 1 AND 160),
  -- Percentual mínimo de cada dimensão (70 = 70% dos pontos da dimensão).
  nota_minima        NUMERIC(5,2) NOT NULL DEFAULT 70 CHECK (nota_minima > 0 AND nota_minima <= 100),
  -- Piso (%) da cognitiva para ter direito ao exame especial.
  nota_minima_exame  NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (nota_minima_exame >= 0 AND nota_minima_exame <= 100),
  frequencia_minima  SMALLINT     NOT NULL DEFAULT 75 CHECK (frequencia_minima BETWEEN 0 AND 100),
  observacao         TEXT         CHECK (observacao IS NULL OR length(observacao) <= 1000),
  status             TEXT         NOT NULL DEFAULT 'rascunho'
                                  CHECK (status IN ('rascunho', 'publicado', 'arquivado')),
  publicado_em       TIMESTAMPTZ,
  notificado_em      TIMESTAMPTZ,
  criado_por         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT notas_regulamento_exame_abaixo_minima CHECK (nota_minima_exame <= nota_minima)
);

-- Um publicado por período: é o que o aluno daquele período enxerga.
CREATE UNIQUE INDEX IF NOT EXISTS notas_regulamento_publicado_uidx
  ON public.notas_regulamento (periodo) WHERE status = 'publicado';
CREATE INDEX IF NOT EXISTS notas_regulamento_criado_por_idx
  ON public.notas_regulamento (criado_por);

CREATE TABLE IF NOT EXISTS public.notas_eixo (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  regulamento_id  UUID        NOT NULL REFERENCES public.notas_regulamento(id) ON DELETE CASCADE,
  sigla           TEXT        NOT NULL CHECK (length(btrim(sigla)) BETWEEN 1 AND 20),
  nome            TEXT        NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  -- A cognitiva deste eixo admite exame especial (PIEPE, por ex., não).
  exame_especial  BOOLEAN     NOT NULL DEFAULT false,
  ordem           SMALLINT    NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_eixo_regulamento_idx ON public.notas_eixo (regulamento_id, ordem);

CREATE TABLE IF NOT EXISTS public.notas_dimensao (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  eixo_id    UUID        NOT NULL REFERENCES public.notas_eixo(id) ON DELETE CASCADE,
  tipo       TEXT        NOT NULL CHECK (tipo IN ('cognitiva', 'habilidades', 'unica')),
  nome       TEXT        NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  ordem      SMALLINT    NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Deferido: o save reescreve a árvore inteira e pode trocar tipos de lugar.
  CONSTRAINT notas_dimensao_tipo_unico UNIQUE (eixo_id, tipo) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS notas_dimensao_eixo_idx ON public.notas_dimensao (eixo_id, ordem);

CREATE TABLE IF NOT EXISTS public.notas_item (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dimensao_id  UUID         NOT NULL REFERENCES public.notas_dimensao(id) ON DELETE CASCADE,
  -- Subitem (ex.: "1ª parcial" da APG). Um nível só; a nota vai na folha.
  pai_id       UUID         REFERENCES public.notas_item(id) ON DELETE CASCADE,
  nome         TEXT         NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  pontos       NUMERIC(6,2) NOT NULL CHECK (pontos > 0 AND pontos <= 100),
  descricao    TEXT         CHECK (descricao IS NULL OR length(descricao) <= 300),
  ordem        SMALLINT     NOT NULL DEFAULT 0,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT notas_item_nao_e_pai_de_si CHECK (pai_id IS NULL OR pai_id <> id)
);
CREATE INDEX IF NOT EXISTS notas_item_dimensao_idx ON public.notas_item (dimensao_id, ordem);
CREATE INDEX IF NOT EXISTS notas_item_pai_idx ON public.notas_item (pai_id) WHERE pai_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notas_lancamento (
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id        UUID         NOT NULL REFERENCES public.notas_item(id) ON DELETE CASCADE,
  nota           NUMERIC(6,2) NOT NULL CHECK (nota >= 0),
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS notas_lancamento_item_idx ON public.notas_lancamento (item_id);

ALTER TABLE public.notas_regulamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_eixo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_dimensao    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_lancamento  ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['notas_regulamento', 'notas_eixo', 'notas_dimensao', 'notas_item', 'notas_lancamento'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "banidos_bloqueados" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "banidos_bloqueados" ON public.%I AS RESTRICTIVE TO authenticated
         USING (NOT public.is_banned()) WITH CHECK (NOT public.is_banned())', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['notas_regulamento', 'notas_eixo', 'notas_dimensao', 'notas_item'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin_select" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_admin_select" ON public.%I FOR SELECT TO authenticated
         USING ((SELECT public.is_admin()))', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "notas_lancamento_proprio_select" ON public.notas_lancamento;
CREATE POLICY "notas_lancamento_proprio_select"
  ON public.notas_lancamento FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON public.notas_regulamento FROM anon, authenticated;
REVOKE ALL ON public.notas_eixo        FROM anon, authenticated;
REVOKE ALL ON public.notas_dimensao    FROM anon, authenticated;
REVOKE ALL ON public.notas_item        FROM anon, authenticated;
REVOKE ALL ON public.notas_lancamento  FROM anon, authenticated;
GRANT SELECT ON public.notas_regulamento TO authenticated;
GRANT SELECT ON public.notas_eixo        TO authenticated;
GRANT SELECT ON public.notas_dimensao    TO authenticated;
GRANT SELECT ON public.notas_item        TO authenticated;
GRANT SELECT ON public.notas_lancamento  TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Helper: árvore do regulamento em JSON (eixos → dimensões → itens → subitens)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.notas_regulamento_json(p_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'periodo', r.periodo,
    'semestre', r.semestre,
    'titulo', r.titulo,
    'fonte', r.fonte,
    'nota_minima', r.nota_minima,
    'nota_minima_exame', r.nota_minima_exame,
    'frequencia_minima', r.frequencia_minima,
    'observacao', r.observacao,
    'status', r.status,
    'publicado_em', r.publicado_em,
    'notificado_em', r.notificado_em,
    'atualizado_em', r.atualizado_em,
    'eixos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'sigla', e.sigla,
        'nome', e.nome,
        'exame_especial', e.exame_especial,
        'dimensoes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', d.id,
            'tipo', d.tipo,
            'nome', d.nome,
            'pontos_total', COALESCE((
              SELECT sum(i.pontos) FROM public.notas_item i
               WHERE i.dimensao_id = d.id AND i.pai_id IS NULL), 0),
            'itens', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', i.id,
                'nome', i.nome,
                'pontos', i.pontos,
                'descricao', i.descricao,
                'subitens', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'id', s.id, 'nome', s.nome, 'pontos', s.pontos, 'descricao', s.descricao
                  ) ORDER BY s.ordem, s.criado_em)
                  FROM public.notas_item s WHERE s.pai_id = i.id), '[]'::jsonb)
              ) ORDER BY i.ordem, i.criado_em)
              FROM public.notas_item i
              WHERE i.dimensao_id = d.id AND i.pai_id IS NULL), '[]'::jsonb)
          ) ORDER BY d.ordem, d.criado_em)
          FROM public.notas_dimensao d WHERE d.eixo_id = e.id), '[]'::jsonb)
      ) ORDER BY e.ordem, e.criado_em)
      FROM public.notas_eixo e WHERE e.regulamento_id = r.id), '[]'::jsonb)
  )
  FROM public.notas_regulamento r
  WHERE r.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.notas_regulamento_json(UUID) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs do aluno
-- ════════════════════════════════════════════════════════════════════════════

-- Tudo o que a tela "Minhas notas" precisa numa ida: período do perfil, o
-- regulamento publicado desse período (ou null) e os lançamentos do aluno.
-- `periodos_disponiveis` orienta quem está num período ainda sem regulamento.
CREATE OR REPLACE FUNCTION public.get_minhas_notas()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_periodo SMALLINT;
  v_reg_id  UUID;
BEGIN
  IF v_uid IS NULL OR public.is_banned(v_uid) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT p.periodo INTO v_periodo FROM public.profiles p WHERE p.id = v_uid;

  IF v_periodo IS NOT NULL THEN
    SELECT r.id INTO v_reg_id
      FROM public.notas_regulamento r
     WHERE r.periodo = v_periodo AND r.status = 'publicado';
  END IF;

  RETURN jsonb_build_object(
    'periodo', v_periodo,
    'periodos_disponiveis', COALESCE((
      SELECT jsonb_agg(r.periodo ORDER BY r.periodo)
        FROM public.notas_regulamento r WHERE r.status = 'publicado'), '[]'::jsonb),
    'regulamento', CASE WHEN v_reg_id IS NULL THEN NULL ELSE public.notas_regulamento_json(v_reg_id) END,
    'lancamentos', CASE WHEN v_reg_id IS NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('item_id', l.item_id, 'nota', l.nota, 'atualizado_em', l.atualizado_em))
        FROM public.notas_lancamento l
        JOIN public.notas_item i     ON i.id = l.item_id
        JOIN public.notas_dimensao d ON d.id = i.dimensao_id
        JOIN public.notas_eixo e     ON e.id = d.eixo_id
       WHERE l.user_id = v_uid AND e.regulamento_id = v_reg_id), '[]'::jsonb) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_minhas_notas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_minhas_notas() TO authenticated;

-- Lança (ou apaga, com p_nota NULL) a nota do aluno num item-folha.
CREATE OR REPLACE FUNCTION public.salvar_nota_lancamento(p_item_id UUID, p_nota NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_pontos   NUMERIC;
  v_periodo  SMALLINT;
  v_status   TEXT;
  v_nota     NUMERIC;
  v_salvo    TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL OR public.is_banned(v_uid) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT i.pontos, r.periodo, r.status
    INTO v_pontos, v_periodo, v_status
    FROM public.notas_item i
    JOIN public.notas_dimensao d    ON d.id = i.dimensao_id
    JOIN public.notas_eixo e        ON e.id = d.eixo_id
    JOIN public.notas_regulamento r ON r.id = e.regulamento_id
   WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Item com subitens não recebe nota: ela é a soma dos subitens.
  IF EXISTS (SELECT 1 FROM public.notas_item s WHERE s.pai_id = p_item_id) THEN
    RAISE EXCEPTION 'item_tem_subitens' USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'publicado'
     OR v_periodo IS DISTINCT FROM (SELECT p.periodo FROM public.profiles p WHERE p.id = v_uid) THEN
    RAISE EXCEPTION 'regulamento_indisponivel' USING ERRCODE = 'P0001';
  END IF;

  IF p_nota IS NULL THEN
    DELETE FROM public.notas_lancamento WHERE user_id = v_uid AND item_id = p_item_id;
    RETURN jsonb_build_object('item_id', p_item_id, 'nota', NULL, 'atualizado_em', NULL);
  END IF;

  v_nota := round(p_nota, 2);
  IF v_nota < 0 OR v_nota > v_pontos THEN
    RAISE EXCEPTION 'nota_fora_do_intervalo' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.notas_lancamento (user_id, item_id, nota)
  VALUES (v_uid, p_item_id, v_nota)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET nota = EXCLUDED.nota, atualizado_em = now()
  RETURNING atualizado_em INTO v_salvo;

  RETURN jsonb_build_object('item_id', p_item_id, 'nota', v_nota, 'atualizado_em', v_salvo);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_nota_lancamento(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_nota_lancamento(UUID, NUMERIC) TO authenticated;

-- "Recomeçar": apaga todos os lançamentos do aluno num regulamento.
CREATE OR REPLACE FUNCTION public.limpar_minhas_notas(p_regulamento_id UUID)
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_n   INT;
BEGIN
  IF v_uid IS NULL OR public.is_banned(v_uid) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.notas_lancamento l
   USING public.notas_item i, public.notas_dimensao d, public.notas_eixo e
   WHERE l.user_id = v_uid
     AND i.id = l.item_id AND d.id = i.dimensao_id AND e.id = d.eixo_id
     AND e.regulamento_id = p_regulamento_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_minhas_notas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_minhas_notas(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs do admin (também usadas pelo MCP, com o JWT do admin)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_listar_notas_regulamentos()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.periodo, t.semestre DESC, t.criado_em DESC)
    FROM (
      SELECT r.id, r.periodo, r.semestre, r.titulo, r.fonte, r.status, r.publicado_em,
             r.notificado_em, r.criado_em, r.atualizado_em,
             (SELECT count(*) FROM public.notas_eixo e WHERE e.regulamento_id = r.id)::int AS total_eixos,
             (SELECT count(*) FROM public.notas_dimensao d
                JOIN public.notas_eixo e ON e.id = d.eixo_id
               WHERE e.regulamento_id = r.id)::int AS total_dimensoes,
             (SELECT string_agg(e.sigla, ' · ' ORDER BY e.ordem) FROM public.notas_eixo e
               WHERE e.regulamento_id = r.id) AS siglas,
             (SELECT count(DISTINCT l.user_id) FROM public.notas_lancamento l
                JOIN public.notas_item i ON i.id = l.item_id
                JOIN public.notas_dimensao d ON d.id = i.dimensao_id
                JOIN public.notas_eixo e ON e.id = d.eixo_id
               WHERE e.regulamento_id = r.id)::int AS alunos_com_notas,
             (SELECT count(*) FROM public.profiles p
               WHERE p.periodo = r.periodo AND p.papel = 'aluno' AND p.banido = false)::int AS alunos_no_periodo
      FROM public.notas_regulamento r
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_listar_notas_regulamentos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_notas_regulamentos() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_notas_regulamento(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_json JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  v_json := public.notas_regulamento_json(p_id);
  IF v_json IS NULL THEN
    RAISE EXCEPTION 'regulamento_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Quantos lançamentos cada item tem: o editor avisa antes de remover item
  -- que já tem nota de aluno.
  RETURN v_json || jsonb_build_object(
    'lancamentos_por_item', COALESCE((
      SELECT jsonb_object_agg(l.item_id, l.qtd)
        FROM (
          SELECT li.item_id, count(*)::int AS qtd
            FROM public.notas_lancamento li
            JOIN public.notas_item i ON i.id = li.item_id
            JOIN public.notas_dimensao d ON d.id = i.dimensao_id
            JOIN public.notas_eixo e ON e.id = d.eixo_id
           WHERE e.regulamento_id = p_id
           GROUP BY li.item_id
        ) l), '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_notas_regulamento(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_notas_regulamento(UUID) TO authenticated;

-- Cria/atualiza o regulamento inteiro. Itens com `id` existente são
-- atualizados (o lançamento dos alunos fica preso a eles); sem `id`, nascem;
-- o que não vier no payload é excluído (junto com as notas lançadas nele).
--
-- Payload:
-- { id?, periodo, semestre, titulo?, fonte?, nota_minima?, nota_minima_exame?,
--   frequencia_minima?, observacao?,
--   eixos: [{ id?, sigla, nome, exame_especial?,
--     dimensoes: [{ id?, tipo, nome?,
--       itens: [{ id?, nome, pontos, descricao?,
--         subitens?: [{ id?, nome, pontos, descricao? }] }] }] }] }
CREATE OR REPLACE FUNCTION public.admin_salvar_notas_regulamento(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id          UUID := NULLIF(p_payload->>'id', '')::uuid;
  v_periodo     INT;
  v_semestre    TEXT := btrim(COALESCE(p_payload->>'semestre', ''));
  v_minima      NUMERIC := COALESCE(NULLIF(p_payload->>'nota_minima', '')::numeric, 70);
  v_exame       NUMERIC := COALESCE(NULLIF(p_payload->>'nota_minima_exame', '')::numeric, 40);
  v_freq        INT := COALESCE(NULLIF(p_payload->>'frequencia_minima', '')::int, 75);
  v_eixos       JSONB := p_payload->'eixos';
  v_eixo        JSONB;
  v_dim         JSONB;
  v_item        JSONB;
  v_sub         JSONB;
  v_e_ord       INT;
  v_d_ord       INT;
  v_i_ord       INT;
  v_s_ord       INT;
  v_eixo_id     UUID;
  v_dim_id      UUID;
  v_item_id     UUID;
  v_sub_id      UUID;
  v_tipo        TEXT;
  v_tipos       TEXT[];
  v_nome        TEXT;
  v_sigla       TEXT;
  v_pontos      NUMERIC;
  v_soma        NUMERIC;
  v_tem_cog     BOOLEAN;
  v_keep_eixos  UUID[] := '{}';
  v_keep_dims   UUID[] := '{}';
  v_keep_itens  UUID[] := '{}';
  v_removidos   INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_periodo := (p_payload->>'periodo')::int;
  EXCEPTION WHEN others THEN
    v_periodo := NULL;
  END;
  IF v_periodo IS NULL OR v_periodo NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF v_semestre !~ '^[0-9]{4}\.[12]$' THEN
    RAISE EXCEPTION 'semestre_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF v_minima <= 0 OR v_minima > 100 OR v_exame < 0 OR v_exame > v_minima THEN
    RAISE EXCEPTION 'notas_minimas_invalidas' USING ERRCODE = 'P0001';
  END IF;
  IF v_freq NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'frequencia_invalida' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(v_eixos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_eixos) NOT BETWEEN 1 AND 15 THEN
    RAISE EXCEPTION 'quantidade_eixos_invalida' USING ERRCODE = 'P0001';
  END IF;

  -- Cabeçalho
  IF v_id IS NULL THEN
    INSERT INTO public.notas_regulamento (
      periodo, semestre, titulo, fonte, nota_minima, nota_minima_exame,
      frequencia_minima, observacao, criado_por
    ) VALUES (
      v_periodo, v_semestre,
      NULLIF(btrim(p_payload->>'titulo'), ''), NULLIF(btrim(p_payload->>'fonte'), ''),
      v_minima, v_exame, v_freq, NULLIF(btrim(p_payload->>'observacao'), ''), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.notas_regulamento
       SET periodo = v_periodo,
           semestre = v_semestre,
           titulo = NULLIF(btrim(p_payload->>'titulo'), ''),
           fonte = NULLIF(btrim(p_payload->>'fonte'), ''),
           nota_minima = v_minima,
           nota_minima_exame = v_exame,
           frequencia_minima = v_freq,
           observacao = NULLIF(btrim(p_payload->>'observacao'), ''),
           atualizado_em = now()
     WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'regulamento_nao_encontrado' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Eixos
  FOR v_eixo, v_e_ord IN SELECT value, ordinality FROM jsonb_array_elements(v_eixos) WITH ORDINALITY LOOP
    v_sigla := NULLIF(btrim(v_eixo->>'sigla'), '');
    v_nome  := NULLIF(btrim(v_eixo->>'nome'), '');
    IF v_sigla IS NULL OR length(v_sigla) > 20 OR v_nome IS NULL OR length(v_nome) > 120 THEN
      RAISE EXCEPTION 'eixo_invalido' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(v_eixo->'dimensoes') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_eixo->'dimensoes') NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'quantidade_dimensoes_invalida' USING ERRCODE = 'P0001';
    END IF;

    SELECT array_agg(d->>'tipo') INTO v_tipos FROM jsonb_array_elements(v_eixo->'dimensoes') d;
    IF EXISTS (SELECT 1 FROM unnest(v_tipos) t WHERE t IS NULL OR t NOT IN ('cognitiva', 'habilidades', 'unica'))
       OR (SELECT count(DISTINCT t) FROM unnest(v_tipos) t) <> array_length(v_tipos, 1)
       OR ('unica' = ANY (v_tipos) AND array_length(v_tipos, 1) > 1) THEN
      RAISE EXCEPTION 'tipos_dimensao_invalidos' USING ERRCODE = 'P0001';
    END IF;
    v_tem_cog := 'cognitiva' = ANY (v_tipos);

    v_eixo_id := NULLIF(v_eixo->>'id', '')::uuid;
    IF v_eixo_id IS NOT NULL THEN
      UPDATE public.notas_eixo
         SET sigla = v_sigla, nome = v_nome, ordem = v_e_ord,
             exame_especial = v_tem_cog AND COALESCE((v_eixo->>'exame_especial')::boolean, false)
       WHERE id = v_eixo_id AND regulamento_id = v_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'estrutura_invalida' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      INSERT INTO public.notas_eixo (regulamento_id, sigla, nome, ordem, exame_especial)
      VALUES (v_id, v_sigla, v_nome, v_e_ord,
              v_tem_cog AND COALESCE((v_eixo->>'exame_especial')::boolean, false))
      RETURNING id INTO v_eixo_id;
    END IF;
    v_keep_eixos := v_keep_eixos || v_eixo_id;

    -- Dimensões
    FOR v_dim, v_d_ord IN SELECT value, ordinality FROM jsonb_array_elements(v_eixo->'dimensoes') WITH ORDINALITY LOOP
      v_tipo := v_dim->>'tipo';
      v_nome := COALESCE(NULLIF(btrim(v_dim->>'nome'), ''), CASE v_tipo
        WHEN 'cognitiva' THEN 'Dimensão Cognitiva'
        WHEN 'habilidades' THEN 'Habilidades e Atitudes'
        ELSE 'Conhecimentos, Habilidades e Atitudes' END);
      IF length(v_nome) > 80 THEN
        RAISE EXCEPTION 'dimensao_invalida' USING ERRCODE = 'P0001';
      END IF;
      IF jsonb_typeof(v_dim->'itens') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_dim->'itens') NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION 'quantidade_itens_invalida' USING ERRCODE = 'P0001';
      END IF;

      v_dim_id := NULLIF(v_dim->>'id', '')::uuid;
      IF v_dim_id IS NOT NULL THEN
        -- Pode ter mudado de eixo (dentro do mesmo regulamento).
        UPDATE public.notas_dimensao d
           SET eixo_id = v_eixo_id, tipo = v_tipo, nome = v_nome, ordem = v_d_ord
          FROM public.notas_eixo e
         WHERE d.id = v_dim_id AND e.id = d.eixo_id AND e.regulamento_id = v_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'estrutura_invalida' USING ERRCODE = 'P0001';
        END IF;
      ELSE
        INSERT INTO public.notas_dimensao (eixo_id, tipo, nome, ordem)
        VALUES (v_eixo_id, v_tipo, v_nome, v_d_ord)
        RETURNING id INTO v_dim_id;
      END IF;
      v_keep_dims := v_keep_dims || v_dim_id;

      -- Itens (e subitens)
      FOR v_item, v_i_ord IN SELECT value, ordinality FROM jsonb_array_elements(v_dim->'itens') WITH ORDINALITY LOOP
        v_nome := NULLIF(btrim(v_item->>'nome'), '');
        BEGIN
          v_pontos := round((v_item->>'pontos')::numeric, 2);
        EXCEPTION WHEN others THEN
          v_pontos := NULL;
        END;
        IF v_nome IS NULL OR length(v_nome) > 120 OR v_pontos IS NULL OR v_pontos <= 0 OR v_pontos > 100
           OR length(COALESCE(v_item->>'descricao', '')) > 300 THEN
          RAISE EXCEPTION 'item_invalido' USING ERRCODE = 'P0001';
        END IF;

        v_item_id := NULLIF(v_item->>'id', '')::uuid;
        IF v_item_id IS NOT NULL THEN
          UPDATE public.notas_item i
             SET dimensao_id = v_dim_id, pai_id = NULL, nome = v_nome, pontos = v_pontos,
                 descricao = NULLIF(btrim(v_item->>'descricao'), ''), ordem = v_i_ord
            FROM public.notas_dimensao d, public.notas_eixo e
           WHERE i.id = v_item_id AND d.id = i.dimensao_id AND e.id = d.eixo_id AND e.regulamento_id = v_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'estrutura_invalida' USING ERRCODE = 'P0001';
          END IF;
        ELSE
          INSERT INTO public.notas_item (dimensao_id, nome, pontos, descricao, ordem)
          VALUES (v_dim_id, v_nome, v_pontos, NULLIF(btrim(v_item->>'descricao'), ''), v_i_ord)
          RETURNING id INTO v_item_id;
        END IF;
        v_keep_itens := v_keep_itens || v_item_id;

        IF jsonb_typeof(v_item->'subitens') = 'array' AND jsonb_array_length(v_item->'subitens') > 0 THEN
          IF jsonb_array_length(v_item->'subitens') NOT BETWEEN 2 AND 12 THEN
            RAISE EXCEPTION 'quantidade_subitens_invalida' USING ERRCODE = 'P0001';
          END IF;
          v_soma := 0;
          FOR v_sub, v_s_ord IN SELECT value, ordinality FROM jsonb_array_elements(v_item->'subitens') WITH ORDINALITY LOOP
            v_nome := NULLIF(btrim(v_sub->>'nome'), '');
            BEGIN
              v_pontos := round((v_sub->>'pontos')::numeric, 2);
            EXCEPTION WHEN others THEN
              v_pontos := NULL;
            END;
            IF v_nome IS NULL OR length(v_nome) > 120 OR v_pontos IS NULL OR v_pontos <= 0 OR v_pontos > 100
               OR length(COALESCE(v_sub->>'descricao', '')) > 300 THEN
              RAISE EXCEPTION 'item_invalido' USING ERRCODE = 'P0001';
            END IF;
            v_soma := v_soma + v_pontos;

            v_sub_id := NULLIF(v_sub->>'id', '')::uuid;
            IF v_sub_id IS NOT NULL THEN
              UPDATE public.notas_item i
                 SET dimensao_id = v_dim_id, pai_id = v_item_id, nome = v_nome, pontos = v_pontos,
                     descricao = NULLIF(btrim(v_sub->>'descricao'), ''), ordem = v_s_ord
                FROM public.notas_dimensao d, public.notas_eixo e
               WHERE i.id = v_sub_id AND i.id <> v_item_id
                 AND d.id = i.dimensao_id AND e.id = d.eixo_id AND e.regulamento_id = v_id;
              IF NOT FOUND THEN
                RAISE EXCEPTION 'estrutura_invalida' USING ERRCODE = 'P0001';
              END IF;
            ELSE
              INSERT INTO public.notas_item (dimensao_id, pai_id, nome, pontos, descricao, ordem)
              VALUES (v_dim_id, v_item_id, v_nome, v_pontos, NULLIF(btrim(v_sub->>'descricao'), ''), v_s_ord)
              RETURNING id INTO v_sub_id;
            END IF;
            v_keep_itens := v_keep_itens || v_sub_id;
          END LOOP;

          IF abs(v_soma - (SELECT pontos FROM public.notas_item WHERE id = v_item_id)) > 0.009 THEN
            RAISE EXCEPTION 'subitens_nao_somam' USING ERRCODE = 'P0001';
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- O mesmo id não pode aparecer duas vezes na árvore.
  IF (SELECT count(*) FROM unnest(v_keep_itens)) <> (SELECT count(DISTINCT x) FROM unnest(v_keep_itens) x)
     OR (SELECT count(*) FROM unnest(v_keep_dims)) <> (SELECT count(DISTINCT x) FROM unnest(v_keep_dims) x)
     OR (SELECT count(*) FROM unnest(v_keep_eixos)) <> (SELECT count(DISTINCT x) FROM unnest(v_keep_eixos) x) THEN
    RAISE EXCEPTION 'estrutura_invalida' USING ERRCODE = 'P0001';
  END IF;

  -- Remove o que saiu do payload (cascata leva as notas lançadas nesses itens).
  SELECT count(*) INTO v_removidos
    FROM public.notas_lancamento l
    JOIN public.notas_item i ON i.id = l.item_id
    JOIN public.notas_dimensao d ON d.id = i.dimensao_id
    JOIN public.notas_eixo e ON e.id = d.eixo_id
   WHERE e.regulamento_id = v_id AND NOT (i.id = ANY (v_keep_itens));

  DELETE FROM public.notas_item i
   USING public.notas_dimensao d, public.notas_eixo e
   WHERE d.id = i.dimensao_id AND e.id = d.eixo_id AND e.regulamento_id = v_id
     AND NOT (i.id = ANY (v_keep_itens));
  -- Um item que ganhou subitens deixa de ser folha: a nota antiga dele sai.
  -- E nota acima do novo peso (pontos reduzidos) não vale mais.
  WITH apagadas AS (
    DELETE FROM public.notas_lancamento l
     USING public.notas_item i
     WHERE i.id = l.item_id
       AND l.item_id = ANY (v_keep_itens)
       AND (EXISTS (SELECT 1 FROM public.notas_item s WHERE s.pai_id = l.item_id) OR l.nota > i.pontos)
    RETURNING 1
  )
  SELECT v_removidos + count(*) INTO v_removidos FROM apagadas;
  DELETE FROM public.notas_dimensao d
   USING public.notas_eixo e
   WHERE e.id = d.eixo_id AND e.regulamento_id = v_id AND NOT (d.id = ANY (v_keep_dims));
  DELETE FROM public.notas_eixo e
   WHERE e.regulamento_id = v_id AND NOT (e.id = ANY (v_keep_eixos));

  RETURN jsonb_build_object(
    'id', v_id,
    'status', (SELECT status FROM public.notas_regulamento WHERE id = v_id),
    'lancamentos_removidos', v_removidos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_salvar_notas_regulamento(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_notas_regulamento(JSONB) TO authenticated;

-- Publica (arquivando o publicado anterior do mesmo período) ou volta para
-- rascunho. Com p_notificar, avisa no app os alunos do período (uma vez só).
CREATE OR REPLACE FUNCTION public.admin_publicar_notas_regulamento(
  p_id UUID, p_publicar BOOLEAN, p_notificar BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_r            public.notas_regulamento%ROWTYPE;
  v_arquivado    UUID;
  v_notificados  INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_r FROM public.notas_regulamento WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'regulamento_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_publicar THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notas_item i
        JOIN public.notas_dimensao d ON d.id = i.dimensao_id
        JOIN public.notas_eixo e ON e.id = d.eixo_id
       WHERE e.regulamento_id = p_id
    ) THEN
      RAISE EXCEPTION 'regulamento_vazio' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.notas_regulamento
       SET status = 'arquivado', atualizado_em = now()
     WHERE periodo = v_r.periodo AND status = 'publicado' AND id <> p_id
     RETURNING id INTO v_arquivado;

    UPDATE public.notas_regulamento
       SET status = 'publicado', publicado_em = COALESCE(publicado_em, now()), atualizado_em = now()
     WHERE id = p_id
     RETURNING * INTO v_r;

    IF p_notificar AND v_r.notificado_em IS NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, dados)
      SELECT pr.id, 'info',
             'Suas notas do ' || v_r.periodo || 'º período, organizadas',
             'Lance as notas que já saíram e veja quanto falta para os ' || trim_scale(v_r.nota_minima) || ' em cada dimensão.',
             jsonb_build_object('link', '/dashboard/notas')
        FROM public.profiles pr
        JOIN auth.users u ON u.id = pr.id
       WHERE pr.papel = 'aluno'
         AND pr.banido = false
         AND pr.periodo = v_r.periodo
         AND u.email_confirmed_at IS NOT NULL
         AND u.deleted_at IS NULL;
      GET DIAGNOSTICS v_notificados = ROW_COUNT;
      IF v_notificados > 0 THEN
        UPDATE public.notas_regulamento SET notificado_em = now() WHERE id = p_id
        RETURNING * INTO v_r;
      END IF;
    END IF;
  ELSE
    UPDATE public.notas_regulamento
       SET status = 'rascunho', atualizado_em = now()
     WHERE id = p_id
     RETURNING * INTO v_r;
  END IF;

  RETURN jsonb_build_object(
    'status', v_r.status,
    'publicado_em', v_r.publicado_em,
    'notificado_em', v_r.notificado_em,
    'notificados', v_notificados,
    'arquivado_id', v_arquivado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publicar_notas_regulamento(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publicar_notas_regulamento(UUID, BOOLEAN, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_excluir_notas_regulamento(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notas_regulamento WHERE id = p_id) THEN
    RAISE EXCEPTION 'regulamento_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Defesa em profundidade: o que está no ar sai do ar antes de ser apagado.
  IF EXISTS (SELECT 1 FROM public.notas_regulamento WHERE id = p_id AND status = 'publicado') THEN
    RAISE EXCEPTION 'regulamento_publicado' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.notas_regulamento WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_excluir_notas_regulamento(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_excluir_notas_regulamento(UUID) TO authenticated;
