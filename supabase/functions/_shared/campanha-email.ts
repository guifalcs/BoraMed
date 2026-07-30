// Helpers PUROS da campanha de e-mail (personalização, rodapé de descadastro,
// lotes). Ficam fora do index.ts para serem testáveis sem rede nem Deno.serve.

export const SEGMENTOS = [
  'sem_assinatura_ativa',
  'nunca_assinou',
  'ex_assinantes',
  'todos',
] as const;

export type Segmento = (typeof SEGMENTOS)[number];

export function isSegmento(valor: unknown): valor is Segmento {
  return typeof valor === 'string' && (SEGMENTOS as readonly string[]).includes(valor);
}

export type Destinatario = {
  readonly user_id: string;
  readonly email: string;
  readonly nome_completo: string | null;
  readonly email_token: string;
};

/** Lote máximo aceito pelo endpoint `/emails/batch` do Resend. */
export const TAMANHO_LOTE = 100;

/**
 * Escapa o texto antes de interpolar no HTML. Nome de usuário é conteúdo
 * arbitrário: sem isso, um `<` no cadastro quebraria o layout do e-mail (e um
 * `<script>` viajaria para a caixa de entrada de quem abre o HTML fora do
 * cliente de e-mail).
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Maria Clara de Souza" → "Maria". Vazio/nulo → fallback. */
export function primeiroNome(nomeCompleto: string | null, fallback = 'Tudo bem'): string {
  const limpo = (nomeCompleto ?? '').trim();
  if (!limpo) return fallback;
  return limpo.split(/\s+/)[0];
}

export function linkDescadastro(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/descadastrar?token=${encodeURIComponent(token)}`;
}

export type DadosPersonalizacao = {
  readonly nomeCompleto: string | null;
  readonly email: string;
  readonly urlDescadastro: string;
};

/**
 * Substitui as variáveis de personalização. Tokens suportados:
 *   {{nome}}             nome completo (ou "Tudo bem" quando não informado)
 *   {{primeiro_nome}}    primeiro nome
 *   {{email}}            e-mail do destinatário
 *   {{link_descadastro}} URL de opt-out (nunca escapada: vai dentro de href)
 *
 * `escapar` controla o tratamento dos valores vindos do banco: true no corpo
 * HTML, false no assunto (que é texto puro — escapar ali faria o usuário ler
 * "João &amp; Maria" na caixa de entrada).
 */
export function personalizar(
  template: string,
  dados: DadosPersonalizacao,
  escapar = true,
): string {
  const trata = escapar ? escaparHtml : (t: string) => t;
  const nome = (dados.nomeCompleto ?? '').trim() || 'Tudo bem';
  const substituicoes: Record<string, string> = {
    nome: trata(nome),
    primeiro_nome: trata(primeiroNome(dados.nomeCompleto)),
    email: trata(dados.email),
    link_descadastro: dados.urlDescadastro,
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (original, chave: string) => {
    const valor = substituicoes[chave];
    return valor === undefined ? original : valor;
  });
}

const RODAPE_MARCADOR = '{{link_descadastro}}';

/**
 * Garante que TODO e-mail tenha saída. Se o autor da campanha não colocou o
 * link no corpo, o rodapé padrão é anexado — descadastro nunca é opcional
 * (LGPD art. 18 e requisito de reputação do Resend).
 */
export function garantirRodapeDescadastro(html: string): string {
  if (html.includes(RODAPE_MARCADOR)) return html;

  return `${html}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:Inter,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#64748b;">
  <p style="margin:0 0 4px;">Você recebeu este e-mail porque criou uma conta na BoraMed.</p>
  <p style="margin:0;"><a href="${RODAPE_MARCADOR}" style="color:#64748b;text-decoration:underline;">Não quero mais receber e-mails da BoraMed</a></p>
</div>`;
}

export function dividirEmLotes<T>(itens: readonly T[], tamanho = TAMANHO_LOTE): T[][] {
  if (tamanho < 1) throw new Error('tamanho de lote inválido');
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Valida o formato "Nome <email@dominio>" ou "email@dominio" exigido pelo
 * campo `from` do Resend. Erro aqui é 400 na hora, não 100 e-mails perdidos.
 */
export function remetenteValido(remetente: string): boolean {
  const limpo = remetente.trim();
  const comNome = /^[^<>]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/;
  const simples = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  return comNome.test(limpo) || simples.test(limpo);
}

export type EmailResend = {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly headers: Record<string, string>;
};

/** Monta o payload de UM destinatário já personalizado. */
export function montarEmail(
  destinatario: Destinatario,
  opcoes: {
    remetente: string;
    assunto: string;
    htmlBase: string;
    appUrl: string;
  },
): EmailResend {
  const urlDescadastro = linkDescadastro(opcoes.appUrl, destinatario.email_token);
  const dados = {
    nomeCompleto: destinatario.nome_completo,
    email: destinatario.email,
    urlDescadastro,
  };

  return {
    from: opcoes.remetente,
    to: [destinatario.email],
    subject: personalizar(opcoes.assunto, dados, false),
    html: personalizar(garantirRodapeDescadastro(opcoes.htmlBase), dados),
    headers: {
      // Descadastro em um clique no Gmail/Outlook — pesa na reputação do domínio.
      'List-Unsubscribe': `<${urlDescadastro}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
