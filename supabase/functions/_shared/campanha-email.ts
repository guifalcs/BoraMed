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

/**
 * Partículas que ficam minúsculas no meio do nome: "Maria da Silva", não
 * "Maria Da Silva". No começo do nome são capitalizadas normalmente.
 */
const PARTICULAS = new Set([
  'da', 'das', 'de', 'del', 'della', 'di', 'do', 'dos', 'du', 'e', 'la', 'van', 'von', 'y',
]);

/**
 * Corrige a caixa de UM token, e só quando ele vem inteiro minúsculo ou inteiro
 * maiúsculo: `barbara` → `Barbara`, `LAIZ` → `Laiz`.
 *
 * Caixa mista é devolvida intacta — é o que preserva `McCarthy`, `d'Ávila`,
 * `DiCaprio`. É por isso que a regra não é um title-case genérico: title-case
 * "conserta" esses nomes para uma grafia errada, e errar o nome de alguém num
 * e-mail é pior do que exibir a caixa como a pessoa digitou.
 *
 * O que NÃO dá para recuperar é acento perdido: `barbara` vira `Barbara`, nunca
 * `Bárbara`. Para isso, o conserto é no `nome_completo` do perfil.
 */
function normalizarCaixa(token: string, ehPrimeiro: boolean): string {
  if (!token) return token;

  const minusculo = token === token.toLocaleLowerCase('pt-BR');
  const maiusculo = token === token.toLocaleUpperCase('pt-BR');
  if (!minusculo && !maiusculo) return token;

  const baixo = token.toLocaleLowerCase('pt-BR');
  if (!ehPrimeiro && PARTICULAS.has(baixo)) return baixo;
  return baixo.charAt(0).toLocaleUpperCase('pt-BR') + baixo.slice(1);
}

/**
 * Normaliza a caixa do nome completo, token a token. Também colapsa espaço
 * repetido — "MARIA  DA SILVA" → "Maria da Silva".
 */
export function normalizarNome(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token, i) => normalizarCaixa(token, i === 0))
    .join(' ');
}

/**
 * "Maria Clara de Souza" → "Maria". Vazio/nulo → fallback.
 * A caixa é normalizada: o primeiro nome é a primeira palavra do assunto, e
 * `barbara,` ou `LAIZ,` na caixa de entrada passa recado de descuido.
 */
