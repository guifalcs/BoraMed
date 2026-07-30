// ============================================================
// enviar-campanha-email — disparo de campanhas via Resend
//
// Modos (body.modo):
//   'teste'   → envia UMA cópia para o e-mail informado (ou o do próprio admin),
//               sem criar campanha nem tocar na base de destinatários;
//   'enviar'  → materializa o público do segmento, cria a campanha e dispara;
//   'previa'  → renderiza o e-mail (mesmo montarEmail() do envio) e devolve o
//               HTML sem tocar no Resend nem na base — é o preview do admin;
//   'retomar' → reprocessa os destinatários 'pendente' (nunca tentados) e
//               'falhou' (o Resend recusou) de uma campanha existente. Nunca
//               reenvia para quem já está 'enviado' — a UNIQUE (campanha_id,
//               email) + o status são a garantia de idempotência.
//
// Secrets necessários:
//   RESEND_API_KEY   chave da API do Resend
//   RESEND_FROM      remetente padrão, ex.: "BoraMed <contato@boramedoficial.com.br>"
//   APP_URL          base pública do app (monta o link de descadastro)
//   EMAIL_ASSETS_URL opcional — host da logo do envelope. Só é necessário em
//                    desenvolvimento, onde a APP_URL é localhost e o proxy de
//                    imagem do Gmail não alcança.
// ============================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  Destinatario,
  dividirEmLotes,
  isSegmento,
  montarEmail,
  remetenteValido,
  TAMANHO_LOTE,
} from '../_shared/campanha-email.ts';

/** Rate limit padrão do Resend: 2 req/s. 600ms deixa folga. */
const INTERVALO_ENTRE_LOTES_MS = 600;

/**
 * Orçamento de tempo do disparo. A edge function é derrubada por volta dos
 * 150s de parede; parando antes por conta própria a campanha fecha como
 * 'parcial' com o log íntegro, e o admin clica em "Retomar" — em vez de morrer
 * no meio de um lote sem saber o que saiu.
 */
const ORCAMENTO_MS = 100_000;

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';

type Modo = 'previa' | 'teste' | 'enviar' | 'retomar';

type Body = {
  modo?: Modo;
  nome?: string;
  assunto?: string;
  html?: string;
  segmento?: string;
  remetente?: string;
  email_teste?: string;
  campanha_id?: string;
};

