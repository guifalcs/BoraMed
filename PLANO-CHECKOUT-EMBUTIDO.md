# Checkout embutido na plataforma — Mercado Pago Bricks + Checkout API

## Contexto

Hoje o pagamento do BoraMed é 100% por **redirect** ao checkout hospedado do Mercado Pago: o plano `semestral` (R$199,90, até 6x) via `POST /checkout/preferences` (Checkout Pro) e o `mensal` (R$49,90 recorrente) via `POST /preapproval` sem cartão (status `pending`, usuário paga no site do MP via `init_point`). O usuário sai da plataforma, paga lá e volta numa página de retorno que faz polling do webhook.

**Objetivo**: montar o checkout dentro da plataforma — coletar tudo aqui e mandar o MP só processar — com alto score de qualidade/segurança na avaliação do MP e UX rica com feedback específico por cenário de erro. Todos os textos que descrevem o fluxo antigo (redirect) ficam desatualizados e serão reescritos.

**⚠️ Restrições de produção (regem todo o plano)**:
- O app está **EM PRODUÇÃO** com assinantes reais no fluxo legado. Nada pode prejudicar assinaturas existentes.
- O projeto Supabase remoto **é o de produção** (não há staging). **Nada sobe para o remoto** durante o desenvolvimento: sem `db push`, sem `functions deploy`, sem `save_webhook`, sem mexer em secrets. Todo o trabalho acontece numa branch git com validação 100% local; deploy só após validação completa e aprovação explícita.

**Decisões tomadas**:
1. **Payment Brick** (não Secure Fields custom): campos de cartão em iframes PCI do MP, validação inline, 3DS, device ID e Pix/boleto prontos; tematizado com a identidade BoraMed. Backend idêntico nos dois casos (`/v1/payments` + `/preapproval`), então migração futura a UI custom não refaz nada do servidor.
2. **Corte direto na UI para compras NOVAS, legado mantido vivo em produção**: sem feature flag no código, mas nenhuma remoção acontece no mesmo deploy. As edges e rotas legadas ficam deployadas durante uma janela de observação — o rollback é simplesmente reverter o frontend (o fluxo redirect volta a funcionar imediatamente).
3. **Incluir "Trocar cartão"** da assinatura mensal (PUT /preapproval com novo `card_token_id`).
4. **Semestral: cartão (6x) + Pix + boleto** (paridade com o Checkout Pro atual).

Nota de arquitetura: a doc marca `/v1/payments` como API legada (sucessora: Orders API), mas o fluxo documentado dos Bricks e o `mp-webhook` atual usam `/v1/payments` — ficamos nela e registramos a nota no ADR.

## Compatibilidade com o legado — regras invioláveis

1. **Assinantes mensais existentes** (preapprovals criados via redirect) continuam sendo cobrados e geridos pelo MP normalmente. O `mp-webhook` mantém **intactos** os fallbacks de resolução de usuário do topic `subscription_preapproval` (external_reference → payer_email → linha `assinatura` existente) — **não simplificar** esses caminhos, pois preapprovals legados dependem deles.
2. **`mp-gerenciar-assinatura`** (cancelar/pausar/reativar) mantém o contrato atual de request/response no refactor — assinantes legados usam essa função hoje. Escrever testes de regressão do comportamento atual ANTES de refatorar.
3. **Compradores semestrais legados**: pagamentos antigos continuam recebendo webhooks de `refund`/`chargeback`. O novo `syncAcessoUnicoPayment` **precisa tratar payments SEM `metadata.intencao_id`** (todo o legado) exatamente como o webhook trata hoje.
4. **Checkouts em voo no momento do deploy** (usuário no meio do redirect no site do MP): a rota `/assinatura/retorno`, o componente de retorno e as edges `mp-vincular-assinatura`/`mp-retorno`/`mp-criar-assinatura` **permanecem deployados e funcionais** durante a janela de observação. Remoção só depois de confirmar zero tráfego nos logs.
5. **Migration 100% aditiva**: só CREATE TABLE / ADD COLUMN / COMMENT. Nenhum DROP, nenhum ALTER destrutivo, nenhuma mudança em RLS/policies existentes, nenhuma mudança em `tem_assinatura_ativa`.
6. **Preapprovals legados `pending`** (checkout abandonado no MP): expiram naturalmente; nenhuma ação.
7. **Webhook em produção não muda de URL nem de secret**; a atualização do handler é retrocompatível (mesmos topics, mesma validação HMAC).

