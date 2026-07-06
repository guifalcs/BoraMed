# Scripts do teste manual F5 (MP TEST real, sem mocks)

Runners Playwright headless que preenchem o **Payment Brick real** e exercitam
o checkout embutido contra o Mercado Pago em modo TEST + stack Supabase local.
Criados na F5-manual de 2026-07-03; ampliados em 2026-07-06 — ver
`docs/HANDOFF-CHECKOUT-EMBUTIDO.md`.

Pré-requisitos: `supabase start` + `functions serve --env-file
supabase/functions/.env.local` + `ng serve` (ver TESTE-PAGAMENTO-LOCAL.md).
Screenshots vão para o diretório atual (ou `OUT_DIR`).

## Credenciais — matriz do sandbox (descoberta em 2026-07-06)

O sandbox exige **pares diferentes** conforme o endpoint:

| Fluxo | Credenciais (front `environment.local.ts` + edge `.env.local`) |
|---|---|
| `/preapproval` (mensal C1/C3/C5/C10) | **APP_USR do vendedor de teste** (app "BoraMed Teste" 908829636068202) |
| `/v1/payments` (semestral/Pix/boleto/3DS) | **TEST-** (da conta produtiva ou do vendedor) |

Com o vendedor de teste, **payer e collector devem ser test users**: o e-mail da
conta BoraMed logada precisa ser o do comprador de teste. No banco local:

```sql
update auth.users  set email='test_user_3564881035891632645@testuser.com' where email='teste@boramed.com';
update public.profiles set email='test_user_3564881035891632645@testuser.com' where email='teste@boramed.com';
```

(Um `db reset` recria `teste@boramed.com` — repita o update. Passe o e-mail aos
runners via `EMAIL=...`.)

## Variáveis dos runners

- `EMAIL` — login na plataforma (default `teste@boramed.com` / senha `Teste123!`).
- `CARD` — nº do cartão de teste (default Mastercard `5031 4332 1540 6351`).
  Com a public key APP_USR do vendedor o BIN do Mastercard **não resolve** —
  use o Visa: `CARD='4235 6477 2802 5682'`.
- `PLANO` — `semestral` (default) ou `mensal` (f5-cartoes).
- `OUT_DIR` — pasta dos screenshots.

| Script | O que faz |
|---|---|
| `f5-cartoes.mjs [HOLDER] [parcelas]` | Cartões no `/checkout/<PLANO>`. Sem args roda FUND, SECU, CALL e APRO 6x. Ex.: `PLANO=mensal CARD='4235 6477 2802 5682' EMAIL=test_user_... node f5-cartoes.mjs APRO` |
| `f5-pix-boleto-3ds.mjs pix\|boleto\|3ds` | Pix (QR/countdown), boleto (endereço; **Estado = UF "SP"**) e challenge 3DS |
| `api-409.mjs` | Direto na API: card token via public key + `mp-processar-assinatura` → valida o 409 de acesso ativo |
| `manual-mensal.mjs` | Abre `/dashboard/assinatura` e tenta cancelar — serve p/ C3 (cancelar → carência) e p/ acessos manuais/cortesia |
| `vendedor-login.mjs [rota]` | Loga no painel de dev do MP como o **vendedor de teste** (`MP_TEST_SELLER_PASS` no env) e salva a sessão — use p/ reconfigurar a URL do webhook quando o túnel mudar, ver credenciais, notificações |

## Webhook de teste (túnel)

O webhook da app do vendedor aponta para um túnel local (`cloudflared tunnel
--url http://127.0.0.1:54321`; o ngrok estava bloqueado na rede em 2026-07-06).
A URL do quick tunnel **muda a cada sessão** → reconfigure em
painel → app 908829636068202 → Webhooks (abas teste E produção), eventos
"Pagamentos" + "Planos e assinaturas". O secret (Assinatura secreta) vai em
`MP_WEBHOOK_SECRET` no `.env.local` (não muda ao trocar a URL).

Atenção ao rate limit real (5 tentativas/15min por usuário): entre baterias,
`delete from pagamento_intencao` no banco local libera.
