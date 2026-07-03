# Handoff — Checkout embutido (branch `feat/checkout-embutido`)

> Documento de contexto para o próximo agente/dev continuar o trabalho.
> Plano original completo: `PLANO-CHECKOUT-EMBUTIDO.md` (raiz do repo). Leia-o
> primeiro — este handoff registra **o que já foi feito, como validar e o que falta**.

## TL;DR

Migração do checkout de pagamento de **redirect** (Checkout Pro / init_point do
Mercado Pago) para **checkout embutido** na plataforma (Payment Brick + Checkout
API). **Fases F1–F5 concluídas e validadas 100% localmente.** Nada foi enviado ao
Supabase remoto (que é o de PRODUÇÃO — ref `gakvktwtdunljojghpff`): sem `db push`,
sem `functions deploy`, sem mexer em secrets/webhook. Faltam: teste manual com
credenciais TEST do MP (bloqueado por credenciais), F6 (revisão/checklist), F7
(deploy faseado com aprovação explícita do usuário) e F8 (limpeza pós-observação).

## ⚠️ Restrições invioláveis (valem para qualquer continuação)

1. **O projeto Supabase linkado é PRODUÇÃO.** Nenhum comando remoto até a F7
   aprovada: nada de `supabase db push`, `functions deploy`, `save_webhook`,
   alteração de secrets, `get_advisors`/`execute_sql` de escrita no remoto.
2. **Assinantes mensais legados** (preapprovals criados via redirect) continuam
   funcionando: os fallbacks de resolução de usuário no `mp-webhook`
   (external_reference → payer_email → linha `assinatura` existente) e o contrato
   de `mp-gerenciar-assinatura` estão protegidos por testes de regressão — não
   simplificar.
3. **Nada do fluxo legado é removido antes da F8**: `mp-criar-assinatura`,
   `mp-vincular-assinatura`, `mp-retorno`, rota `/assinatura/retorno`,
   `PENDING_PREAPPROVAL_KEY`, `pagamento.spec.ts` (parte legada).
4. **Preço nunca vem do cliente** — sempre de `plano.preco_centavos` (há teste
   unitário que inspeciona o body enviado ao MP).
5. Cuidado conhecido: `supabase db pull` reverte hardening de grants — evitar;
   se usar, revisar o diff.

## O que foi implementado (por commit)

| Commit | Conteúdo |
|---|---|
| `a384abc` | **F1**: migration aditiva `20260703120000_checkout_embutido_bricks.sql` (tabela `pagamento_intencao`, colunas `status_detail`/`parcelas`/`intencao_id` em `pagamento`, COMMENTs de deprecação); `_shared/mp-api.ts` (mpGet/mpPost/mpPut); `_shared/mp-payment-sync.ts` (`syncAcessoUnicoPayment` extraído do webhook, idempotente, retrocompatível com payments sem `metadata.intencao_id`; `cancelled` → intenção `expirada`); `mp-webhook` delega ao sync. |
| `4da15d8` | **F2**: edges novas `mp-processar-pagamento` (semestral: cartão 6x/Pix/boleto, validações em ordem, rate limit 5/15min, anti-replay, `X-Idempotency-Key`=attempt_id, 3DS optional, resposta sanitizada, sync síncrono), `mp-processar-assinatura` (mensal: `POST /preapproval` authorized com card_token; 4xx → 200 rejected), `mp-consultar-pagamento` (reconciliação). Registro no `config.toml` (verify_jwt=true). |
| `b65c24c` | **F2**: `mp-gerenciar-assinatura` refatorada p/ handler+deps com contrato legado fixado por testes ANTES do refactor; nova ação `trocar_cartao`. |
| `eb6b15b` | **F3**: frontend — `MercadoPagoSdkService` (loader lazy, SSR-safe, timeout 10s), `CheckoutService` (attempt_id novo por tentativa, lock anti dupla submissão), `checkout.types.ts`, `mp-status-detail.map.ts` (mensagens PT-BR por `status_detail`), `CheckoutComponent` (`/checkout/:plano`), `PagamentoStatusComponent` (`/checkout/status/:intencaoId` — estados aprovado/pix/boleto/3ds/pendente/recusado/expirado, polling 3s, reload reconstrói via intenção+sessionStorage), `PixPanelComponent`, `TresDsChallengeComponent` (Status Screen Brick), `TrocarCartaoModalComponent` em Minha Assinatura, rotas client-only no SSR, `planos.assinar()` → navega p/ `/checkout/:slug`. |
| `96dc00a` | **F4**: textos/docs — landing+FAQ, `@deprecated` em `iniciarCheckout`, ADR-029 em `docs/architecture.md` (+ADR-025 marcado superado), `docs/business-rules.md`, `TESTE-PAGAMENTO-LOCAL.md`, `docs/ambiente-testes-pagamento.md`, `docs/testes-automatizados-pagamento.md`, banner histórico em `docs/analise-pagamentos.html`, cláusulas de pagamento em Termos de Uso e Política de Privacidade. |
| `e4cbf32` | **F5**: `frontend/tests/e2e/checkout.spec.ts` (12 cenários, SDK do MP stubado via `page.route`); `pagamento.spec.ts` ajustado (navegação embutida; jornada legada de retorno mantida). |