## Fluxo de trabalho — branch + validação local

- Criar branch git dedicada (ex.: `feat/checkout-embutido`) a partir de `main`. Todo o trabalho e commits nela.
- **Banco**: migrations rodam apenas no stack local (`supabase start` / `supabase migration up` local). Sem `supabase db push` para o remoto. Cuidado conhecido: `db pull` reverte hardening de grants — evitar; se usado, revisar diff.
- **Edge functions**: `supabase functions serve` local com `.env.local` e credenciais MP de **TESTE** (test users via MCP). Webhook de teste apontando para túnel local (como já documentado em `TESTE-PAGAMENTO-LOCAL.md`) — nunca alterar o webhook de produção.
- **Frontend**: `environment.local.ts` apontando para o stack local.
- Opcional a avaliar antes do go-live: **Supabase preview branch** (via MCP `create_branch`) como staging efêmero para um ensaio do deploy — decisão adiada, não bloqueia o desenvolvimento.
- Deploy ao remoto (prod) só na fase F7, após validação completa e aprovação explícita do usuário.

## Arquitetura alvo

**Semestral (pagamento único)**
```
/planos → /checkout/semestral (auth + sem acesso ativo)
  → Payment Brick (cartão 6x | Pix | boleto), tematizado
  → onSubmit(formData) → edge mp-processar-pagamento (JWT)
      preço do BANCO, hasActiveAccess 409, rate limit, INSERT pagamento_intencao,
      POST /v1/payments (X-Idempotency-Key=attempt_id, statement_descriptor,
      additional_info completo, three_d_secure_mode:'optional', metadata.intencao_id)
  → resposta síncrona roteia a UI:
      approved        → /checkout/status/:id (sucesso)
      rejected        → permanece no checkout, banner status_detail→mensagem+ação
      pending+pix     → tela Pix: QR + copia-e-cola + countdown 30min + polling
      pending+boleto  → tela boleto: link + "acesso automático ao compensar"
      pending_challenge → Status Screen Brick (challenge 3DS) + polling
  → mp-webhook (topic payment) confirma assíncrono e concede acesso (lógica atual mantida)
```

**Mensal (assinatura recorrente)**
```
/checkout/mensal → Payment Brick só-cartão (1x)
  → onSubmit → edge mp-processar-assinatura (JWT)
      POST /preapproval { payer_email, card_token_id, status:'authorized',
      auto_recurring{1,months,49.90,BRL}, external_reference: user.id }
      upsert assinatura com status retornado
  → authorized → tela sucesso | rejected → banner mapeado | pending → polling tem_assinatura_ativa
  → webhooks subscription_preapproval / subscription_authorized_payment INALTERADOS
```

**Fica**: `mp-webhook` (HMAC, topics, fallbacks legados), tabelas `assinatura`/`pagamento` (mudanças aditivas), RPC `tem_assinatura_ativa`, guards, RLS de paywall, `mp-gerenciar-assinatura` (refatorada com contrato preservado). **Assinantes atuais não migram** — preapprovals existentes seguem funcionando.
**Sai (apenas na F8, pós-observação)**: `mp-criar-assinatura`, `mp-vincular-assinatura`, `mp-retorno`, `assinatura-retorno.component.ts`, `PENDING_PREAPPROVAL_KEY` (+ trecho do `subscription.guard`), colunas `plano.mp_init_point`/`mp_preapproval_plan_id` (deprecar com COMMENT; sem DROP).

## Fases

### F1 — Banco + sync compartilhado (local)

