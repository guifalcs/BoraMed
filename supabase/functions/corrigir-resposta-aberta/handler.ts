// Corrige UMA resposta aberta por chamada (D7): o cliente faz fan-out por
// questão. Claim idempotente em `resposta_correcao` (pendente/erro →
// corrigindo) permite retry seguro e chamadas concorrentes.
//
// Estados de resposta_correcao:
//   pendente   → criada pela RPC enviar_resposta_aberta, aguardando correção
//   corrigindo → claimed por uma chamada em andamento
//   corrigida  → sucesso (pontos/feedback preenchidos)
//   erro       → tentativas esgotadas; nova chamada re-claima e tenta de novo
//   sem_ia     → IA não configurada/indisponível em definitivo; a questão
//                sai do denominador da nota (consolidar_correcoes_tentativa)

import type { Deps } from '../_shared/deps.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { GradingError, type GradingResult } from '../_shared/grading-provider.ts';

const MAX_TENTATIVAS_LLM = 3; // 1 chamada + 2 retries
const DEFAULT_DAILY_LIMIT = 200;
const MAX_RESPOSTA_ALUNO = 3_000;

interface RespostaCorrecaoRow {
  id: string;
  tentativa_resposta_id: string;
  status: string;
  num_tentativas: number;
  [k: string]: unknown;
}