type LinhaDestinatario = {
  id: string;
  email: string;
  nome_completo: string | null;
  email_token: string;
  user_id: string | null;
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Página do PostgREST. O `max_rows = 1000` do projeto trunca QUALQUER resposta
 * — inclusive a RPC que monta o público. Sem paginar, uma campanha para 3.000
 * pessoas sairia para 1.000 e reportaria sucesso.
 */
const PAGINA = 1000;

/** Teto de segurança: evita loop infinito se a paginação der errado. */
const MAX_DESTINATARIOS = 50_000;

type PaginaResposta = { data: unknown[] | null; error: { message: string } | null };

/** Percorre todas as páginas de uma query/RPC até esgotar os resultados. */
async function buscarTudo<T>(
  query: (de: number, ate: number) => PromiseLike<PaginaResposta>,
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; de < MAX_DESTINATARIOS; de += PAGINA) {
    const { data, error } = await query(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    tudo.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tudo;
}

/**
 * Destinatário fictício da prévia e do e-mail de teste: personaliza com o nome
 * do próprio admin, para ele ver o resultado real dos {{tokens}}. O token de
 * descadastro é zerado de propósito — o link do rodapé de uma prévia ou de um
 * teste nunca descadastra ninguém.
 */
function destinatarioDeAmostra(
  caller: { id: string; email?: string },
  perfil: { nome_completo?: unknown } | null,
  email = caller.email ?? '',
): Destinatario {
  return {
    user_id: caller.id,
    email,
    nome_completo: (perfil?.nome_completo as string | null) ?? 'Fulano de Tal',
    email_token: '00000000-0000-0000-0000-000000000000',
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const reply = (data: unknown, status = 200) => json(data, status, cors);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'missing token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const remetentePadrao = Deno.env.get('RESEND_FROM') ?? '';
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  /**
   * Host da logo do envelope. Separado da APP_URL porque o Gmail/Outlook busca
   * imagem por proxy na nuvem: com APP_URL de desenvolvimento
   * (`http://localhost:4200`) a logo chega quebrada na caixa de entrada. Em
   * produção pode ficar vazio — a APP_URL já é pública.
   */
  const assetsUrl = (Deno.env.get('EMAIL_ASSETS_URL') ?? '').replace(/\/$/, '');

  if (!appUrl) return reply({ error: 'APP_URL não configurada' }, 500);

  // --- Identidade do chamador ---
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return reply({ error: 'unauthorized' }, 401);
  const caller = callerData.user;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('papel, nome_completo')
    .eq('id', caller.id)
    .single();
  const papel = callerProfile?.papel as string | undefined;
  if (papel !== 'admin' && papel !== 'super_admin') {
    return reply({ error: 'forbidden' }, 403);
  }

  // --- Body ---
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'invalid body' }, 400);
  }

  const modo = body.modo ?? 'teste';
  if (modo !== 'previa' && modo !== 'teste' && modo !== 'enviar' && modo !== 'retomar') {
    return reply({ error: 'modo inválido' }, 400);
  }

  const remetente = (body.remetente ?? remetentePadrao).trim();
  // A prévia não envia nada: nem exige remetente válido nem chave do Resend —
  // dá para conferir o layout antes de o domínio estar verificado.
  if ((modo === 'teste' || modo === 'enviar') && !remetenteValido(remetente)) {
    return reply(
      { error: 'remetente inválido — use "Nome <email@dominio>" ou configure RESEND_FROM' },
      400,
    );
  }

  // ============================================================
  // Modo PRÉVIA — renderiza e devolve. Nenhuma chamada externa.
  // ============================================================
  if (modo === 'previa') {
    const assunto = (body.assunto ?? '').trim();
    const html = body.html ?? '';
    if (!html.trim()) return reply({ error: 'corpo do e-mail obrigatório' }, 400);

    const email = montarEmail(destinatarioDeAmostra(caller, callerProfile), {
      remetente,
      assunto,
      htmlBase: html,
      appUrl,
      assetsUrl,
    });

    return reply({
      modo: 'previa',
      remetente: email.from,
      destino: email.to[0],
      assunto: email.subject,
      html: email.html,
    });
  }

  if (!resendKey) return reply({ error: 'RESEND_API_KEY não configurada' }, 500);
  const enviarLote = criarEnviadorDeLote(resendKey);

  // ============================================================
  // Modo TESTE — não cria campanha, não registra destinatários.
  // ============================================================
  if (modo === 'teste') {
    const assunto = (body.assunto ?? '').trim();
    const html = body.html ?? '';
    if (!assunto) return reply({ error: 'assunto obrigatório' }, 400);
    if (!html.trim()) return reply({ error: 'corpo do e-mail obrigatório' }, 400);

    const destino = (body.email_teste ?? caller.email ?? '').trim();
    if (!destino) return reply({ error: 'email de teste obrigatório' }, 400);

    const email = montarEmail(destinatarioDeAmostra(caller, callerProfile, destino), {
      remetente,
      assunto,
      htmlBase: html,
      appUrl,
      assetsUrl,
    });

    const resultado = await enviarLote([email]);
    if (!resultado.ok) return reply({ error: `Resend: ${resultado.erro}` }, 502);
    return reply({ modo: 'teste', destino, enviados: 1 });
  }

  // ============================================================
  // Modo ENVIAR — materializa o público e cria a campanha.
  // ============================================================
  let campanhaId: string;

  if (modo === 'enviar') {
    const nome = (body.nome ?? '').trim();
    const assunto = (body.assunto ?? '').trim();
    const html = body.html ?? '';
    const segmento = body.segmento;

    if (!nome) return reply({ error: 'nome da campanha obrigatório' }, 400);
    if (!assunto) return reply({ error: 'assunto obrigatório' }, 400);
    if (!html.trim()) return reply({ error: 'corpo do e-mail obrigatório' }, 400);
    if (!isSegmento(segmento)) return reply({ error: 'segmento inválido' }, 400);

    let publico: Destinatario[];
    try {
      publico = await buscarTudo<Destinatario>((de, ate) =>
        admin.rpc('email_publico_alvo', { p_segmento: segmento }).range(de, ate)
      );
    } catch (e) {
      console.error('email_publico_alvo:', e instanceof Error ? e.message : e);
      return reply({ error: 'falha ao montar o público' }, 500);
    }

    if (publico.length === 0) {
      return reply({ error: 'nenhum destinatário nesse segmento' }, 400);
    }

    const { data: campanha, error: campanhaError } = await admin
      .from('email_campanha')
      .insert({
        criado_por: caller.id,
        nome,
        assunto,
        corpo_html: html,
        remetente,
        segmento,
        status: 'enviando',
        total_destinatarios: publico.length,
      })
      .select('id')
      .single();
    if (campanhaError || !campanha) {
      console.error('insert campanha:', campanhaError?.message);
      return reply({ error: 'falha ao registrar a campanha' }, 500);
    }
    campanhaId = campanha.id as string;

    // Registrar TODOS os destinatários antes de enviar qualquer coisa: se a
    // função morrer no meio, o que falta continua rastreável em 'pendente'.
    const linhas = publico.map((d) => ({
      campanha_id: campanhaId,
      user_id: d.user_id,
      email: d.email,
      nome_completo: d.nome_completo,
      email_token: d.email_token,
      status: 'pendente',
    }));
    for (const lote of dividirEmLotes(linhas, 500)) {
      const { error } = await admin.from('email_campanha_destinatario').insert(lote);
      if (error) {
        console.error('insert destinatarios:', error.message);
        await admin
          .from('email_campanha')
          .update({ status: 'falhou', erro: 'falha ao registrar destinatários' })
          .eq('id', campanhaId);
        return reply({ error: 'falha ao registrar destinatários' }, 500);
      }
    }
  } else {
    // --- Modo RETOMAR ---
    const id = (body.campanha_id ?? '').trim();
    if (!id) return reply({ error: 'campanha_id obrigatório' }, 400);

    const { data: campanha, error } = await admin
      .from('email_campanha')
      .select('id, status')
      .eq('id', id)
      .single();
    if (error || !campanha) return reply({ error: 'campanha não encontrada' }, 404);
    if (campanha.status === 'enviada') {
      return reply({ error: 'campanha já concluída' }, 400);
    }
    campanhaId = campanha.id as string;

    await admin.from('email_campanha').update({ status: 'enviando', erro: null }).eq('id', campanhaId);
  }

  const resumo = await processarCampanha({
    admin,
    campanhaId,
    appUrl,
    assetsUrl,
    enviarLote,
  });

  // Sempre 200: mesmo com status 'falhou' o corpo é um RESUMO útil (campanha
  // criada, quantos saíram, quantos ficaram). Devolver 4xx/5xx aqui faria o
  // supabase-js descartar isso e entregar só "non-2xx status code" à tela.
  return reply({ campanha_id: campanhaId, ...resumo });
});