Migration `supabase/migrations/2026XXXX_checkout_embutido_bricks.sql` (modelo/RLS de referência: `20260620120000_planos_assinaturas_pagamentos.sql`) — **aditiva, aplicada só no stack local até a F7**:

- **Nova tabela `pagamento_intencao`** (tentativas de pagamento, pré-webhook): `id uuid pk`, `user_id → profiles`, `plano_id`, `tipo ('acesso_unico'|'assinatura')`, `idempotency_key uuid UNIQUE` (attempt_id do front), `mp_payment_id text UNIQUE`, `mp_preapproval_id`, `valor_centavos` (snapshot do preço DO BANCO), `metodo`, `parcelas`, `status ('criada','processando','aprovada','pendente','recusada','expirada','cancelada')`, `status_detail`, `expira_em` (Pix/boleto), timestamps. RLS: SELECT own (para polling do front via PostgREST); escrita só service role. Índice `(user_id, criado_em DESC)` para rate limit.
- **`pagamento`**: adicionar `status_detail text`, `parcelas integer`, `intencao_id uuid REFERENCES pagamento_intencao ON DELETE SET NULL`.
- `COMMENT` de deprecação em `plano.mp_init_point` e `plano.mp_preapproval_plan_id`.
- Rodar `get_advisors` (local) após a migration.

**`supabase/functions/_shared/mp-payment-sync.ts`**: extrair do branch `payment` de `mp-webhook/handler.ts` a lógica "payment do MP → upsert `pagamento` + concessão/revogação de `assinatura`" para função pura `syncAcessoUnicoPayment(admin, pay, now)`, idempotente (upsert por `mp_payment_id`), que passa a gravar `status_detail`/`parcelas` e atualizar `pagamento_intencao` via `metadata.intencao_id` **quando presente** (payments legados não têm — comportamento atual preservado). Usada pelo webhook, pela resposta síncrona e pela reconciliação. `_shared/mp-api.ts` com `mpGet`/`mpPost` (Bearer + X-Idempotency-Key).

### F2 — Edge functions (local)

Padrão existente: `index.ts` fino + `handler.ts` com deps injetadas (`_shared/deps.ts`), CORS de `_shared/cors.ts`, registro em `supabase/config.toml`. Referência de validações: `mp-criar-assinatura/handler.ts`.

**Nova `mp-processar-pagamento` (verify_jwt=true)** — semestral:
- Request: `{ attempt_id: uuid, plano_slug, form_data: { token?, payment_method_id, issuer_id?, installments?, payer{email, identification?, first_name?, last_name?, address?} } }`. Whitelist estrita; **nunca aceita amount do cliente**.
- Validações em ordem: JWT → body/attempt_id UUID → plano ativo e `recorrente=false` → `hasActiveAccess` (409, reusa `_shared/access.ts`) → rate limit ≥5 intenções/15min → 429 → `installments` 1–6 → `idempotency_key` de outro usuário → 409 (anti-replay), do mesmo → reprocessa com a mesma key.
- `POST /v1/payments` com: `transaction_amount` de `plano.preco_centavos`, `statement_descriptor:'BORAMED'`, `external_reference: user.id`, `notification_url` → mp-webhook, `metadata { tipo:'acesso_unico', plano_slug, user_id, acesso_meses, intencao_id }`, `additional_info { items[...], payer{first_name,last_name}, ip_address }` (score de qualidade), `three_d_secure_mode:'optional'`, `binary_mode:false`, `capture:true`, `date_of_expiration` (Pix +30min; boleto +3 dias).
- Response sanitizada (nunca o body cru do MP): `{ intencao_id, payment_id, status, status_detail, pix?{qr_code, qr_code_base64, ticket_url, expira_em}, boleto?{url, expira_em}, three_ds?{external_resource_url, creq} }`. Antes de responder: UPDATE intenção + `syncAcessoUnicoPayment`.

