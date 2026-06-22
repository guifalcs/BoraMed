-- ============================================================
-- B5: no máximo UMA assinatura 'authorized' por usuário, garantido no banco.
-- Fecha a corrida (duplo clique / webhooks concorrentes) que podia criar duas
-- linhas 'authorized' e inflar MRR/ativas.
--
-- Cuidado de modelagem: o acesso único (semestral) permanece 'authorized' mesmo
-- após expirar (só `proxima_cobranca` vence). Por isso, ao conceder um novo
-- acesso, o webhook passa a "superar" (cancelar) as assinaturas 'authorized'
-- anteriores do usuário antes de gravar a nova — ver `mp-webhook`. Sem isso, o
-- índice abaixo bloquearia uma reassinatura legítima após o semestral vencer.
-- ============================================================

-- 1) Normaliza o que já existe: para cada usuário com mais de uma assinatura
--    'authorized', mantém a de acesso mais recente (maior proxima_cobranca) e
--    cancela as demais, preservando o histórico.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY proxima_cobranca DESC NULLS LAST, criado_em DESC
         ) AS rn
  FROM public.assinatura
  WHERE status = 'authorized'
)
UPDATE public.assinatura a
   SET status = 'cancelled',
       cancelada_em = COALESCE(a.cancelada_em, now())
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

-- 2) Unicidade efetiva: índice único parcial por usuário entre as 'authorized'.
CREATE UNIQUE INDEX IF NOT EXISTS assinatura_um_authorized_por_user
  ON public.assinatura (user_id)
  WHERE status = 'authorized';
