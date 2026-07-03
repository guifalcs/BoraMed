# Scripts do teste manual F5 (MP TEST real, sem mocks)

Runners Playwright headless que preenchem o **Payment Brick real** e exercitam
o checkout embutido contra o Mercado Pago em modo TEST + stack Supabase local.
Criados na F5-manual de 2026-07-03 — ver `docs/HANDOFF-CHECKOUT-EMBUTIDO.md`.

Pré-requisitos: `supabase start` + `functions serve --env-file
supabase/functions/.env.local` + `ng serve` (ver TESTE-PAGAMENTO-LOCAL.md).
Usuário de teste: `teste@boramed.com` / `Teste123!`. Screenshots vão para o
diretório atual (ou `OUT_DIR`).

| Script | O que faz |
|---|---|
| `f5-cartoes.mjs [HOLDER] [parcelas]` | Cartões no `/checkout/<PLANO>` (env `PLANO`, default semestral). Sem args roda FUND, SECU, CALL e APRO 6x. Ex.: `node f5-cartoes.mjs APRO 6` |
| `f5-pix-boleto-3ds.mjs pix\|boleto\|3ds` | Pix (QR/countdown), boleto (endereço; **Estado = UF "SP"**, nome por extenso é recusado pelo MP) e challenge 3DS |
| `api-409.mjs` | Direto na API: card token via public key TEST + `mp-processar-assinatura` → valida o 409 de acesso ativo |
| `manual-mensal.mjs` | Abre `/dashboard/assinatura` e tenta cancelar — usado para validar acessos manuais/cortesia (criar a assinatura via SQL antes; ver handoff) |

Atenção ao rate limit real (5 tentativas/15min por usuário): entre baterias,
`delete from pagamento_intencao` no banco local libera.