**Nova `mp-processar-assinatura` (verify_jwt=true)** — mensal:
- Request: `{ attempt_id, plano_slug, card_token_id, payer?{identification} }`. Mesmas validações (com `recorrente=true`).
- `POST /preapproval`: `payer_email` = e-mail da conta, `card_token_id`, `status:'authorized'`, `reason:'BoraMed Mensal'`, `external_reference: user.id`, `back_url` (exigido pela API), `auto_recurring` do banco. MP faz cobrança de verificação (valor mínimo, estornado) — não registrar como `pagamento`. Recusa de cartão (4xx do MP) → HTTP 200 com `{ status:'rejected', status_detail }` (resultado de negócio, não erro de infra).
- Sucesso → upsert `assinatura` (onConflict `mp_preapproval_id`) com status retornado.

**Nova `mp-consultar-pagamento` (verify_jwt=true)** — reconciliação ativa ("Já paguei", webhook atrasado, pós-3DS): `{ intencao_id }` → confere dono → `GET /v1/payments/{id}` → mesmo `syncAcessoUnicoPayment` → `{ status, status_detail }`.

**Alterada `mp-webhook/handler.ts`** (mínimo e retrocompatível): branch `payment` delega ao sync compartilhado (mesmo comportamento para payments legados sem `intencao_id`); tratar `cancelled` (Pix/boleto expirado → intenção `expirada`); topics de assinatura e fallbacks legados **inalterados**.

**Alterada `mp-gerenciar-assinatura`**: primeiro testes de regressão do contrato atual, depois refactor para padrão handler+deps, depois nova ação `trocar_cartao` → `PUT /preapproval/{id}` com `card_token_id`. Contrato existente preservado.

**Intocadas nesta fase**: `mp-criar-assinatura`, `mp-vincular-assinatura`, `mp-retorno` (continuam servindo o legado até a F8).

### F3 — Frontend (Angular, standalone + signals)

Novos arquivos:
```
core/services/mercado-pago-sdk.service.ts       # loader lazy do SDK + factories de bricks
core/services/checkout.service.ts               # orquestração (invoke edges, attempt_id, lock)
core/models/checkout.types.ts                   # contratos das edges + tipos mínimos do Brick
core/models/mp-status-detail.map.ts             # status_detail → {titulo, mensagem, acao} PT-BR
(assinatura)/checkout/checkout.component.ts     # rota /checkout/:plano
(assinatura)/checkout/pagamento-status.component.ts  # rota /checkout/status/:intencaoId
(assinatura)/checkout/pix-panel.component.ts    # QR + copia-e-cola + countdown + polling
(assinatura)/checkout/tres-ds-challenge.component.ts # Status Screen Brick p/ challenge 3DS
```

