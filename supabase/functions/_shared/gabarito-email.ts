// ============================================================
// Conteúdo do e-mail "saiu o gabarito extraoficial".
//
// Este é só o MIOLO do card. O envelope da marca (header, logo, rodapé), os
// tokens ({{primeiro_nome}}, {{link_descadastro}}) e o List-Unsubscribe vêm
// do mesmo montarEmail() das campanhas. O texto vive em código, e não no
// admin, porque o disparo é automático na publicação.
// ============================================================
import { escaparHtml } from './campanha-email.ts';

/** Teto de e-mails por gabarito (cota diária do Resend). A RPC também limita. */
export const MAX_EMAILS_GABARITO = 50;

export type GabaritoParaEmail = {
  readonly slug: string;
  readonly titulo: string | null;
  readonly tipo_prova: string;
  readonly periodo: number;
  readonly semestre: string;
  /** Questões POR caderno. */
  readonly total_questoes: number;
  /** Nomes dos cadernos, em ordem. Com mais de um, o e-mail avisa que há um gabarito por caderno. */
  readonly cadernos?: readonly string[];
};

/** "N2 · 3º período", ou o título próprio. Mesma regra do frontend. */
export function nomeGabarito(g: Pick<GabaritoParaEmail, 'titulo' | 'tipo_prova' | 'periodo'>): string {
  return g.titulo?.trim() || `${g.tipo_prova} · ${g.periodo}º período`;
}

export function linkGabarito(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/$/, '')}/gabaritos/${encodeURIComponent(slug)}`;
}

export function conteudoEmailGabarito(
  g: GabaritoParaEmail,
  appUrl: string,
): { nome: string; assunto: string; html: string } {
  const nome = nomeGabarito(g);
  const nomeHtml = escaparHtml(nome);
  const link = escaparHtml(linkGabarito(appUrl, g.slug));
  const questoes = g.total_questoes === 1 ? '1 questão' : `${g.total_questoes} questões`;
  const cadernos = g.cadernos ?? [];
  const paragrafoCadernos = cadernos.length > 1
    ? `
<p style="margin:0 0 14px;color:#64748b;font-size:15px;line-height:1.65;">
  A prova teve <strong style="color:#0f172a;">${cadernos.length} cadernos</strong>
  (${cadernos.map(escaparHtml).join(', ')}). Escolha o da capa da sua prova: cada um tem o seu gabarito.
</p>
`
    : '';

  const html = `<!-- Preheader: linha que o Gmail/Outlook mostram na lista, sem aparecer no corpo. -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">
  As respostas da ${nomeHtml} já estão no ar. Confira e calcule sua nota.
</div>

<h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:800;line-height:1.25;text-align:center;letter-spacing:-0.4px;">
  Saiu o gabarito da ${nomeHtml}.
</h2>

<p style="margin:0 0 14px;color:#64748b;font-size:15px;line-height:1.65;">
  Oi, {{primeiro_nome}}. A equipe BoraMed resolveu a prova e o gabarito extraoficial
  (${escaparHtml(g.semestre)}, ${questoes}) já está no ar, antes do oficial.
</p>

${paragrafoCadernos}<p style="margin:0 0 14px;color:#64748b;font-size:15px;line-height:1.65;">
  Marque o que você respondeu e veja sua <strong style="color:#0f172a;">nota na hora</strong>,
  com a correção questão por questão.
</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
  <tr>
    <td align="center" style="padding:26px 0 8px;">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="border-radius:10px;background:linear-gradient(135deg,#2451d8 0%,#1e40af 100%);mso-padding-alt:0;box-shadow:0 4px 14px rgba(36,81,216,0.35);">
            <a href="${link}"
               style="display:block;padding:15px 40px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;text-align:center;letter-spacing:-0.1px;white-space:nowrap;">
              Conferir minha nota
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
  Gabarito extraoficial elaborado pela equipe BoraMed; o que vale é sempre o oficial da sua
  instituição. O BoraMed é uma plataforma independente, sem vínculo com a Afya.
</p>

<p style="margin:12px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
  Não quer mais receber estes e-mails?
  <a href="{{link_descadastro}}" style="color:#94a3b8;text-decoration:underline;">Descadastrar</a>.
</p>`;

  return {
    nome: `Gabarito · ${nome} · ${g.semestre}`,
    assunto: `Saiu o gabarito da ${nome} 👀`,
    html,
  };
}
