# Handoff — Checkout embutido (branch `feat/checkout-embutido`)

> Documento de contexto para o próximo agente/dev continuar o trabalho.
> Plano original completo: `PLANO-CHECKOUT-EMBUTIDO.md` (raiz do repo). Leia-o
> primeiro — este handoff registra **o que já foi feito, como validar e o que falta**.
> Última atualização: **2026-07-05 (noite)** — ambiente Windows restaurado E
> **preapproval destravado** (C1 mensal validado fim-a-fim). Ver seções
> "Preapproval DESTRAVADO" e "Estado por máquina".

## TL;DR

Migração do checkout de pagamento de **redirect** (Checkout Pro / init_point do
Mercado Pago) para **checkout embutido** na plataforma (Payment Brick + Checkout
API). **F1–F5 concluídas; F5-manual: 8 de 10 cenários validados fim-a-fim com MP
TEST real** (7 no dia 03/07 + C1 mensal no dia 05/07 após destravar o
preapproval com credenciais do vendedor de teste — ver seção "Preapproval
DESTRAVADO"). Nada foi enviado ao Supabase remoto (que é o de PRODUÇÃO — ref
`gakvktwtdunljojghpff`): sem `db push`, sem `functions deploy`, sem mexer em
secrets/webhook. Faltam: C3/C5/C10 (gestão da mensal), investigar
`proxima_cobranca`=agora no preapproval novo (achado em aberto), webhook via
túnel + Pix/boleto reais, `quality_evaluation`, F6 (revisão/checklist), F7
(deploy faseado com aprovação explícita) e F8 (limpeza pós-observação).

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

## ✅ Preapproval DESTRAVADO (2026-07-05) — C1 mensal validado fim-a-fim

O bloqueio (`404 Card token service not found` com credenciais TEST-) foi
resolvido usando as credenciais **APP_USR do vendedor de teste**. Receita
completa do ambiente que funciona (reproduzir em qualquer máquina):

1. **Vendedor de teste**: `TESTUSER7012000526337652922` (id 3486450558, senha
   com o Guilherme). Ele **já tem** a aplicação **"BoraMed Teste"
   (nº 908829636068202, produto CheckoutBricks)** — NÃO precisa criar outra.
   Credenciais em: logar no MP como ele (janela anônima; captcha impede
   automação total — ver `.tools/mp-seller/step1-login-headed2.mjs` que
   automatiza tudo menos o captcha) → painel dev → app 908829636068202 →
   Credenciais de produção (contas de teste usam as credenciais "produtivas"
   delas; o token começa com APP_USR e funciona como sandbox).
2. **`supabase/functions/.env.local`**: `MP_ACCESS_TOKEN` = Access Token APP_USR
   do vendedor de teste; **`APP_URL` precisa ser https** (ex.
   `https://boramedoficial.com.br`) — o MP rejeita `back_url` http com
   `400 Invalid value for back_url`. Em PROD isso já é https; gap só local.
3. **`frontend/src/environments/environment.local.ts`**:
   `mercadoPagoPublicKey` = Public Key APP_USR do vendedor de teste.
4. **Payer PRECISA ser comprador de teste** quando o collector é vendedor de
   teste (`400 Both payer and collector must be real or test users`). O
   `payer_email` do preapproval é o e-mail da CONTA logada no app → criar um
   usuário no Supabase local com o e-mail do comprador de teste. Comprador em
   uso: `TESTUSER8444543486803681374` (id 3515110045,
   `test_user_8444543486803681374@testuser.com`); usuário local criado com esse
   e-mail e senha `Teste123!` via admin API. (Criar novos compradores:
   `POST /users/test_user` com o token de produção da conta principal — a
   resposta traz e-mail e senha.)
5. **Cartão de teste**: com a public key do vendedor de teste os BINs da
   Mastercard de teste (503143/548392) **não resolvem** no BIN search do Brick
   (`no_payment_method_for_provided_bin`); a **Visa `4509 9535 6623 3704`**
   resolve. Runners aceitam `CARD=` e `EMAIL=` por env:
   `PLANO=mensal CARD='4509 9535 6623 3704' EMAIL='test_user_8444543486803681374@testuser.com' node scripts/teste-manual-mp/f5-cartoes.mjs APRO`