- **`MercadoPagoSdkService`**: injeta `<script src="https://sdk.mercadopago.com/js/v2">` sob demanda (promise cacheada, só browser — app tem SSR, usar `isPlatformBrowser`; timeout 10s → mensagem "Não foi possível carregar o pagamento seguro..."). `new MercadoPago(environment.mercadoPagoPublicKey, {locale:'pt-BR'})` — a public key **já existe** nos environments. Factories devolvem o controller; **`controller.unmount()` obrigatório no `ngOnDestroy`** (regra dos Bricks em SPA). Device ID é coletado automaticamente pelo SDK (confirmado na doc).
- **`CheckoutComponent`** (`/checkout/:plano`, lazyAuthGuard; redireciona se já tem acesso): resumo do plano (preço do banco via `listarPlanos()`) + container do Payment Brick. Customization: mensal → `{creditCard:'all', maxInstallments:1}`; semestral → `{creditCard:'all', bankTransfer:'all', ticket:'all', maxInstallments:6}`; `visual.style.customVariables` com a paleta BoraMed. `onSubmit` retorna a Promise do `CheckoutService.processar()` (Brick trava o botão sozinho); recusa → banner com mensagem+instrução do mapa e nova tentativa no próprio Brick (novo token + **novo attempt_id**).
- **`PagamentoStatusComponent`** (`/checkout/status/:intencaoId`): estados **aprovado** (→ polling curto `tem_assinatura_ativa` → dashboard), **pix** (QR base64, copiar código, countdown até `expira_em`, polling da intenção 3s; expirado → "Gerar novo Pix"), **boleto** (link, "compensação em até 2 dias úteis, acesso automático", botão "Já paguei, verificar" → `mp-consultar-pagamento`), **3ds** (Status Screen Brick com `{paymentId, additionalInfo:{externalResourceURL, creq}}` + polling), **pendente** (`pending_contingency`/`pending_review_manual` → "em análise, avisaremos"), **recusado** (mensagem do mapa + "Tentar novamente"). Reload da página reconstrói o estado consultando a intenção via PostgREST (RLS own).
- **`mp-status-detail.map.ts`**: cobrir a tabela oficial de collection-results — `cc_rejected_insufficient_amount` ("Saldo/limite insuficiente — use outro cartão ou pague com Pix"), `cc_rejected_bad_filled_{card_number,date,security_code,other}` ("Revise os dados digitados"), `cc_rejected_call_for_authorize` ("Ligue para o banco autorizar e tente de novo"), `cc_rejected_card_disabled`, `cc_rejected_duplicated_payment`, `cc_rejected_high_risk` ("Recusado pela análise de segurança — tente Pix"), `cc_rejected_max_attempts`, `cc_rejected_invalid_installments`, `cc_rejected_card_type_not_allowed` (cartão múltiplo sem função crédito), `cc_rejected_3ds_{challenge,mandatory}`, `cc_rejected_{card_error,blacklist,other_reason}`, `rejected_by_bank`, `pending_*` e fallback genérico.
- **Integrações**: `app.routes.ts` ganha as 2 rotas lazy; `planos.component.ts`: `assinar()` vira `router.navigate(['/checkout', slug])` (remove invoke + redirect); novos métodos vivem no `CheckoutService`; `minha-assinatura.component.ts` ganha "Trocar cartão" (Brick só-cartão em modal/rota → `mp-gerenciar-assinatura {acao:'trocar_cartao'}`). **A rota `/assinatura/retorno` e o componente de retorno permanecem** (checkouts em voo do legado) até a F8.

### F4 — Textos e docs (tudo que descreve o fluxo antigo)

| Arquivo | Mudança |
|---|---|
| `planos.component.ts` | Rodapé (l.182): "...Os dados do seu cartão são digitados em campos seguros do Mercado Pago e nunca passam pelos servidores do BoraMed." Botão (l.162): remover estado "Redirecionando…" |
| `minha-assinatura.component.ts` | l.199-201 idem rodapé; bloco do cartão da assinatura + "Trocar cartão"; manter labels de status/método |
| `landing.component.html` (l.476) + `landing.component.ts` (FAQ) | "Pague sem sair da plataforma: cartão em até 6x, Pix ou boleto, processados pelo Mercado Pago em campos seguros e criptografados." FAQ: item de formas de pagamento (mensal = cartão; semestral = cartão/Pix/boleto) |
| `subscription.service.ts` | Strings de erro do redirect ("Checkout indisponível...", "Não foi possível iniciar o checkout") substituídas pelas novas no `CheckoutService` |
| `docs/architecture.md` | Novo **ADR: Checkout embutido com Checkout Bricks** (decisão, /v1/payments vs Orders API, Status Screen só p/ 3DS, estratégia de coexistência com legado); marcar ADR-025 como superado no trecho do redirect |
| `docs/business-rules.md` (l.~219-231) | Reescrever seção de gateway: Payment Brick embutido; mensal = preapproval `authorized` com card_token; semestral = /v1/payments cartão 6x/Pix/boleto; webhook segue fonte da verdade; assinantes legados seguem no preapproval antigo |
| `TESTE-PAGAMENTO-LOCAL.md`, `docs/ambiente-testes-pagamento.md`, `docs/testes-automatizados-pagamento.md` | Reescrever passos: cartões de teste digitados no Brick (APRO/FUND/SECU/...), sem back_url de retorno; webhook continua precisando de URL pública (túnel) |
| `docs/analise-pagamentos.html` | Nota de atualização do fluxo (ou marcar como histórico) |
| Legal (lacuna) | Termos/privacidade hoje não citam pagamento; adicionar cláusula curta de processamento via Mercado Pago e compartilhamento de dados de pagamento |

