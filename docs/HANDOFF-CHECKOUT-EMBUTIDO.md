# Handoff — Checkout embutido (branch `feat/checkout-embutido`)

> Documento de contexto para o próximo agente/dev continuar o trabalho.
> Plano original completo: `PLANO-CHECKOUT-EMBUTIDO.md` (raiz do repo). Leia-o
> primeiro — este handoff registra **o que já foi feito, como validar e o que falta**.
> Última atualização: **2026-07-06**, após destravar o preapproval e o webhook TEST.

## TL;DR

Migração do checkout de pagamento de **redirect** (Checkout Pro / init_point do
Mercado Pago) para **checkout embutido** na plataforma (Payment Brick + Checkout
API). **F1–F5 concluídas. F5-manual: 10 de 10 cenários exercitados** — 2026-07-03
validou os 7 de pagamento único; 2026-07-06 destravou o preapproval (C1/C3/C5/C10
✅ com MP TEST real) e o **webhook de teste via túnel** (notificações reais do MP
chegando e escrevendo no banco local). Ressalvas: aprovação real de Pix/boleto e
`quality_evaluation` ficaram bloqueadas por um **outage do POST /v1/payments no
sandbox em 2026-07-06** (500 internal_error em qualquer credencial — refazer
quando normalizar), e novos achados de UX/regra entraram na lista da F6. Nada foi
enviado ao Supabase remoto (que é o de PRODUÇÃO — ref `gakvktwtdunljojghpff`):
sem `db push`, sem `functions deploy`, sem mexer em secrets/webhook de produção.
Faltam: itens F6 (revisão + achados), F7 (deploy faseado com aprovação explícita)
e F8 (limpeza pós-observação).

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
| `c8fc897` | fix visual no footer de /planos. |
| `d6b447c` | fix: repassa `payer.address` do Brick ao MP (exigência do boleto). |
| `d8bbc4a` | **F5-manual**: `notification_url` só é enviado quando `SUPABASE_URL` é https — o MP rejeita URL não-pública com 400, o que quebrava TODO pagamento no stack local. Com teste de regressão. |
| `0f526a1` | **F5-manual**: Minha Assinatura para acessos manuais/cortesia — ver seção própria abaixo. |

## Estado de validação (tudo verde)

- **Edges (Deno)**: `cd supabase/functions && deno test --allow-env .` → **104 passed**.
  Cobrem: regressão completa do webhook (fallbacks legados), sync com payment
  legado sem `intencao_id`, preço do banco no body ao MP, rate limit, anti-replay,
  Pix/boleto/3DS, notification_url condicional, contrato legado do gerenciar +
  trocar_cartao.
- **Frontend build**: `cd frontend && npx ng build` → OK.
- **Frontend unit**: `npx ng test --watch=false` → 473 passed, **2 falhas
  PRÉ-EXISTENTES** em `auth.guard.spec.ts`/`guest.guard.spec.ts`
  (`auth.isRecoverySession is not a function`) — também quebram na `main`.
- **E2E**: `cd frontend && npm run test:e2e -- checkout pagamento --project=mocked`
  → **23 passed** (não precisa de backend; projeto `mocked` é o do CI).
- **F5-manual (MP TEST real)**: ver seção abaixo — 7/10 cenários do
  `TESTE-PAGAMENTO-LOCAL.md` validados fim-a-fim.

## F5-manual — resultados (2026-07-03, MP TEST real, sem mocks)

Runners Playwright headless que preenchem o Payment Brick real: **persistidos em
`scripts/teste-manual-mp/`** (com README de uso — não dependem mais do scratchpad).