// ============================================================
// Envio
// ============================================================

type ResultadoLote =
  | { ok: true; ids: (string | null)[] }
  | { ok: false; erro: string; status?: number };

function criarEnviadorDeLote(apiKey: string) {
  return async function enviarLote(
    emails: readonly unknown[],
    tentativa = 0,
  ): Promise<ResultadoLote> {
    let resposta: Response;
    try {
      resposta = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emails),
      });
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'erro de rede' };
    }

    const texto = await resposta.text();

    // 429 (rate limit) e 5xx são transitórios: uma nova tentativa com espera
    // costuma resolver. Erro 4xx de conteúdo não adianta repetir.
    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < 2) {
      await dormir(1000 * (tentativa + 1));
      return enviarLote(emails, tentativa + 1);
    }

    if (!resposta.ok) {
      return { ok: false, erro: `${resposta.status} ${texto.slice(0, 300)}`, status: resposta.status };
    }

    // Resposta: { data: [{ id }, ...] } na MESMA ordem do payload enviado.
    try {
      const corpo = JSON.parse(texto) as { data?: { id?: string }[] };
      const ids = (corpo.data ?? []).map((d) => d.id ?? null);
      return { ok: true, ids };
    } catch {
      return { ok: true, ids: [] };
    }
  };
}