export async function handleCorrigirRespostaAberta(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  const { data: callerData, error: callerError } = await deps.caller(authHeader).auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  let body: { tentativa_resposta_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const trId = body.tentativa_resposta_id;
  if (!trId || typeof trId !== 'string') {
    return reply({ error: 'tentativa_resposta_id obrigatório' }, 400);
  }

  const admin = deps.admin();

  // ---- Carrega resposta + tentativa (ownership) + questão (gabarito) ----
  const { data: tr } = await admin
    .from('tentativa_resposta')
    .select('id, tentativa_id, questao_id, resposta_texto, enviada_em')
    .eq('id', trId)
    .maybeSingle();
  if (!tr) return reply({ error: 'resposta não encontrada' }, 404);

  const { data: tentativa } = await admin
    .from('tentativa')
    .select('id, user_id')
    .eq('id', tr.tentativa_id)
    .maybeSingle();
  if (!tentativa || tentativa.user_id !== user.id) {
    // 404 (e não 403) para não confirmar a existência de respostas alheias.
    return reply({ error: 'resposta não encontrada' }, 404);
  }

  if (!tr.enviada_em) return reply({ error: 'resposta ainda não enviada' }, 409);
  const respostaAluno = String(tr.resposta_texto ?? '').slice(0, MAX_RESPOSTA_ALUNO);

  const { data: questao } = await admin
    .from('questao')
    .select('id, enunciado, enunciado_apoio, formato, resposta_modelo, pontos_chave, criterios_correcao')
    .eq('id', tr.questao_id)
    .maybeSingle();
  if (!questao || questao.formato !== 'resposta_aberta_curta') {
    return reply({ error: 'questão não é discursiva' }, 400);
  }

  const { data: correcao } = await admin
    .from('resposta_correcao')
    .select('*')
    .eq('tentativa_resposta_id', trId)
    .maybeSingle() as { data: RespostaCorrecaoRow | null };
  if (!correcao) return reply({ error: 'correção não registrada para esta resposta' }, 404);

  // Estados terminais: idempotência barata para o fan-out do cliente.
  if (correcao.status === 'corrigida' || correcao.status === 'sem_ia') {
    return reply({ correcao });
  }

  // ---- IA indisponível → sem_ia (o app segue funcionando sem IA) ----
  const provider = deps.gradingProvider();
  if (!provider) {
    const { data: semIa } = await admin
      .from('resposta_correcao')
      .update({ status: 'sem_ia', atualizado_em: deps.now().toISOString() })
      .eq('tentativa_resposta_id', trId)
      .in('status', ['pendente', 'erro', 'corrigindo'])
      .select()
      .maybeSingle();
    return reply({ correcao: semIa ?? { ...correcao, status: 'sem_ia' } });
  }

  // ---- Cap diário de correções por usuário (D16) ----
  const limite = Number(deps.env('AI_GRADING_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
  const inicioDia = new Date(deps.now());
  inicioDia.setUTCHours(0, 0, 0, 0);
  const { data: rcHoje } = await admin
    .from('resposta_correcao')
    .select('tentativa_resposta_id')
    .gte('atualizado_em', inicioDia.toISOString())
    .in('status', ['corrigida', 'corrigindo', 'erro']);
  if (rcHoje && rcHoje.length >= limite) {
    // Só paga o custo das 2 queries de atribuição quando o volume global do
    // dia já alcança o limite (senão nenhum usuário pode ter estourado).
    const trIds = rcHoje.map((r: { tentativa_resposta_id: string }) => r.tentativa_resposta_id);
    const { data: trsHoje } = await admin
      .from('tentativa_resposta')
      .select('id, tentativa_id')
      .in('id', trIds);
    const tentativaIds = [...new Set((trsHoje ?? []).map((r: { tentativa_id: string }) => r.tentativa_id))];
    const { data: minhas } = await admin
      .from('tentativa')
      .select('id')
      .in('id', tentativaIds)
      .eq('user_id', user.id);
    const minhasIds = new Set((minhas ?? []).map((t: { id: string }) => t.id));
    const doUsuario = (trsHoje ?? []).filter((r: { tentativa_id: string }) => minhasIds.has(r.tentativa_id)).length;
    if (doUsuario >= limite) {
      return reply({ error: 'limite diário de correções atingido' }, 429);
    }
  }

  // ---- Claim idempotente (D7) ----
  const { data: claimed } = await admin
    .from('resposta_correcao')
    .update({
      status: 'corrigindo',
      num_tentativas: (correcao.num_tentativas ?? 0) + 1,
      atualizado_em: deps.now().toISOString(),
    })
    .eq('tentativa_resposta_id', trId)
    .in('status', ['pendente', 'erro'])
    .select()
    .maybeSingle();
  if (!claimed) {
    // Outra chamada está corrigindo agora; o cliente faz poll.
    return reply({ correcao: { ...correcao, status: 'corrigindo' } }, 202);
  }

  // ---- Correção com retry ----
  let resultado: GradingResult | null = null;
  let ultimoErro = '';
  for (let i = 0; i < MAX_TENTATIVAS_LLM; i++) {
    try {
      resultado = await provider.corrigir({
        enunciado: questao.enunciado,
        enunciado_apoio: questao.enunciado_apoio ?? null,
        resposta_modelo: questao.resposta_modelo ?? '',
        pontos_chave: Array.isArray(questao.pontos_chave) ? questao.pontos_chave : [],
        criterios_correcao: questao.criterios_correcao ?? null,
        resposta_aluno: respostaAluno,
      });
      break;
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      const retryable = e instanceof GradingError ? e.retryable : false;
      if (!retryable || i === MAX_TENTATIVAS_LLM - 1) break;
      await deps.sleep(500 * 2 ** i);
    }
  }

  if (!resultado) {
    const { data: comErro } = await admin
      .from('resposta_correcao')
      .update({
        status: 'erro',
        erro_detalhe: ultimoErro.slice(0, 500),
        atualizado_em: deps.now().toISOString(),
      })
      .eq('tentativa_resposta_id', trId)
      .eq('status', 'corrigindo')
      .select()
      .maybeSingle();
    console.error('corrigir-resposta-aberta: correção falhou', { trId, erro: ultimoErro });
    return reply({ error: 'correção falhou', correcao: comErro }, 502);
  }

  // ---- Persiste sucesso ----
  const { data: corrigida } = await admin
    .from('resposta_correcao')
    .update({
      status: 'corrigida',
      pontos: resultado.pontos,
      feedback: resultado.feedback,
      pontos_atendidos: resultado.pontos_atendidos,
      pontos_faltantes: resultado.pontos_faltantes,
      erros: resultado.erros,
      provider: resultado.provider,
      modelo: resultado.modelo,
      tokens_prompt: resultado.tokens_prompt,
      tokens_resposta: resultado.tokens_resposta,
      custo_usd: resultado.custo_usd,
      erro_detalhe: null,
      atualizado_em: deps.now().toISOString(),
    })
    .eq('tentativa_resposta_id', trId)
    .select()
    .maybeSingle();

  await admin
    .from('tentativa_resposta')
    .update({ pontos: resultado.pontos })
    .eq('id', trId);

  return reply({ correcao: corrigida });
}