- ✅ **C2 recusas** FUND/SECU/CALL → mensagens específicas corretas
  ("Saldo ou limite insuficiente…", "Revise os dados do cartão…", "Autorização
  necessária…"), permanece no checkout. De quebra validou o **rate limit**
  (6ª tentativa em 15min → 429 com mensagem amigável).
- ✅ **C6 semestral APRO 6x** → aprovado, tela de status, `pagamento`
  approved/`parcelas=6`/`accredited`, `assinatura` authorized,
  `proxima_cobranca = +6 meses`, intenção `aprovada`.
- ✅ **C4 anti cobrança dupla** → UI redireciona `/checkout/*` para o dashboard
  com acesso ativo; forçando a API, 409 "Você já tem um acesso ativo" sem criar
  preapproval/intenção.
- ✅ **C7 reembolso revoga** (sem webhook): refund via API TEST +
  `mp-consultar-pagamento` → `pagamento=refunded`, `assinatura=cancelled`,
  `tem_assinatura_ativa()=false`.
- ✅ **C8 Pix**: QR + copia-e-cola + countdown 30min na plataforma; **boleto**:
  gerado com "Abrir boleto" + "Já paguei, verificar". (Aprovação real de
  Pix/boleto continua dependendo de webhook/túnel.)
- ✅ **C9 3DS**: cartão `5483 9281 6457 4623` → tela "Confirmação do seu banco"
  com challenge embutido (conclusão do challenge ficou para teste manual/headed).
- ✅ **Acessos manuais/cortesia** (fora do roteiro): ver seção própria.
- ⛔ **C1/C3/C5/C10 (PREAPPROVAL — mensal)**: bloqueados — ver seção seguinte.

Pegadinhas descobertas nos testes (importam para reproduzir):
- Boleto: o campo **Estado deve ser a UF ("SP")** — por extenso o MP devolve 400
  "parameters required" genérico. No fluxo normal o Brick preenche via CEP, mas a
  consulta de CEP dá **401 no sandbox** e o usuário digita na mão → considerar
  normalizar `federal_unit` extenso→UF na edge (item de F6).
- Rate limit conta linhas de `pagamento_intencao` dos últimos 15min — entre
  baterias de teste, `delete from pagamento_intencao` no banco local.
- Login do runner é flaky se clicar antes da hidratação SSR — os scripts já têm
  retry.

## ✅ Preapproval destravado (2026-07-06) — como ficou

O bloqueio (`404 Card token service not found`) era mesmo credencial: o sandbox
de assinaturas exige as credenciais **APP_USR do vendedor de teste**. Feito via
Playwright (login como `TESTUSER7012000526337652922`, senha fornecida pelo
usuário): a app **"BoraMed Teste" (908829636068202, integração CheckoutBricks)**
já existia na conta do vendedor; extraí as credenciais e atualizei
`supabase/functions/.env.local` + `frontend/src/environments/environment.local.ts`
(ambos gitignored — os valores estão NOS ARQUIVOS nesta máquina). Script de login
persistido: `scripts/teste-manual-mp/vendedor-login.mjs`.

**Matriz de credenciais do sandbox (importante!):**

| Endpoint | Funciona com | Falha com |
|---|---|---|
| `POST /preapproval` (mensal) | APP_USR do vendedor de teste | TEST- (404 card token service) |
| `POST /v1/payments` (semestral/Pix/boleto) | TEST- (qualquer conta) | APP_USR do vendedor (401 unauthorized use of live credentials) |

Ou seja: para testar o MENSAL use o par APP_USR do vendedor; para o SEMESTRAL
troque para o par TEST- (original da conta produtiva, registrado no histórico
git deste arquivo, ou o TEST- da app do vendedor). Sempre trocar **público
(front) e access token (edge) juntos** e reiniciar `functions serve`.

Pegadinhas que custaram tempo (não repetir):
- Com o vendedor de teste, **payer e collector precisam ser test users**: o
  e-mail da conta BoraMed logada deve ser o do comprador de teste
  (`test_user_3564881035891632645@testuser.com`, senha da PLATAFORMA `Teste123!`
  — troquei via UPDATE em auth.users/profiles; um `db reset` desfaz). Senão o MP
  devolve 400 "Both payer and collector must be real or test users".
- Com a public key APP_USR do vendedor o **BIN do Mastercard de teste (503143)
  não resolve** no Brick ("no_payment_method_for_provided_bin") — usar o Visa
  `4235 6477 2802 5682` (`CARD=` nos runners).
- `back_url` não-https é rejeitado pelo MP (400) — corrigido na edge com
  fallback https (commit desta sessão), mesmo padrão do notification_url.

## F5-manual parte 2 — resultados (2026-07-06, MP TEST real)

- ✅ **C1 mensal APRO** (Brick real → `mp-processar-assinatura` → preapproval
  `authorized` no MP): `assinatura` authorized + `pagamento_intencao` aprovada +
  zero linhas em `pagamento` (cobrança de verificação não registrada — correto).
  **Ressalva de sandbox**: o MP devolve `next_payment_date` = agora (a 1ª fatura
  processa assíncrono e no sandbox nunca processou), então `tem_assinatura_ativa`
  fica false e a tela "Liberando seu acesso…" espera o webhook
  `subscription_authorized_payment`. Em produção a 1ª cobrança processa rápido,
  mas **decisão para F6**: conceder acesso provisório quando o preapproval nasce
  `authorized` (ex.: proxima_cobranca = +1 mês provisório, webhook corrige)?
- ✅ **Webhook TEST via túnel** (cloudflared; ngrok estava bloqueado na rede):
  webhook configurado no painel do vendedor (abas teste+produção) com eventos
  "Pagamentos" e "Planos e assinaturas"; secret real no `.env.local`.
  **Notificações reais do MP chegaram (5–60s) e escreveram no banco** —
  pause/cancel refletidos via `subscription_preapproval`, HMAC validando.
  A URL do quick tunnel muda a cada sessão → reconfigurar no painel
  (`vendedor-login.mjs` ajuda). As 2 primeiras notificações se perderam num
  isolate morto por cold start do `functions serve` local (não é bug nosso).
- ✅ **C5 pausar→reativar**: pause via API → webhook real → linha `paused`;
  reativar via edge (`acao:'reativar'`) → `authorized` no MP e local.
  **ACHADOS (F6)**: (1) usuário `paused` NÃO passa no paywall e o guard o manda
  p/ `/planos` — o botão "Reativar assinatura" da Minha Assinatura é
  **inalcançável** para ele; (2) o anti-dupla das edges consulta só
  `['authorized','cancelled']` — um pausado consegue assinar de novo e ficar com
  2 preapprovals vivos no MP.
- ✅ **C10 trocar cartão** via UI (modal + Brick real): edge devolveu
  `{status:'authorized', card_updated:true}`, `card_id` novo no preapproval do
  MP. **ACHADOS (F6)**: o Brick do modal exige um campo E-mail que o usuário
  digita à mão — pré-preencher via `initialization.payer.email`; o botão do
  Brick diz "Pagar" num fluxo que não cobra nada (customizar rótulo).
- ✅ **C3 cancelar→carência** via UI (runner `manual-mensal.mjs`): confirm
  dialog → edge 200 cancelled → tela "Cancelada · Acesso até 06/08/2026";
  webhook `cancelled` chegou em ~5s; ao cancelar o MP avança `next_payment_date`
  p/ +1 mês e o sync grava — carência funcionando (`tem_assinatura_ativa` true
  com o JWT do usuário; via psql sem `auth.uid()` retorna false por design).
- ⛔ **Outage do sandbox em 2026-07-06**: `POST /v1/payments` retornando
  `500 internal_error` para QUALQUER credencial/payload (inclusive o fluxo
  idêntico ao que passou dia 03; GET/search funcionam; status page "operational";
  a edge responde 502 + intenção volta a `criada` — comportamento correto).
  Bloqueou: aprovação real de Pix/boleto pelo webhook (C8), re-teste semestral e
  `quality_evaluation` (o payment de 03/07 dá 404/"payment not originated from
  app" no homologator; precisa de payment novo ≤7 dias — tentar
  `quality_evaluation` com `application_id=6161911882101170` quando voltar).

## Acessos manuais e cortesia (debatido e corrigido em 2026-07-03)

Contexto: o admin concede acesso de duas formas (RPCs em
`20260629120000_financeiro_liquido_e_pagamento_manual.sql`):
- **`admin_ativar_assinatura_manual`** (pagou por fora): `assinatura` authorized
  com `plano_id` real, `pagamento` método `manual`, **sem `mp_preapproval_id`**.
- **`admin_liberar_acesso_gratuito`** (cortesia): `assinatura` authorized com
  **`plano_id NULL`**, `cortesia=true`, sem pagamento.

O que foi constatado (reproduzido no stack local): a Minha Assinatura mostrava
"Cancelar assinatura"/"Trocar cartão" e "Próxima cobrança R$ X" para essas
assinaturas (cortesia caía no default `recorrente() ?? true`); clicar terminava
em 404 "assinatura não encontrada" cru na tela. Inofensivo (nada muda no banco,
MP não é tocado), mas confuso. O botão Cancelar quebrado **já existia na main**;
a branch só adicionou o Trocar cartão que sofria do mesmo problema.

**Corrigido em `0f526a1`** (`minha-assinatura.component.ts`):
- `gerenciavelNoMp()` (= tem `mp_preapproval_id`) condiciona TODOS os botões de
  gestão (cancelar/pausar/reativar/trocar cartão);
- rótulo vira "Acesso até" sem valor; aviso explicativo distinto para cortesia
  ("Acesso liberado pela equipe BoraMed…") e manual ("sem cobrança automática…");
- plano exibido como "Cortesia" quando `cortesia=true` (campo adicionado ao tipo
  `Assinatura` — o dado já vinha do `select *`);
- "Assinar novamente" unificado para `!acessoAtivo()`.
Validado nos 3 casos + contra-prova com preapproval real (botões continuam e o
PUT chega ao MP).

O resto do fluxo desses usuários já funcionava e não mudou: acesso expira
sozinho em `proxima_cobranca` (não renova — não há preapproval), paywall volta,
anti-dupla impede pagar com acesso ativo, e ao expirar assinam pelo checkout novo.

**DECISÃO EM ABERTO (usuário não bateu o martelo):** fazer hotfix desse ajuste na
`main` (produção tem o botão Cancelar quebrado para manuais/cortesia hoje) ou
esperar o deploy da branch (F7). Recomendação dada: esperar a F7, salvo se houver
volume relevante de acessos manuais ativos. Se optar pelo hotfix: **não dá
cherry-pick direto** (o commit referencia o modal Trocar cartão, que só existe na
branch) — backportar manualmente só o gating do Cancelar + rótulo + aviso.

## Conciliação com assinantes legados (explicado ao usuário em 2026-07-03)

Resumo do que foi debatido (o código já está assim; registrado para referência):
- **Mensal legado (preapproval via redirect)**: o preapproval segue vivo no MP;
  webhooks continuam chegando e o `mp-webhook` resolve o usuário em cascata:
  external_reference → payer_email → linha `assinatura` existente com aquele
  `mp_preapproval_id` (este último cobre os redirects antigos). Cancelar/pausar/
  reativar usam o contrato congelado do `mp-gerenciar-assinatura`; `trocar_cartao`
  também funciona para eles (PUT no preapproval existente). Checkouts em voo:
  edges legadas ficam até a F8.
- **Semestral legado (payment único via Checkout Pro)**: acesso já concedido em
  `assinatura`; pós-venda (refund/chargeback) passa pelo `syncAcessoUnicoPayment`,
  que trata payments SEM `metadata.intencao_id` com comportamento idêntico ao
  webhook original (regra inviolável documentada no topo do arquivo). Renovação
  futura cai naturalmente no checkout novo.
- Os dois mundos escrevem nas mesmas tabelas e o paywall usa a mesma
  `tem_assinatura_ativa()`; idempotência por upsert em `mp_payment_id`.

## Como rodar localmente

```bash
# Stack local (migrations já incluem a nova; se resetar, o seed cria o usuário de teste)
npx supabase start && npx supabase migration up   # ou db reset

# Frontend (environment.local.ts já aponta p/ o stack local + public key TEST)
cd frontend && npx ng serve    # http://localhost:4200

# Edges locais (necessário p/ submeter pagamento de verdade):
npx supabase functions serve --env-file /caminho/absoluto/para/supabase/functions/.env.local
# (o .env.local JÁ EXISTE nesta máquina, gitignored, com MP_ACCESS_TOKEN TEST;
#  MP_WEBHOOK_SECRET ainda é dummy — nenhum webhook de teste registrado)
```

Estado do ambiente ao fim de 2026-07-06: stack local + `ng serve` + `functions
serve` rodando; `.env.local` com o par **APP_USR do vendedor de teste** e
`MP_WEBHOOK_SECRET` real; túnel cloudflared ativo (URL efêmera — reconfigurar o
webhook no painel ao recriar); usuário local `teste@boramed.com` renomeado para
`test_user_3564881035891632645@testuser.com` (senha `Teste123!`; `db reset`
desfaz); banco local com a assinatura do C3 em `cancelled` (carência até
2026-08-06) — `delete from assinatura; delete from pagamento_intencao;` limpa.
Roteiro completo de cenários: `TESTE-PAGAMENTO-LOCAL.md` (cartões
APRO/FUND/SECU/CALL/DUPL, 3DS `5483 9281 6457 4623`, CPF `12345678909`).
Runners reais: `scripts/teste-manual-mp/` (README lá — inclui a matriz de
credenciais do sandbox e as envs `EMAIL`/`CARD`).

## O que falta (em ordem)

1. **Quando o sandbox de `/v1/payments` normalizar** (testar com o curl mínimo
   do histórico ou re-rodar `f5-cartoes.mjs APRO 6` com par TEST-):
   re-validar semestral, **C8 Pix/boleto aprovando de verdade via webhook**
   (webhook do túnel já configurado e funcionando) e rodar
   **`quality_evaluation`** via MCP (`is_ca=true`,
   `application_id=6161911882101170`, payment novo ≤7 dias), corrigindo itens
   até score alto.
2. **Decidir o hotfix da main** (seção "Acessos manuais" — decisão em aberto).
3. **F6**: code review completo da branch (segurança + regressão legado);
   opcional preview branch do Supabase via MCP para ensaio; checklist de go-live
   revisado com o usuário. Itens já anotados para a F6:
   - **Assinatura `paused` (achado 2026-07-06)**: usuário pausado não alcança o
     botão "Reativar" (paywall guard → /planos) E não é barrado pelo anti-dupla
     (`.in('status', ['authorized','cancelled'])` nas edges de processamento) —
     decidir: liberar a rota Minha Assinatura fora do paywall e/ou incluir
     `paused` no anti-dupla com CTA de reativação;
   - **Acesso imediato do mensal**: preapproval nasce `authorized` com
     `next_payment_date = agora` até a 1ª fatura processar — decidir se concede
     acesso provisório na resposta síncrona (UX: hoje fica em "Liberando…");
   - **Modal Trocar cartão**: pré-preencher e-mail
     (`initialization.payer.email`) e customizar o rótulo do botão do Brick
     (diz "Pagar" sem cobrar nada);
   - `mp-gerenciar-assinatura` devolve `detail: <body cru do MP>` no 502
     (contrato legado) — avaliar sanitizar como nas edges novas;
   - normalizar `federal_unit` extenso→UF na edge (boleto com CEP-lookup 401);
   - erro de console `<svg> attribute width/height` vazio na tela de status
     (ícone; cosmético); box do challenge 3DS vaza a borda direita do card;
   - 2 falhas pré-existentes de guards (mock sem `isRecoverySession`) — corrigir
     fora desta PR.
4. **F7 (SÓ com aprovação explícita do usuário)**: deploy faseado — (1) migration
   aditiva, (2) edges novas, (3) `mp-webhook`+`mp-gerenciar-assinatura`
   atualizados, (4) frontend, (5) janela de observação 2–4 semanas (rollback =
   reverter só o frontend). Lembrar do webhook de PRODUÇÃO (URL/secret) e da CSP.
5. **F8 (pós zero tráfego legado)**: remover `mp-criar-assinatura/`,
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
  nunca vaza na resposta nem nos logs (exceção legada: gerenciar, item de F6).
- **Replay do mesmo attempt_id**: mesmo usuário → reconsulta (GET) sem criar novo
  pagamento; outro usuário → 409.
- **`toMpDate()`**: MP exige offset explícito; a helper preserva o instante em
  `-03:00`.
- **FakeDb** (`_shared/test/fake.ts`) ganhou `gte`/`neq`/`order`/`limit` reais.
- **environment.local.ts** (gitignored) aponta para o stack local — antes
  apontava para produção.
- **CSP (se o hosting tiver)**: `script-src https://sdk.mercadopago.com
  https://http2.mlstatic.com`, `frame-src https://*.mercadopago.com https:`,
  `connect-src https://api.mercadopago.com https://events.mercadopago.com`.
- **MCP do Mercado Pago** está autenticado nesta máquina (create_test_user,
  get_credentials, save_webhook, quality_evaluation, search_documentation).
- A extensão Claude-in-Chrome NÃO estava conectada — por isso os testes de
  browser usam Playwright headless (chromium de `frontend/node_modules`).