## Estado de validação (tudo verde)

- **Edges (Deno)**: `cd supabase/functions && deno test --allow-env .` → **101 passed**.
  Cobrem: regressão completa do webhook (fallbacks legados), sync com payment
  legado sem `intencao_id`, preço do banco no body ao MP, rate limit, anti-replay,
  Pix/boleto/3DS, contrato legado do gerenciar + trocar_cartao.
- **Frontend build**: `cd frontend && npx ng build` → OK (sem lint configurado no projeto).
- **Frontend unit**: `npx ng test --watch=false` → 473 passed, **2 falhas
  PRÉ-EXISTENTES** em `auth.guard.spec.ts`/`guest.guard.spec.ts`
  (`auth.isRecoverySession is not a function`) — confirmadas também sem as
  mudanças da branch (não são desta PR).
- **E2E**: `cd frontend && npm run test:e2e -- checkout pagamento --project=mocked`
  → **23 passed** (não precisa de backend; projeto `mocked` é o do CI).
- **Smoke test real** (SDK real do MP + Supabase local): Payment Brick monta nos
  dois planos com preço do banco e métodos corretos. Script:
  `node <scratchpad>/smoke-checkout.mjs` (login real `teste@boramed.com`/`Teste123!`).

## Como rodar localmente

```bash
# Stack local (migrations já incluem a nova; se resetar, o seed cria o usuário de teste)
npx supabase start && npx supabase migration up   # ou db reset

# Frontend (environment.local.ts já aponta p/ o stack local + public key TEST)
cd frontend && npx ng serve    # http://localhost:4200

# Edges locais (necessário p/ submeter pagamento de verdade):
cp supabase/functions/.env.local.example supabase/functions/.env.local  # preencher MP TEST
npx supabase functions serve --env-file ./supabase/functions/.env.local
```

Sem `.env.local` o Brick monta e a UI funciona, mas o submit falha (a edge
precisa de `MP_ACCESS_TOKEN` TEST). Webhook local exige túnel (ngrok) — ver
`TESTE-PAGAMENTO-LOCAL.md` (roteiro completo de cenários, cartões APRO/FUND/
SECU/CALL/DUPL, 3DS `5483 9281 6457 4623`, CPF `12345678909`).

## O que falta (em ordem)