### F5 — Testes (local)

- **Unit (Deno, padrão FakeDb/makeDeps/fakeFetch existente)**: `mp-processar-pagamento` (401/400/404/409 acesso ativo/429 rate limit; **preço do banco no body ao MP** inspecionando o fetch capturado; approved→intenção aprovada+pagamento; rejected→sem assinatura; pix→resposta com QR; anti-replay entre usuários), `mp-processar-assinatura` (payload do preapproval; authorized→assinatura; recusa→200 rejected), `mp-consultar-pagamento`, `_shared/mp-payment-sync.test.ts` (casos migrados do webhook **+ payment legado sem intencao_id**), webhook estendido (cancelled→expirada; regressão dos fallbacks legados), `mp-gerenciar-assinatura` (regressão do contrato atual + trocar_cartao).
- **E2E Playwright** (projeto `mocked` do CI): stub do SDK via `page.route('https://sdk.mercadopago.com/js/v2', ...)` com shim que expõe os callbacks do Brick — cenários: aprovado→sucesso→dashboard; `cc_rejected_insufficient_amount`→mensagem certa+retry; Pix→QR+countdown+polling até aprovado; boleto→link; 3DS→challenge montado; falha de rede; SDK não carrega→fallback; acesso ativo→redirect. `pagamento.spec.ts` (redirect) permanece enquanto o legado existir; marcado para remoção na F8.
- **Manual com credenciais TEST via MCP do Mercado Pago (stack local + túnel)**: `create_test_user`/`add_money_test_user`, cartões de teste por titular (APRO, FUND, SECU, EXPI, CALL, DUPL...; CPF 12345678909), webhook de TESTE no túnel local, `notifications_history` para depurar.
- **Regressão do legado (crítico)**: com o stack local, simular webhooks de um preapproval legado (subscription_preapproval sem external_reference, subscription_authorized_payment, refund de payment antigo sem intencao_id) e conferir que o comportamento é idêntico ao atual.
- **Score**: rodar `quality_evaluation` via MCP com um payment_id de teste (is_ca=true) e corrigir itens apontados até score alto; `form_homologation` se exigido.

### F6 — Revisão e ensaio de deploy (ainda nada no remoto)

- Code review completo da branch (segurança + regressão legado).
- Opcional: criar **Supabase preview branch** via MCP para ensaiar migration + functions num ambiente idêntico ao prod (decisão do usuário; sem impacto no prod).
- Checklist de go-live escrito e revisado com o usuário. **Nada é executado no remoto sem aprovação explícita.**

### F7 — Deploy faseado em produção (após aprovação)

Ordem que mantém o legado funcionando em cada passo (cada passo é individualmente reversível):
1. **Migration aditiva** no prod (não afeta nada existente).
2. **Edges novas** (`mp-processar-*`, `mp-consultar-pagamento`) — ainda sem tráfego (frontend antigo não as chama).
3. **`mp-webhook` + `mp-gerenciar-assinatura` atualizados** — retrocompatíveis; monitorar logs e `notifications_history` imediatamente após.
4. **Frontend** — novas compras passam pelo checkout embutido. Rollback = reverter só este passo (redirect volta, edges legadas continuam lá).
5. **Janela de observação** (mínimo 2–4 semanas): monitorar vendas nos 3 métodos, webhooks 200, cobranças recorrentes dos assinantes legados chegando normalmente, tráfego nas rotas/edges legadas caindo a zero.

### F8 — Limpeza (só após zero tráfego legado confirmado)

