# Testes automatizados — fluxo de pagamentos

Suíte que protege a saúde financeira do BoraMed. A regra de ouro: **toda mudança
que toque pagamento deve passar por estas três camadas antes do merge** (a
pipeline de CI roda todas em cada push/PR — ver `.github/workflows/ci.yml`).

## Pirâmide de testes

| Camada | O que cobre | Onde | Como rodar |
|--------|-------------|------|------------|
| **Edge functions (Deno)** | Núcleo financeiro: validação HMAC do webhook, anti-fraude (acesso duplicado, rate limit, anti-replay de idempotência), **preço sempre do banco**, sync compartilhado de payments (incl. legados sem `intencao_id`), estorno/chargeback revoga acesso, contrato legado do gerenciar + `trocar_cartao`, IDOR no vínculo | `supabase/functions/**/*.test.ts` | `deno test -A --no-check` (em `supabase/functions/`) |
| **Frontend unit (Vitest)** | `SubscriptionService` (vínculo legado, gerência, `temAcesso`) e `subscriptionGuard` (paywall) | `frontend/src/app/**/*.spec.ts` | `npm test` (em `frontend/`) |
| **E2E (Playwright)** | Checkout **embutido** (Payment Brick stubado): aprovado→dashboard, recusas com mensagem específica, Pix (QR/countdown/polling), boleto, 3DS, SDK fora do ar, acesso ativo → redirect; + jornada legada de retorno | `frontend/tests/e2e/checkout.spec.ts` (novo) e `pagamento.spec.ts` (legado, sai na F8) | `npm run test:e2e -- checkout --project=mocked` (em `frontend/`) |

Nenhuma camada toca o Mercado Pago real nem um banco real — tudo é
determinístico e roda offline (exceto o download único de dependências).

> **E2E e o projeto `mocked`:** o `playwright.config.ts` tem três projetos.
> `setup`/`chromium` fazem **login real** e exigem um Supabase local
> (`supabase start`) — para rodar a suíte completa na sua máquina. O projeto
> **`mocked`** roda com a rede 100% interceptada (sem backend), e é o usado no
> CI. Os testes de pagamento são validados nele.

## Arquitetura testável das edge functions

Cada função de pagamento foi dividida em duas partes (refactor sem mudança de
comportamento):

- `index.ts` — entrypoint fino: `Deno.serve((req) => handleX(req, realDeps()))`.
- `handler.ts` — toda a lógica, recebendo um objeto `Deps` injetável
  (`_shared/deps.ts`): `env`, `admin()`, `caller()`, `fetch`, `now()`.

Em produção, `realDeps()` usa `Deno.env`, clientes Supabase reais e `fetch`
global. Nos testes, `_shared/test/fake.ts` injeta:

- `FakeDb` — banco Supabase em memória que suporta as cadeias usadas
  (`select/eq/in/maybeSingle/single/insert/update/upsert`), permitindo assertar
  o estado final das tabelas (`db.tables.assinatura`, etc.).
- `fakeFetch([...])` — roteia chamadas à API do MP por trecho de URL.
- `signedWebhookRequest(...)` — monta uma requisição de webhook já com
  `x-signature` HMAC válido.
- `now` fixo — datas determinísticas (carência, +N meses).

Lógica pura extraída para testes diretos: `verifyMpSignature` e
`mapAuthorizedPaymentStatus` (`_shared/mp-signature.ts`) e `hasActiveAccess`
(`_shared/access.ts`).

## Cenários cobertos (edge functions)

- **Webhook — segurança:** rejeita HMAC inválido (401), `secret` errado,
  `data.id`/`request-id` divergentes; bloqueia método ≠ POST e config ausente.
- **Webhook — `subscription_preapproval`:** concede acesso, resolve usuário por
  `external_reference` e por `payer_email`, e supera assinaturas anteriores (B5).
- **Webhook — `subscription_authorized_payment`:** sem assinatura vinculada pede
  retry (409, B1); `processed` grava `pagamento` `approved` com valor e líquido.
- **Webhook — `payment` (acesso único):** `approved` concede acesso por N meses;
  `refunded`/`charged_back` revoga o acesso imediatamente (C4); pagamento sem
  `metadata.tipo = acesso_unico` é ignorado para não contar em dobro (B3).
- **Sync compartilhado (`_shared/mp-payment-sync.test.ts`):** casos migrados do
  webhook + **payment LEGADO sem `metadata.intencao_id`** (comportamento
  idêntico ao antigo), `cancelled` (Pix/boleto expirado) → intenção `expirada`,
  idempotência (2ª chamada não duplica).
- **Processar pagamento (checkout embutido, semestral):** 401/400/404, 409 com
  acesso ativo, 429 rate limit (5/15min), 409 anti-replay de `attempt_id` de
  outro usuário, parcelas 1–6, **preço do banco no body ao MP** (inspecionando
  o fetch capturado), `X-Idempotency-Key` = attempt_id, aprovado → acesso na
  resposta síncrona, recusado → sem assinatura + `status_detail`, Pix → QR +
  expiração 30min, boleto → 3 dias, replay do mesmo usuário → reconsulta (GET).
- **Processar assinatura (mensal):** payload do preapproval (status
  `authorized`, e-mail da conta, preço do banco), B5 supera assinatura
  anterior, recusa 4xx do MP → **HTTP 200 `rejected`** (resultado de negócio),
  verificação de cartão não vira `pagamento`.
- **Consultar pagamento:** dono da intenção (404 para terceiros), webhook
  atrasado → sync concede acesso, MP fora do ar → 502.
- **Gerenciar assinatura:** regressão do contrato LEGADO
  (cancelar/pausar/reativar, 400/401/404/405/502, assinatura mais recente não
  cancelada) + `trocar_cartao` (recusa não afeta a assinatura).
- **Criar assinatura (LEGADO, sai na F8):** 401 sem token, 404/400 para plano
  inexistente/inativo, **409 quando já há acesso ativo** (anti cobrança dupla),
  init_point recorrente com `external_reference`, e preferência (Checkout Pro).
- **Vincular assinatura (LEGADO, sai na F8):** **403 quando o `payer_email`
  diverge da conta (IDOR)**, 404 quando o MP não acha, 400 quando não é um
  plano nosso, 409 quando já vinculada a outra conta, e vínculo bem-sucedido.

## Pré-requisitos

- **Deno** (para a camada de edge functions). Instalação:
  `curl -fsSL https://deno.land/install.sh | sh` (depois garanta `~/.deno/bin` no PATH).
- **Node + deps do frontend:** `cd frontend && npm ci`.
- **Chromium do Playwright** (E2E): `cd frontend && npx playwright install chromium`.

## Como estender

- Nova regra no webhook → adicione um caso em `mp-webhook/handler.test.ts`
  semeando o `FakeDb` e mockando o `fetch`, e asserte o estado final das tabelas.
- Novo método no `SubscriptionService` → siga o padrão de
  `subscription.service.spec.ts` (mock de `functions.invoke`/`rpc`/`from`).
- Novo passo na jornada → siga `tests/e2e/pagamento.spec.ts` (mock de todas as
  rotas `**/rest/v1/**` e `**/functions/v1/**`).