1. **F5-manual (parcialmente preparado em 2026-07-03)**: o MCP do Mercado Pago
   está autenticado nesta máquina e o ambiente já foi montado:
   - `supabase/functions/.env.local` **já existe** (gitignored), com o
     `MP_ACCESS_TOKEN` TEST da aplicação (a public key TEST do
     `environment.local.ts` é da MESMA aplicação — par correto);
     `MP_WEBHOOK_SECRET` está com valor dummy (nenhum webhook de teste
     registrado ainda — falta o túnel ngrok + `save_webhook`).
   - Comprador de teste MLB já existe (nickname `TESTUSER3564881035891632645`,
     id 3487525400) — obtido via MCP `create_test_user`.
   - Para servir as edges: `npx supabase functions serve --env-file
     ./supabase/functions/.env.local` (validado: sobe e o Brick real monta).
   - Verificar `BORAMED_OWNER_EMAIL` no `.env.local` (foi copiado de forma
     aproximada do `.env`; confirmar o valor com o usuário se for relevante).
   Falta executar: cenários 1–11 do `TESTE-PAGAMENTO-LOCAL.md` (cartões
   APRO/FUND/SECU/CALL, Pix, boleto, 3DS, trocar cartão), túnel + webhook de
   TESTE para confirmar Pix/boleto, e `quality_evaluation` via MCP com um
   payment de teste (`is_ca=true`), corrigindo itens até score alto.
   Pegadinha conhecida: o comprador NÃO pode ser a mesma conta/e-mail do
   vendedor (botão do checkout trava). Nota: `notification_url` aponta para o
   SUPABASE_URL local (http://127.0.0.1) — se o MP recusar a URL não-pública no
   `POST /v1/payments`, condicionar o campo a URLs https no handler.
2. **F6**: code review completo da branch (segurança + regressão legado);
   opcional preview branch do Supabase via MCP para ensaio; escrever checklist de
   go-live e revisar com o usuário.
3. **F7 (SÓ com aprovação explícita do usuário)**: deploy faseado — (1) migration
   aditiva, (2) edges novas, (3) `mp-webhook`+`mp-gerenciar-assinatura`
   atualizados, (4) frontend, (5) janela de observação 2–4 semanas (rollback =
   reverter só o frontend).
4. **F8 (pós zero tráfego legado)**: remover `mp-criar-assinatura/`,
   `mp-vincular-assinatura/`, `mp-retorno/`, `assinatura-retorno.component.ts` +
   rota, `PENDING_PREAPPROVAL_KEY` + trecho do `subscription.guard`, parte legada
   do `pagamento.spec.ts`, entradas do config.toml. Grep final por
   `init_point`/`Redirecion`. Colunas `plano.mp_init_point`/`mp_preapproval_plan_id`
   ficam (COMMENT de legado, sem DROP).

## Decisões e detalhes não óbvios

- **Resposta síncrona vs webhook**: os dois caminhos chamam o MESMO
  `syncAcessoUnicoPayment` (idempotente, upsert por `mp_payment_id`) — sem corrida.
- **Intenção → UI**: o frontend faz polling de `pagamento_intencao` via PostgREST
  (RLS own). Dados voláteis (QR do Pix, link do boleto, creq do 3DS) não vão ao
  banco — ficam em `sessionStorage` (`boramed_checkout_result_<intencaoId>`);
  reload sem eles cai em fallback ("Gerar novo Pix" / "Verificar pagamento").
- **Erro 4xx do MP** nas edges de processamento → HTTP **200** com
  `{status:'rejected', status_detail}` (resultado de negócio, UI mapeia mensagem);
  5xx → **502** e a intenção volta a `criada` (retry possível). Body cru do MP
  nunca vaza na resposta nem nos logs.
- **Replay do mesmo attempt_id**: mesmo usuário → reconsulta (GET) sem criar novo
  pagamento; outro usuário → 409.
- **`toMpDate()`**: MP exige offset explícito; a helper preserva o instante em
  `-03:00`.
- **FakeDb** (`_shared/test/fake.ts`) ganhou `gte`/`neq`/`order`/`limit` reais.
- **environment.local.ts** (gitignored) foi apontado para o stack local — antes
  apontava para produção. Avisar o usuário se isso o afetar.
- **CSP (se o hosting tiver)**: `script-src https://sdk.mercadopago.com
  https://http2.mlstatic.com`, `frame-src https://*.mercadopago.com https:`,
  `connect-src https://api.mercadopago.com https://events.mercadopago.com`.
- As 2 falhas de unit test de guards são pré-existentes na `main` (mock sem
  `isRecoverySession`) — corrigir fora desta PR.