- Remover: `mp-criar-assinatura/`, `mp-vincular-assinatura/`, `mp-retorno/`, `assinatura-retorno.component.ts` + rota `/assinatura/retorno`, `PENDING_PREAPPROVAL_KEY` + trecho do `subscription.guard`, `pagamento.spec.ts` antigo, entradas do config.toml. Grep final por `init_point`/`Redirecion`.
- Colunas `plano.mp_init_point`/`mp_preapproval_plan_id`: manter com COMMENT de legado (sem DROP — dados históricos).

## Segurança (checklist da entrega)

1. Preço sempre do banco (teste unitário garante); intenção guarda snapshot.
2. `hasActiveAccess` 409 nas duas edges novas; rate limit 5/15min/usuário (mitiga card testing); 429 com mensagem amigável.
3. Idempotência: `X-Idempotency-Key` = attempt_id UUID (formato sem `prefixo_`), UNIQUE na intenção, 409 se de outro usuário.
4. PAN/CVV nunca tocam nosso domínio (iframes do Brick); edges não logam token/formData/body cru do MP; intenção não guarda dado de cartão.
5. Webhook: HMAC `x-signature` mantido; sempre reconsulta o recurso no MP.
6. CORS: novas functions no esquema `APP_ALLOWED_ORIGINS`; CSP (se houver no hosting): `script-src https://sdk.mercadopago.com https://http2.mlstatic.com`, `frame-src https://*.mercadopago.com https:` (challenge 3DS de bancos), `connect-src https://api.mercadopago.com https://events.mercadopago.com`.
7. RLS: `pagamento_intencao` SELECT own / escrita service role; `get_advisors` pós-migration.
8. Score MP coberto: secure fields (Brick), device ID (SDK automático), payer completo + identification, additional_info.items, statement_descriptor, external_reference, notification_url, mensagens de resposta claras, refunds já tratados no webhook.

## Riscos principais

- **Quebrar assinantes legados**: mitigado pelas regras invioláveis (fallbacks do webhook intactos, contrato do gerenciar preservado, sync tolerante a payments sem intencao_id, testes de regressão dedicados, deploy faseado com observação).
- **Deploy acidental no prod durante o dev**: regra explícita — nenhum comando remoto (db push/functions deploy/save_webhook/secrets) até a F7 aprovada.
- **Resposta síncrona vs webhook**: `syncAcessoUnicoPayment` idempotente usado pelos dois caminhos; `mp-consultar-pagamento` cobre webhook atrasado.
- **Token de uso único/dupla submissão**: novo token + novo attempt_id por tentativa; Brick trava botão; idempotência server-side.
- **Pix expira / boleto compensa em dias / 3DS abandonado (24h→cancelled)**: countdown + "Gerar novo Pix"; tela explica prazo do boleto + reconciliação manual; timeout de challenge com retry e `cc_rejected_3ds_challenge` mapeado.
- **`cc_rejected_high_risk` em retentativas imediatas com dados idênticos** (doc): orientar troca de método na mensagem.
- **SDK fora do ar/adblock**: timeout no loader com mensagem clara; rollback do frontend disponível na janela de transição.

## Verificação end-to-end (tudo local até F7)

1. `deno test` nas functions + testes unit novos verdes; `ng build` + lint.
2. Supabase local + webhook de teste no túnel: fluxo real com test users do MCP — mensal (APRO → assinatura authorized na hora), semestral cartão (APRO e FUND/SECU para ver mensagens), Pix (QR aparece, pagar com test user, acesso liberado via webhook), boleto (link gerado), 3DS (cartão de teste 5483 9281 6457 4623 → challenge no Status Screen Brick).
3. Regressão legado: webhooks simulados de preapproval/payment antigos → comportamento idêntico ao atual.
4. E2E Playwright (projeto `mocked`) verdes no CI.
5. `quality_evaluation` via MCP com payment de teste → ajustar até score alto.
6. Só então: F6 (revisão/ensaio) → F7 (deploy faseado, com aprovação) → F8 (limpeza pós-observação).