export function primeiroNome(nomeCompleto: string | null, fallback = 'Tudo bem'): string {
  const limpo = (nomeCompleto ?? '').trim();
  if (!limpo) return fallback;
  return normalizarCaixa(limpo.split(/\s+/)[0], true);
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
  // Mesma normalização de caixa do {{primeiro_nome}}: senão "LAIZ SOUZA" sairia
  // gritando no corpo do e-mail enquanto o assunto já mostraria "Laiz".
  const nome = normalizarNome(dados.nomeCompleto ?? '') || 'Tudo bem';
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

// ============================================================
// Envelope da marca
// ============================================================
// O layout (fundo cinza, card branco de 560px, header em gradiente com a logo,
// rodapé) é o MESMO dos e-mails transacionais em
// `supabase/email-templates/{confirm-signup,reset-password}.html`. Aqui ele vive
// em código porque quem escreve a campanha edita só o conteúdo do card — o
// envelope é aplicado no envio e não dá para quebrar editando o corpo.
//
// Regras de e-mail (não são preciosismo, é o que sobrevive nos clientes):
//   * layout em <table>, largura fixa e style inline — Gmail/Outlook descartam
//     <style> em <head> e não implementam flex/grid de forma confiável;
//   * o gradiente do header tem fallback VML (<v:rect>) porque o Outlook
//     desktop ignora linear-gradient e renderizaria uma faixa branca;
//   * a logo é carregada de `{assetsUrl}/brand/logo-branca-email.png` — o mesmo
//     asset dos templates de auth. `assetsUrl` é a APP_URL por padrão, mas
//     existe separado porque o Gmail/Outlook busca imagem por um PROXY na
//     nuvem: em desenvolvimento, `http://localhost:4200/...` é inalcançável e a
//     logo chega quebrada na caixa de entrada. Aponte EMAIL_ASSETS_URL para um
//     host público (o site de produção) ao testar localmente.

const LARGURA_CARD = 560;

/** Cores do envelope, espelhando os templates de auth. */
const COR = {
  fundo: '#f1f5f9',
  card: '#ffffff',
  borda: '#e2e8f0',
  rodape: '#f8fafc',
  texto: '#0f172a',
  textoFraco: '#64748b',
  textoFraquissimo: '#94a3b8',
  marca: '#2451d8',
} as const;

/**
 * Embrulha o conteúdo da campanha no layout da marca e devolve o documento
 * completo. O rodapé já traz `{{link_descadastro}}`, então
 * `garantirRodapeDescadastro` não tem o que anexar depois.
 *
 * `conteudoHtml` entra literal (é HTML autoral do admin, não dado de usuário —
 * os valores vindos do banco só aparecem via `personalizar`, que escapa).
 * `assetsUrl` é o host da logo; sem ele, cai na própria `appUrl`.
 */
export function envelopeCampanha(
  conteudoHtml: string,
  appUrl: string,
  assetsUrl?: string,
): string {
  const base = (assetsUrl?.trim() || appUrl).replace(/\/$/, '');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>BoraMed</title>
</head>
<body style="margin:0;padding:0;background-color:${COR.fundo};font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="${COR.fundo}">
    <tr>
      <td align="center" style="padding:40px 16px 56px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:${LARGURA_CARD}px;">

          <!-- ===== HEADER GRADIENT ===== -->
          <tr>
            <td style="border-radius:16px 16px 0 0;padding:0;overflow:hidden;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false"
                style="width:${LARGURA_CARD}px;height:116px;border-radius:16px 16px 0 0;">
                <v:fill type="gradient" color="#1e40af" color2="#6427d9" angle="135" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
                style="background:linear-gradient(135deg,#1e40af 0%,#2451d8 52%,#6427d9 100%);border-radius:16px 16px 0 0;">
                <tr>
                  <td style="padding:36px 48px 40px;text-align:center;">
                    <img src="${base}/brand/logo-branca-email.png" alt="BoraMed" height="40" style="height:40px;width:auto;display:block;margin:0 auto;" />
                  </td>
                </tr>
              </table>
              <!--[if gte mso 9]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- ===== CONTEÚDO DA CAMPANHA ===== -->
          <tr>
            <td style="background-color:${COR.card};padding:40px 48px 36px;border-left:1px solid ${COR.borda};border-right:1px solid ${COR.borda};color:${COR.texto};font-size:15px;line-height:1.65;">
${conteudoHtml}
            </td>
          </tr>

          <!-- ===== FOOTER + OPT-OUT ===== -->
          <tr>
            <td style="background-color:${COR.rodape};border-radius:0 0 16px 16px;border:1px solid ${COR.borda};border-top:none;padding:22px 48px;text-align:center;">
              <p style="margin:0 0 8px;color:${COR.textoFraquissimo};font-size:12px;line-height:1.5;">
                Você recebeu este e-mail porque criou uma conta na BoraMed com o endereço
                <strong style="color:${COR.textoFraco};">{{email}}</strong>.
              </p>
              <p style="margin:0 0 10px;">
                <a href="{{link_descadastro}}" style="color:${COR.textoFraco};font-size:12px;text-decoration:underline;">
                  Não quero mais receber e-mails da BoraMed
                </a>
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:11px;">
                © 2026 BoraMed
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
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

/**
 * Monta o payload de UM destinatário já personalizado.
 *
 * `htmlBase` é o CONTEÚDO do card, não o e-mail inteiro: o envelope da marca é
 * aplicado aqui. `garantirRodapeDescadastro` continua na frente do envelope
 * como invariante — se algum dia o envelope for desligado, o opt-out ainda sai.
 */
export function montarEmail(
  destinatario: Destinatario,
  opcoes: {
    remetente: string;
    assunto: string;
    htmlBase: string;
    appUrl: string;
    /** Host público dos assets do e-mail (logo). Default: `appUrl`. */
    assetsUrl?: string;
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
    html: personalizar(
      garantirRodapeDescadastro(
        envelopeCampanha(opcoes.htmlBase, opcoes.appUrl, opcoes.assetsUrl),
      ),
      dados,
    ),
    headers: {
      // Gmail/Outlook usam este header para mostrar "Cancelar inscrição" no topo
      // da mensagem; o clique abre a URL no browser, onde a página de opt-out
      // faz o trabalho. Pesa na reputação do domínio.
      //
      // SEM `List-Unsubscribe-Post`: aquele header declara que a URL processa um
      // POST (RFC 8058, um-clique). A nossa é uma página do SPA — um POST nela
      // devolve 200 e não grava nada, então o provedor avisaria a pessoa que ela
      // saiu da lista enquanto o opt-out não seria registrado. Ela receberia a
      // campanha seguinte e marcaria como spam. Prometer o um-clique sem
      // endpoint é pior do que não prometer.
      'List-Unsubscribe': `<${urlDescadastro}>`,
    },
  };
}