**Resultado do C1 (mensal APRO)**: aprovado fim-a-fim — Brick tokeniza, edge
cria preapproval `authorized` no MP, `assinatura` local `authorized` com
`mp_preapproval_id`, intenção `aprovada`, **0 linhas em `pagamento`** (cobrança
de verificação corretamente não registrada), tela "Pagamento aprovado!".

### ⚠️ ACHADO EM ABERTO (investigar antes da F7): `proxima_cobranca` = agora

O MP devolveu o preapproval authorized com `next_payment_date` **igual ao
`date_created`** (não +1 mês), e o upsert gravou `proxima_cobranca = agora` —
ou seja, o acesso recém-comprado pode expirar imediatamente (a UI mostrou
aprovado, mas `tem_assinatura_ativa()` pode virar false minutos depois).
Hipóteses a validar:
- Comportamento normal do MP: a 1ª cobrança acontece logo após autorizar e o
  webhook `subscription_authorized_payment` atualiza `next_payment_date` → sem
  webhook local (sem túnel) o valor nunca é corrigido. Se for isso, em prod
  funciona, mas há uma janela de corrida entre autorizar e o 1º webhook.
- Ou quirk do sandbox.
Ações sugeridas: (a) reproduzir com túnel/webhook ligado e ver se o
`next_payment_date` é corrigido pelo evento; (b) considerar na edge
`mp-processar-assinatura` um piso defensivo (`proxima_cobranca = max(MP,
agora+1 período)`) — discutir antes de implementar; (c) conferir como o fluxo
legado (redirect) se comportava nesse campo.

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

Estado do ambiente ao fim de 2026-07-03: stack local rodando, `ng serve` no ar,
banco local com as tabelas de pagamento **vazias** (limpei após os testes; um
`db reset` recria tudo). Roteiro completo de cenários: `TESTE-PAGAMENTO-LOCAL.md`
(cartões APRO/FUND/SECU/CALL/DUPL, 3DS `5483 9281 6457 4623`, CPF `12345678909`).
Runners reais: `scripts/teste-manual-mp/` (README lá).

## O que falta (em ordem)

1. ~~Destravar preapproval~~ ✅ FEITO (2026-07-05, seção acima). Faltam ainda os
   cenários **C3 (cancelar→carência), C5 (pausar→reativar), C10 (trocar cartão)**
   — rodar com o ambiente da receita acima (já há assinatura authorized do C1 no
   banco local para começar o C3). Re-rodar também os cenários de cartão do
   semestral (C2/C6/C9) com as credenciais novas — foram validados dia 03/07 com
   TEST-, mas a public key mudou.
2. **Investigar `proxima_cobranca` = agora** (seção do achado em aberto) —
   idealmente junto com o item 3 (webhook), que deve esclarecer a hipótese.
3. **Webhook TEST**: túnel (`ngrok http 54321`, ou `.tools/cloudflared.exe
   tunnel --url http://127.0.0.1:54321`) + registrar webhook **no painel do
   VENDEDOR DE TESTE** (app 908829636068202 → Webhooks; NUNCA no app de
   produção — `save_webhook` do MCP atua na conta principal e pode rotacionar o
   secret de prod) + `MP_WEBHOOK_SECRET` real no `.env.local` → confirmar
   Pix/boleto aprovando de verdade e os eventos de preapproval.
   Atenção: a lista de payment_methods do vendedor de teste NÃO inclui `pix`
   (master/visa/elo/amex/account_money/bolbradesco) — o cenário Pix pode exigir
   voltar o token TEST- da conta principal (funciona p/ payments) ou verificar
   se o Pix habilita na conta de teste.
4. **`quality_evaluation`** via MCP com um payment de teste (`is_ca=true`).
   Tentado dia 05/07 com payment do dia 03 (token TEST- da conta principal):
   o homologador respondeu 404 "Payment not found" — usar um payment feito com
   as credenciais do VENDEDOR DE TESTE e passar `application_id` dele.