async function processarCampanha(deps: {
  admin: SupabaseClient;
  campanhaId: string;
  appUrl: string;
  assetsUrl: string;
  enviarLote: (emails: readonly unknown[]) => Promise<ResultadoLote>;
}): Promise<{
  status: 'enviada' | 'parcial' | 'falhou';
  enviados: number;
  falhas: number;
  cancelados: number;
  pendentes: number;
}> {
  const { admin, campanhaId, appUrl, assetsUrl, enviarLote } = deps;
  const inicio = Date.now();

  const { data: campanha } = await admin
    .from('email_campanha')
    .select('assunto, corpo_html, remetente')
    .eq('id', campanhaId)
    .single();
  if (!campanha) {
    return { status: 'falhou', enviados: 0, falhas: 0, cancelados: 0, pendentes: 0 };
  }

  /**
   * Fila desta rodada: 'pendente' (nunca tentado) E 'falhou' (tentado e o Resend
   * recusou). Incluir 'falhou' é o que faz "Retomar" servir para o caso mais
   * comum de verdade — estourar a cota diária do Resend marca centenas de linhas
   * como 'falhou', e sem isto elas nunca mais seriam tentadas.
   *
   * Nunca inclui 'enviado': é o status que garante não duplicar entrega. Uma
   * linha só vira 'falhou' depois de resposta não-2xx do Resend, então não houve
   * entrega. A exceção teórica — 5xx depois de o Resend já ter enfileirado —
   * pode gerar um e-mail repetido; o retry vale mais que esse risco.
   */
  let aEnviar: LinhaDestinatario[];
  try {
    aEnviar = await buscarTudo<LinhaDestinatario>((de, ate) =>
      admin
        .from('email_campanha_destinatario')
        .select('id, email, nome_completo, email_token, user_id')
        .eq('campanha_id', campanhaId)
        .in('status', ['pendente', 'falhou'])
        .order('criado_em')
        .range(de, ate)
    );
  } catch (e) {
    console.error(`campanha ${campanhaId}: falha ao ler pendentes —`, e);
    return { status: 'falhou', enviados: 0, falhas: 0, cancelados: 0, pendentes: 0 };
  }

  // Reconferir o opt-out: entre montar a lista e enviar (ou retomar horas
  // depois) alguém pode ter clicado em "não quero mais receber". Esse clique
  // vale mais que a lista congelada.
  let cancelados = 0;
  const userIds = aEnviar.map((p) => p.user_id).filter((id): id is string => !!id);
  if (userIds.length > 0) {
    const optouts = new Set<string>();
    for (const lote of dividirEmLotes(userIds, 500)) {
      const { data } = await admin
        .from('profiles')
        .select('id')
        .in('id', lote)
        .eq('email_marketing_optout', true);
      for (const linha of (data ?? []) as { id: string }[]) optouts.add(linha.id);
    }
    if (optouts.size > 0) {
      const cancelar = aEnviar.filter((p) => p.user_id && optouts.has(p.user_id));
      cancelados = cancelar.length;
      for (const lote of dividirEmLotes(cancelar.map((c) => c.id), 500)) {
        await admin
          .from('email_campanha_destinatario')
          .update({ status: 'cancelado', erro: 'descadastrado antes do envio' })
          .in('id', lote);
      }
      aEnviar = aEnviar.filter((p) => !p.user_id || !optouts.has(p.user_id));
    }
  }

  let enviados = 0;
  let falhas = 0;
  let estourouOrcamento = false;
  /**
   * Último erro do Resend, para virar `email_campanha.erro` quando NADA sai.
   * Sem isto o admin vê a campanha "falhou" sem motivo no histórico e precisa
   * do log da function para descobrir que era a chave ou o domínio.
   */
  let ultimoErro: string | null = null;

  const lotes = dividirEmLotes(aEnviar, TAMANHO_LOTE);

  for (let i = 0; i < lotes.length; i++) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      estourouOrcamento = true;
      break;
    }

    const lote = lotes[i];
    const emails = lote.map((d) =>
      montarEmail(
        {
          user_id: d.user_id ?? '',
          email: d.email,
          nome_completo: d.nome_completo,
          email_token: d.email_token,
        },
        {
          remetente: campanha.remetente as string,
          assunto: campanha.assunto as string,
          htmlBase: campanha.corpo_html as string,
          appUrl,
          assetsUrl,
        },
      )
    );

    const resultado = await enviarLote(emails);
    const agora = new Date().toISOString();

    if (resultado.ok) {
      // O update é por linha porque cada uma leva o seu resend_id (útil para
      // cruzar bounce/complaint no painel do Resend depois).
      await Promise.all(
        lote.map((d, idx) =>
          admin
            .from('email_campanha_destinatario')
            // `erro: null` limpa a mensagem da tentativa anterior: numa retomada
            // bem-sucedida a linha não pode ficar 'enviado' carregando o erro
            // velho, que confundiria a auditoria depois.
            .update({
              status: 'enviado',
              resend_id: resultado.ids[idx] ?? null,
              enviado_em: agora,
              erro: null,
            })
            .eq('id', d.id)
        ),
      );
      enviados += lote.length;
    } else {
      await admin
        .from('email_campanha_destinatario')
        .update({ status: 'falhou', erro: resultado.erro.slice(0, 500) })
        .in('id', lote.map((d) => d.id));
      falhas += lote.length;
      ultimoErro = resultado.erro.slice(0, 500);
      console.error(`campanha ${campanhaId} lote ${i}: ${resultado.erro}`);
    }

    if (i < lotes.length - 1) await dormir(INTERVALO_ENTRE_LOTES_MS);
  }

  // Totais recontados a partir do LOG, nunca somados em cima do valor anterior:
  // assim uma retomada não duplica a contagem da rodada anterior, e o número de
  // pendentes é o do banco — não uma subtração sobre a lista que carregamos.
  const contar = async (valor: string) => {
    const { count } = await admin
      .from('email_campanha_destinatario')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', campanhaId)
      .eq('status', valor);
    return count ?? 0;
  };

  const restantes = await contar('pendente');
  const totalEnviados = await contar('enviado');
  const totalFalhas = await contar('falhou');
  const totalCancelados = await contar('cancelado');

  /**
   * Status derivado dos totais do LOG, não dos contadores desta rodada. Com os
   * contadores da rodada, retomar uma campanha em que NADA saiu (todas as linhas
   * 'falhou', nenhuma 'pendente') fechava a campanha como 'enviada' com zero
   * enviados — apagando o erro e bloqueando retomadas futuras.
   *
   *   sobrou pendente / estourou o orçamento → 'parcial' (tem o que retomar)
   *   só falhas, nada entregue              → 'falhou'
   *   entregou parte e falhou parte         → 'parcial' (as falhas são retomáveis)
   */
  const status: 'enviada' | 'parcial' | 'falhou' = restantes > 0 || estourouOrcamento
    ? 'parcial'
    : totalFalhas > 0
    ? (totalEnviados === 0 ? 'falhou' : 'parcial')
    : 'enviada';

  await admin
    .from('email_campanha')
    .update({
      status,
      total_enviados: totalEnviados,
      total_falhas: totalFalhas,
      total_cancelados: totalCancelados,
      // Motivo concreto do Resend (chave inválida, domínio não verificado, cota
      // estourada) quando houver: é o que o admin lê no histórico, sem precisar
      // abrir o log da function.
      erro: status === 'enviada'
        ? null
        : ultimoErro ?? 'disparo interrompido — use "Retomar" para enviar o restante',
      concluida_em: status === 'enviada' ? new Date().toISOString() : null,
    })
    .eq('id', campanhaId);

  return { status, enviados, falhas, cancelados, pendentes: restantes };
}
