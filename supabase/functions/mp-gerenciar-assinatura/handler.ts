import type { Deps } from '../_shared/deps.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { mpPut } from '../_shared/mp-api.ts';

// Gerencia a assinatura recorrente do próprio usuário no Mercado Pago.
// CONTRATO PRESERVADO do fluxo legado (assinantes atuais dependem dele):
//   request { acao: 'cancelar' | 'pausar' | 'reativar' } → response { status }
//   erros: 400 ação inválida / 401 / 404 sem assinatura / 405 / 502 falha MP.
// A confirmação final do novo status chega via webhook, mas atualizamos
// otimisticamente para refletir na UI imediatamente.
//
// Nova ação (checkout embutido): 'trocar_cartao' com card_token_id gerado pelo
// Brick só-cartão → PUT /preapproval/{id} { card_token_id }. Não altera o
// status local; cobranças seguintes usam o novo cartão.

export async function handleGerenciarAssinatura(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  const mpToken = deps.env('MP_ACCESS_TOKEN');
  if (!mpToken) return reply({ error: 'MP_ACCESS_TOKEN not configured' }, 500);

  const { data: callerData, error: callerError } = await deps
    .caller(authHeader)
    .auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const user = callerData.user;

  let body: { acao?: string; card_token_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }
  const acao = body.acao;
  const acoesStatus = ['cancelar', 'pausar', 'reativar'] as const;
  if (acao !== 'trocar_cartao' && !acoesStatus.includes(acao as typeof acoesStatus[number])) {
    return reply({ error: 'acao inválida (cancelar | pausar | reativar | trocar_cartao)' }, 400);
  }
  if (acao === 'trocar_cartao' && (!body.card_token_id || typeof body.card_token_id !== 'string')) {
    return reply({ error: 'card_token_id obrigatório' }, 400);
  }

  const admin = deps.admin();

  // Pega a assinatura do usuário (a mais recente não cancelada)
  const { data: assin, error: assinError } = await admin
    .from('assinatura')
    .select('id, mp_preapproval_id, status')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assinError || !assin || !assin.mp_preapproval_id) {
    return reply({ error: 'assinatura não encontrada' }, 404);
  }

  const mp = { fetch: deps.fetch, token: mpToken };

  if (acao === 'trocar_cartao') {
    const res = await mpPut(mp, `/preapproval/${assin.mp_preapproval_id}`, {
      card_token_id: body.card_token_id,
    });
    if (!res.ok) {
      console.error('MP PUT preapproval (trocar_cartao) error:', res.status);
      // Recusa do novo cartão é resultado de negócio: a UI mostra a mensagem
      // e a assinatura continua com o cartão anterior.
      if (res.status < 500) {
        return reply({ status: assin.status, card_updated: false });
      }
      return reply({ error: 'falha ao atualizar o cartão no Mercado Pago' }, 502);
    }
    return reply({ status: (res.body['status'] as string | undefined) ?? assin.status, card_updated: true });
  }

  const novoStatus =
    acao === 'cancelar' ? 'cancelled' : acao === 'pausar' ? 'paused' : 'authorized';

  // PUT /preapproval/{id} com o novo status
  const mpRes = await mpPut(mp, `/preapproval/${assin.mp_preapproval_id}`, {
    status: novoStatus,
  });
  if (!mpRes.ok) {
    // Nem o log nem a resposta carregam o body cru do MP (pode conter dados do
    // pagador) — mesmo padrão das edges do checkout embutido.
    console.error('MP PUT preapproval error:', mpRes.status);
    return reply({ error: 'falha ao atualizar assinatura no Mercado Pago' }, 502);
  }

  await admin
    .from('assinatura')
    .update({
      status: novoStatus,
      cancelada_em: novoStatus === 'cancelled' ? deps.now().toISOString() : null,
    })
    .eq('id', assin.id);

  return reply({ status: novoStatus });
}