5. **Decidir o hotfix da main** (seção "Acessos manuais" — decisão em aberto).
6. **F6**: code review completo da branch (segurança + regressão legado);
   opcional preview branch do Supabase via MCP para ensaio; checklist de go-live
   revisado com o usuário. Itens já anotados para a F6:
   - `mp-gerenciar-assinatura` devolve `detail: <body cru do MP>` no 502
     (contrato legado) — avaliar sanitizar como nas edges novas;
   - normalizar `federal_unit` extenso→UF na edge (boleto com CEP-lookup 401);
   - erro de console `<svg> attribute width/height` vazio na tela de status
     (ícone; cosmético); box do challenge 3DS vaza a borda direita do card;
   - 2 falhas pré-existentes de guards (mock sem `isRecoverySession`) — corrigir
     fora desta PR.
7. **F7 (SÓ com aprovação explícita do usuário)**: deploy faseado — (1) migration
   aditiva, (2) edges novas, (3) `mp-webhook`+`mp-gerenciar-assinatura`
   atualizados, (4) frontend, (5) janela de observação 2–4 semanas (rollback =
   reverter só o frontend). Lembrar do webhook de PRODUÇÃO (URL/secret) e da CSP.
8. **F8 (pós zero tráfego legado)**: remover `mp-criar-assinatura/`,
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

## Estado por máquina (2026-07-05, PC Windows `G:\BoraMed`)

Ambiente restaurado do zero nesta segunda máquina:
- `environment.local.ts` estava apontando para **PRODUÇÃO** (cópia antiga, sem
  `mercadoPagoPublicKey`) — recriado do example (stack local + public key TEST).
- `supabase/functions/.env.local` não existia — criado com `MP_ACCESS_TOKEN`
  TEST obtido via MCP (`get_credentials`, app Boramed 6161911882101170);
  `MP_WEBHOOK_SECRET` segue dummy.
- Suítes re-validadas aqui: Deno **104 passed**, `ng build` OK, E2E `mocked`
  **23 passed**.
- Runners de `scripts/teste-manual-mp/` tinham caminho absoluto do PC Linux —
  corrigidos para caminhos relativos (portáveis).
- Pegadinha local: `ng serve` com `.angular/cache` velho da `main` quebra a
  extração de rotas SSR (`checkout/* server route does not match`) — resolver
  com `rm -rf frontend/.angular/cache`.
- `.tools/` (gitignored): `cloudflared.exe` baixado como opção de túnel para o
  webhook TEST (ngrok não instalado nesta máquina).
- **⚠️ Sandbox do MP instável em 2026-07-05 com credenciais TEST-**: BIN search
  (`/v1/payment_methods/search`) → 500 para qualquer BIN e `POST /v1/payments`
  Pix mínimo → `internal_error 500`, direto na API (nada do nosso stack; com a
  public key de produção o BIN search responde 200). Efeito colateral positivo:
  validou fim-a-fim o caminho de erro 5xx real — edge → 502 sanitizado, intenção
  volta a `criada`, banner "Pagamento temporariamente indisponível. Tente
  novamente." e usuário permanece no checkout. Com as credenciais do vendedor de
  teste (adotadas na mesma noite) o BIN search voltou a responder 200.
- **Fechamento de 2026-07-05 (noite)**: preapproval destravado e C1 validado
  (seção própria). Re-validados nesta máquina com MP TEST real: Pix
  (QR+countdown+polling) e boleto (link + "Já paguei, verificar") — ainda com o
  token TEST- antes da troca. Estado dos envs locais DESTA máquina:
  `.env.local` e `environment.local.ts` já com as credenciais do vendedor de
  teste e `APP_URL` https. Banco local: assinatura mensal `authorized` do C1
  (usuário `test_user_8444543486803681374@testuser.com` / `Teste123!`) — bom
  ponto de partida para o C3. Sessão do MP do vendedor de teste salva em
  `.tools/mp-seller/session.json` (cookies; só esta máquina). Screenshots dos
  runs em `.tools/f5-out/`.
