# Handoff — Checkout embutido (branch `feat/checkout-embutido`)

> Documento de contexto para o próximo agente/dev continuar o trabalho.
> Plano original completo: `PLANO-CHECKOUT-EMBUTIDO.md` (raiz do repo). Leia-o
> primeiro — este handoff registra **o que já foi feito, como validar e o que falta**.
> Última atualização: **2026-07-03 (fim do dia)**, após a execução da F5-manual.

## TL;DR

Migração do checkout de pagamento de **redirect** (Checkout Pro / init_point do
Mercado Pago) para **checkout embutido** na plataforma (Payment Brick + Checkout
API). **F1–F5 concluídas; F5-manual executada com MP TEST real: 7 de 10 cenários
validados fim-a-fim.** Os 4 cenários de PREAPPROVAL (mensal) estão bloqueados por
uma limitação do sandbox do MP que **exige ação manual do usuário** (credenciais
de vendedor de teste — ver seção "Bloqueio do preapproval"). Nada foi enviado ao
Supabase remoto (que é o de PRODUÇÃO — ref `gakvktwtdunljojghpff`): sem `db push`,
sem `functions deploy`, sem mexer em secrets/webhook. Faltam: destravar o
preapproval, webhook via ngrok, F6 (revisão/checklist), F7 (deploy faseado com
aprovação explícita) e F8 (limpeza pós-observação).

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

## ⛔ Bloqueio do preapproval (mensal) — AÇÃO DO USUÁRIO PENDENTE

`POST /preapproval` com credenciais **TEST-** da conta produtiva retorna sempre
`404 Card token service not found` (confirmado empiricamente; trocar o
payer_email por e-mail de comprador de teste NÃO resolve). A documentação do MP
confirma: o sandbox de **assinaturas** exige credenciais de um **vendedor de
teste** (os payments avulsos/Bricks funcionam com TEST-, por isso o semestral
passou e o mensal não).

Já existe o vendedor de teste: `TESTUSER7012000526337652922` (id 3486450558,
criado 20/06). Passos para destravar:
1. Pegar a senha dele em
   https://www.mercadopago.com.br/developers/panel/app/7353629886544639/test-users
2. Logar no Mercado Pago como ele (janela anônima) e criar uma aplicação no
   painel de dev dessa conta.
3. Trocar `MP_ACCESS_TOKEN` (`supabase/functions/.env.local`) e a public key
   (`frontend/src/environments/environment.local.ts`) pelas credenciais
   **APP_USR** do vendedor de teste (test users usam as credenciais "produtivas"
   deles — não há aba de credenciais de teste nessas contas).
4. Re-rodar: C1 mensal APRO (`PLANO=mensal node scripts/teste-manual-mp/f5-cartoes.mjs APRO`),
   C3 cancelar→carência, C5 pausar→reativar, C10 trocar cartão. O comprador de
   teste é `TESTUSER3564881035891632645` (id 3487525400).
   Lembrete: comprador ≠ conta/e-mail do vendedor (senão o botão do Brick trava).

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

1. **Destravar preapproval** (ação do usuário — seção do bloqueio acima) e
   re-rodar C1/C3/C5/C10.
2. **Webhook TEST**: túnel ngrok (`ngrok http 54321`) + registrar webhook no
   painel/MCP (`save_webhook`) + `MP_WEBHOOK_SECRET` real no `.env.local` →
   confirmar Pix/boleto aprovando de verdade e os eventos de preapproval.
3. **`quality_evaluation`** via MCP do MP com um payment de teste (`is_ca=true`),
   corrigindo itens até score alto.
4. **Decidir o hotfix da main** (seção "Acessos manuais" — decisão em aberto).
5. **F6**: code review completo da branch (segurança + regressão legado);
   opcional preview branch do Supabase via MCP para ensaio; checklist de go-live
   revisado com o usuário. Itens já anotados para a F6:
   - `mp-gerenciar-assinatura` devolve `detail: <body cru do MP>` no 502
     (contrato legado) — avaliar sanitizar como nas edges novas;
   - normalizar `federal_unit` extenso→UF na edge (boleto com CEP-lookup 401);
   - erro de console `<svg> attribute width/height` vazio na tela de status
     (ícone; cosmético); box do challenge 3DS vaza a borda direita do card;
   - 2 falhas pré-existentes de guards (mock sem `isRecoverySession`) — corrigir
     fora desta PR.
6. **F7 (SÓ com aprovação explícita do usuário)**: deploy faseado — (1) migration
   aditiva, (2) edges novas, (3) `mp-webhook`+`mp-gerenciar-assinatura`
   atualizados, (4) frontend, (5) janela de observação 2–4 semanas (rollback =
   reverter só o frontend). Lembrar do webhook de PRODUÇÃO (URL/secret) e da CSP.
7. **F8 (pós zero tráfego legado)**: remover `mp-criar-assinatura/`,
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
