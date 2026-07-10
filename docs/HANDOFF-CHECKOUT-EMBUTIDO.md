# Handoff — Checkout embutido (branch `feat/checkout-embutido`)

> Documento de contexto para o próximo agente/dev continuar o trabalho.
> Plano original completo: `PLANO-CHECKOUT-EMBUTIDO.md` (raiz do repo). Leia-o
> primeiro — este handoff registra **o que já foi feito, como validar e o que falta**.
> Última atualização: **2026-07-06 (fim do dia)**, após destravar o preapproval,
> o webhook TEST e fechar a F5-manual. (Mescla as sessões de 05/07 no Windows e
> 06/07 no Linux — trabalharam em paralelo; ver "Estado por máquina".)

## ⏯️ RETOMADA — exatamente onde paramos (2026-07-07)

**F5-manual está ENCERRADA.** As 2 decisões que travavam a F6 foram tomadas pelo
usuário em **2026-07-07** e os achados decididos já foram **implementados** (ver
"F6 — implementado" abaixo). Decisões batidas:

1. **Hotfix na main?** → **Esperar a F7.** Nada a fazer na main agora (o botão
   "Cancelar" quebrado p/ manuais/cortesia só corrige no deploy da branch).
2. **Regras dos achados novos:** (a) liberar rota Minha Assinatura fora do
   paywall p/ `paused` → **SIM**; (b) incluir `paused` no anti-dupla → **SIM**;
   (c) mensal recém-autorizado ganha acesso provisório → **SIM**.
3. **"Uma assinatura viva só" (era a decisão em aberto)** → **SIM, cancelar o
   preapproval recorrente ao conceder acesso único.** Implementado (ver
   "F6-b" abaixo).

**Próximo passo (2026-07-07, fim da sessão 2):** todos os achados da F6
implementados, revisados e validados. F6-b commitada+pushed (`493483d`) e
**validada manualmente contra o MP real** (happy-path: preapproval órfão → MP
`cancelled` + acesso mantido — ver "Validação manual F6-b"). Falta:
1. **Aprovação de cartão fim-a-fim no sandbox** ficou pendente (a conta sandbox
   do vendedor não resolveu o BIN nesta janela — `Cannot infer Payment Method`);
   validar na F7 com pagamento real (já no checklist de go-live).
2. **Checklist de go-live** — rascunho abaixo (seção "Checklist de go-live");
   revisar com o usuário antes da F7.
3. Depois F7 (deploy faseado, só com aprovação explícita) e F8.

## ✅ F6 — implementado (2026-07-07)

Os 3 achados decididos + 2 itens anotados do modal, com testes:

- **Anti-dupla inclui `paused` — SÓ no fluxo recorrente**
  (`mp-processar-assinatura/handler.ts`): a query passou a `['authorized',
  'cancelled', 'paused']`; `hasActiveAccess` roda sobre as linhas **exceto**
  `paused` (paused não é acesso ativo) e, se houver uma `paused`, retorna **409**
  direcionando a reativar em Minha assinatura (evita 2º preapproval vivo). O
  handler do **semestral** (`mp-processar-pagamento`, pagamento único via
  `/v1/payments`) **NÃO** barra `paused` — não há preapproval, e comprar o
  semestral é uma via legítima de o pausado voltar a ter acesso (ajuste feito no
  code review; teste garante que o semestral não é bloqueado). A edge legada
  `mp-criar-assinatura` NÃO foi alterada (fora do fluxo da UI, sai na F8).
- **Acesso provisório do mensal** (`mp-processar-assinatura/handler.ts`): quando
  o preapproval nasce `authorized` mas `next_payment_date` vem nulo ou ≤ agora,
  grava `proxima_cobranca = agora + 1 período` (helper `addPeriodo`, UTC) para
  `tem_assinatura_ativa()` liberar na hora; o webhook
  `subscription_authorized_payment` corrige a data real na 1ª cobrança. Teste
  novo cobrindo `next_payment_date = agora`. O caminho com data futura real
  segue intacto (teste existente inalterado).
- **Minha Assinatura fora do paywall** (`subscription.guard.ts`): o guard agora
  recebe `(route, state)` e libera o **path exato** `/dashboard/assinatura`
  (ignora query/fragment; não isenta rotas irmãs como `/dashboard/assinatura-x`
  — ajuste do code review). Demais rotas do dashboard seguem no paywall; assim o
  `paused` alcança "Reativar". 2 specs novos (libera assinatura / mantém paywall
  nas outras). Descoberta: `planos.component.ts` mostra um banner "assinatura
  pausada → Reativar" (link p/ `/dashboard/assinatura`) quando o usuário cai em
  /planos pausado.
- **Furo do guard corrigido — `canActivateChild`** (`app.routes.ts`): o
  `subscriptionGuard` era só `canActivate` na rota-pai `/dashboard`, então um
  pausado que entrasse pela rota isenta circulava por TODO o dashboard (o guard
  não re-rodava nas navegações filhas). Adicionado `canActivateChild:
  [lazySubscriptionGuard]` na rota `/dashboard` → o paywall é reavaliado a cada
  navegação entre filhas; só `/dashboard/assinatura` passa. **Tradeoff anotado**:
  isso faz 1 RPC `tem_assinatura_ativa` por navegação no dashboard (inclui
  usuários ativos). Aceito por ora; se incomodar, a alternativa limpa é tirar a
  Minha Assinatura de dentro do `/dashboard` (rota própria fora do paywall,
  reusando o mesmo componente).
- **Mensagens com aspas**: o 409 do paused agora diz `... em "Minha assinatura"
  ...` (ajuste de UX pedido pelo usuário).
- **Modal Trocar cartão** (`trocar-cartao-modal.component.ts`): pré-preenche
  `initialization.payer.email` (do `auth.user()`) e customiza o rótulo do botão
  do Brick via `customization.visual.texts.formSubmit = 'Salvar cartão'`
  (confirmado na doc oficial do Payment Brick).

Validação automatizada (2026-07-07): Deno `deno test --allow-env .` →
**108 passed**; `ng build` OK; `ng test --watch=false` completo → **475 passed,
2 failed** (as 2 falhas pré-existentes de guards `isRecoverySession`, alheias à
PR — também quebram na main). E2E não rodado nesta sessão (stub do Brick não é
afetado pelas mudanças).

## ✅ F6-b — "uma assinatura viva só" (2026-07-07, sessão 2)

Resolve a decisão que estava em aberto (preapproval órfão quando um `paused`
compra o semestral). Implementado em `_shared/mp-payment-sync.ts` (o
`syncAcessoUnicoPayment`, ponto único por onde TODO acesso único aprovado passa —
resposta síncrona do cartão, **webhook** do Pix/boleto e reconciliação):

- No branch `approved`, antes de conceder o acesso, o `B5` foi **estendido entre
  produtos**: busca as assinaturas do usuário em `['authorized','paused']` e, para
  as **recorrentes** (com `mp_preapproval_id`), faz `PUT /preapproval/{id}
  {status:'cancelled'}` **no MP** — não deixa mais um preapproval vivo/órfão.
  Acesso único anterior (`authorized` sem preapproval) segue superado só
  localmente (bookkeeping, nada a cancelar no MP).
- **Tolerante a falha (inviolável):** a linha só é marcada `cancelled` localmente
  quando o cancelamento no MP dá certo. Se o MP responde erro **ou o fetch lança**
  (rede), loga e `continue` — a recorrente fica **viva e visível** (gerenciável em
  Minha Assinatura / reconciliação), nunca um órfão escondido, **e a concessão do
  acesso pago (adiante no fluxo) NUNCA é derrubada**. Sem cliente MP (só em teste)
  também não cancela silenciosamente uma recorrente com preapproval.
- **Idempotente:** as recorrentes canceladas saem do filtro `authorized/paused`,
  então uma 2ª chamada (webhook após a resposta síncrona) não redispara o PUT; se
  o 1º PUT falhou, a 2ª chamada **reintenta** (recuperação natural).
- Os 3 callers passam o cliente MP ao sync: `mp-processar-pagamento` (2 pontos),
  `mp-webhook` (topic payment) e `mp-consultar-pagamento`.

**⚠️ Restrição #2 (legado) — tocado de propósito e testado:** isto passa a
cancelar no MP também um **mensal legado `authorized`** que complete um acesso
único (via webhook/legado; pela UI o anti-dupla barra antes). É a correção de um
**double-charge latente** (o `B5` antigo já parava de rastrear o mensal
localmente, mas ele seguia cobrando no MP). Coberto por teste de regressão
(`sync approved: ... B5 — inclui legado authorized`). Não altera os fallbacks de
resolução de usuário do `mp-webhook`.

Testes novos em `_shared/mp-payment-sync.test.ts` (+ ajuste do B5 do
`mp-webhook/handler.test.ts` para mockar o `/preapproval/{id}`): PUT dispara e
cancela (authorized e paused); PUT com erro 5xx → recorrente permanece viva +
acesso concedido; **fetch que LANÇA (rede) → acesso ainda concedido** (trava o
try/catch); sem cliente MP → não cancela silenciosamente. **Deno: 112 passed /
0 failed.** Frontend NÃO mudou (a alternativa "Minha Assinatura sempre expõe a
gerenciável" foi descartada em favor do cancelamento na raiz).

### ✅ Validação manual F6-b (2026-07-07, sessão 2, MP TEST real) — happy-path OK
Feita com as credenciais do vendedor de teste (login headless
`vendedor-login.mjs`; APP_USR de produção p/ preapproval + TEST/sandbox p/
payments — ambos da app 908829636068202, extraídos p/ scratchpad gitignored):
1. **Preapproval real criado** via `mp-processar-assinatura` (card token API +
   edge) → `authorized`; depois `PUT status=paused` → linha local `paused` +
   preapproval real pausado no MP.
2. **Cancelamento exercido pelo CÓDIGO REAL**: rodei o próprio
   `syncAcessoUnicoPayment` (deno, importando o módulo de produção) contra o
   **banco local real + MP real** (token APP_USR), com um `pay` aprovado
   `acesso_unico` fabricado. Resultado ao vivo:
   - o **preapproval real no MP foi para `cancelled`** (confirmado via
     `GET /preapproval/{id}` → `cancelled`);
   - a linha recorrente local foi para `cancelled`;
   - novo semestral concedido `authorized`, `proxima_cobranca` = +6 meses →
     **acesso mantido**.
   Como em produção uma única conta APP_USR faz pagamento **e** preapproval, esse
   é fielmente o cenário real (o token que cancela = o token da conta).
3. **Limitação do sandbox (não é bug da F6-b)**: o cartão via Brick/API **não
   aprovou** — a conta sandbox do vendedor não resolveu o BIN (`Cannot infer
   Payment Method` / `installments_excludes_country`; BIN search retornou 0 p/
   todos os cartões de teste). Por isso a *aquisição do pagamento* foi
   substituída pelo `pay` fabricado; a aprovação de cartão fim-a-fim continua
   dependente da janela de observação da F7 (já no checklist). O passo
   "cancelar durante a compra com token TEST" não foi observável (compra não
   aprovou), mas é o MESMO código do caminho validado — só muda o token, e em
   produção o token é sempre o da conta (APP_USR), que é o que foi provado.
   `.gitignore` reforçado p/ ignorar `mp-seller-state.json`/`creds*.json`/`*.png`
   dos runners (antes só cobria nomes específicos).

### ✅ Review completo pré-go-live + correções (2026-07-09)

Code review integral da branch (4 revisores paralelos + verificação manual de
cada achado; suítes re-rodadas). Banco/RLS aprovado sem ressalvas. Achados
falsos descartados após verificação (replay de webhook é inócuo — o handler
re-consulta o estado no MP; `NaN` em `next_payment_date` CONCEDE o provisório,
pois `!NaN` é true). Dois achados reais, **corrigidos**:

- **Concessão engolida pelo índice único (CORRIGIDO)** — `mp-payment-sync.ts`:
  quando o PUT de cancelamento da F6-b falhava com uma recorrente `authorized`
  sobrevivente (legada/vencida), o upsert do acesso único violava
  `assinatura_um_authorized_por_user` (índice parcial da migration
  `20260622130000`), o erro era **ignorado na desestruturação** e a intenção
  virava `aprovada` SEM acesso — pagou sem acesso e, sem acesso, o anti-dupla
  não barra uma 2ª compra (cobrança dupla). Os testes passavam porque o FakeDb
  não emulava a constraint. Agora: o erro do upsert é checado;
  `SyncResult.concessaoPendente=true`; a intenção fica **`pendente`** (nunca
  `aprovada` sem acesso); `mp-webhook` responde **409** (o MP reenvia —
  recuperação automática, mesmo padrão do B1) e `mp-consultar-pagamento`
  responde `in_process` (a UI não mostra sucesso sem o acesso existir). Cada
  retry reexecuta o sync inteiro — reintenta o PUT e concede quando o MP
  voltar. O caso `paused` (happy-path validado da F6-b) **não muda**: o índice
  é parcial em `authorized`.
- **`detail` cru do MP no 502 do gerenciar (CORRIGIDO)** — removido da resposta
  e do log (o teste de contrato legado não fixava o campo; era o pendente de F6).

Infra de teste: **FakeDb agora emula o índice único parcial** (erro 23505,
escrita não aplicada, como no Postgres real) — vale para todos os testes atuais
e futuros. 4 testes novos: sync com authorized+PUT falho → intenção pendente;
retry recupera e concede; webhook → 409; consultar → in_process.
Validação (2026-07-09): Deno **116 passed / 0 failed**; `ng build` OK;
`ng test` 475 passed / 2 falhas pré-existentes (guards, também na main);
E2E `mocked` 23 passed.

Residuais do review anotados e aceitos (baixo risco, não corrigidos):
`setMonth` (sync) vs `setUTCMonth` (addPeriodo) — inócuo, runtime é UTC; o B5
do `mp-processar-assinatura` cancela `authorized` anteriores só localmente (sem
PUT no MP — cenário exige recorrente vencida anômala); janela de corrida do
rate limit (2 simultâneas podem virar 6/15min); boleto sem link nem CTA de
regenerar quando a sessão se perde (escape via "Voltar aos planos");
`sanitizeAddress` sem limite de tamanho.

### Code review (2026-07-07)
Rodado (4 finders paralelos + verificação). Refactor legado confirmado **fiel**
(sem regressão). 2 achados das mudanças F6 → **corrigidos**: (1) `paused`
bloqueava o semestral → removido o bloqueio do `mp-processar-pagamento`; (2)
guard usava `startsWith` (isentaria rotas irmãs) → trocado por path exato.
Residuais anotados (não corrigidos, baixo risco): ordenação replay×anti-dupla,
overflow de fim-de-mês no `addPeriodo`, falsy-zero em `mp-payment-sync`. (O
"lockout do pausado antigo" foi **RESOLVIDO** na F6-b — ver seção acima.)

### Validação manual F6 (2026-07-07, MP TEST real, stack local) — TUDO ✅
Feita junto com o usuário, limpando o banco entre cenários:
- **A — Mensal APRO → acesso provisório**: `authorized`, `proxima_cobranca` =
  hoje **+1 mês**, `tem_assinatura_ativa=true` na hora, `pagamento`=0 linhas.
  (Pegadinha: na 1ª tentativa a edge servia **código em cache** de um
  `functions serve` ANTIGO de sessão anterior — havia 2 rodando; matei ambos,
  reiniciei o edge runtime e subiu 1 só; aí o provisório funcionou.)
- **B1** banner "pausada" em /planos; **B2** guard libera Minha Assinatura +
  botão Reativar; **B3** anti-dupla mensal: pausado → **409** sem 2º preapproval
  (confirmado em log + banco); **#2** com `canActivateChild`, pausado fica preso
  só na Minha Assinatura; **B4** Reativar → `authorized`.
- **C — Trocar cartão**: e-mail **pré-preenchido** (o Brick deixa de pedir o
  campo) + botão **"Salvar cartão"**; troca concluiu (`card_updated`).
- **D — Semestral APRO 6x**: `authorized`, `mp_payment_id` set,
  `mp_preapproval_id` NULL, `proxima_cobranca` = **+6 meses**, `pagamento`
  approved/parcelas=6. (Exigiu trocar credenciais p/ o par **TEST-** e logar como
  `teste@boramed.com` — ver "Estado das credenciais".)
- **E — Pausado compra semestral**: **NÃO** é bloqueado (a correção do review);
  coexistem no banco a `paused` (mensal) + a `authorized` (semestral). Isso
  expôs a **decisão em aberto** do topo (preapproval órfão).

### Estado das credenciais/ambiente ao encerrar (2026-07-07)
- **`.env.local` + `environment.local.ts` estão com o par de PRODUÇÃO `TEST-`**
  (app Boramed `6161911882101170`, obtido via MCP `get_credentials`) — bom p/
  **semestral/Pix/boleto/3DS** com usuário `teste@boramed.com` (e-mail normal;
  com TEST- de produção o payer NÃO pode ser test user).
- **Backup do par APP_USR do vendedor** (para o **mensal/preapproval**) em
  `.tools/mp-seller/env.local.appusr.bak` e
  `.tools/mp-seller/environment.local.ts.appusr.bak` — restaurar p/ testar mensal
  (aí logar como `test_user_8444543486803681374@testuser.com`).
- Senhas resetadas p/ `Teste123!`: `teste@boramed.com` e
  `test_user_8444543486803681374@testuser.com`.
- Banco local: tem dados de teste (paused mensal + authorized semestral do
  `teste@boramed`) — `delete from pagamento; delete from pagamento_intencao;
  delete from assinatura;` limpa.
- `functions serve` + `ng serve` + Docker do Supabase ficaram de pé ao encerrar.
- **Lição**: garantir **1 só** `functions serve`; se trocar código/env, matar os
  antigos e reiniciar o edge runtime (`docker restart
  supabase_edge_runtime_ProjetoMed`) p/ não servir módulo/env em cache.

**Estado do ambiente ao encerrar a sessão** (processos de terminal morreram ao
fechar; o Docker do Supabase continua de pé):
- Para religar: `npx supabase start` (se preciso) + `functions serve --env-file
  supabase/functions/.env.local` + `cd frontend && npx ng serve`.
- **Túnel morto**: recriar com `cloudflared tunnel --url http://127.0.0.1:54321
  --protocol http2` (http2 é OBRIGATÓRIO nesta rede) e **atualizar a URL do
  webhook** nas 2 abas do painel do vendedor (app 908829636068202 → Webhooks) —
  `scripts/teste-manual-mp/vendedor-login.mjs` (headless) ou
  `mp-seller-login.mjs` (headed, p/ captcha) logam lá (senha do vendedor:
  painel da conta produtiva → Contas de teste). O `MP_WEBHOOK_SECRET` do
  `.env.local` continua válido (não muda com a URL). **NUNCA usar o
  `save_webhook` do MCP**: ele atua na conta principal (produção) e pode
  rotacionar o secret de prod.
- `.env.local` e `environment.local.ts` estão com o **par TEST do vendedor de
  teste** (bom p/ pagamentos semestral/Pix/boleto); p/ mensal (preapproval),
  trocar pro par APP_USR — os dois pares estão nos próprios arquivos/histórico
  desta máquina e a matriz está em `scripts/teste-manual-mp/README.md`.
- Usuário local: `test_user_3564881035891632645@testuser.com` / `Teste123!`
  (era `teste@boramed.com`; um `db reset` volta ao seed). Banco local tem
  sujeira de teste (pagamentos/assinatura) — limpar com
  `delete from pagamento; delete from pagamento_intencao; delete from assinatura;`.

## TL;DR

Migração do checkout de pagamento de **redirect** (Checkout Pro / init_point do
Mercado Pago) para **checkout embutido** na plataforma (Payment Brick + Checkout
API). **F1–F5 concluídas. F5-manual: 10 de 10 cenários exercitados** — 2026-07-03
validou os 7 de pagamento único; 2026-07-05 (Windows) destravou o preapproval e
validou o C1; 2026-07-06 (Linux) validou C3/C5/C10 e o **webhook de teste via
túnel** (notificações reais do MP chegando e escrevendo no banco local), além de
sobreviver a um outage do sandbox no meio do caminho. A medição oficial de
qualidade ficou para a F7 (exige pagamento de produção) e novos achados de
UX/regra entraram na lista da F6. Nada foi enviado ao Supabase remoto (que é o
de PRODUÇÃO — ref `gakvktwtdunljojghpff`): sem `db push`, sem `functions
deploy`, sem mexer em secrets/webhook de produção. **F6 implementada, revisada e
validada manualmente (2026-07-07, cenários A–E ✅) — commitada; F6-b (uma
assinatura viva só — cancelamento do preapproval órfão) implementada e coberta
por testes (Deno 112 passed).** Faltam: validação manual da F6-b fim-a-fim,
checklist de go-live (rascunho pronto — ver seção própria), F7 (deploy faseado
com aprovação explícita) e F8 (limpeza pós-observação).

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
- ⚠️ **Outage do sandbox em 2026-07-06 (~13h–16h UTC, recuperou no mesmo dia)**:
  `POST /v1/payments` retornou `500 internal_error` para qualquer
  credencial/payload por ~3h (a edge respondeu 502 + intenção `criada` —
  comportamento correto sob falha do MP, validado ao vivo).
- ✅ **Pós-outage**: C6 semestral APRO 6x revalidado fim-a-fim (approved,
  parcelas=6, acesso na hora). **Refinamento da matriz**: payments funcionam com
  o par **TEST do vendedor de teste** desde que `payer.email` seja o comprador
  de teste — e com o par TEST da conta produtiva o payer NÃO pode ser test user
  (400 "Invalid users involved" nos dois sentidos). Logo **a app do vendedor
  cobre tudo** (payments com par TEST, preapproval com par APP_USR, e-mail local
  fixo no comprador de teste) e o webhook dela já aponta p/ o túnel nas 2 abas.
- ✅ **Topic `payment` real validado (2ª rodada de 2026-07-06)**: a lista de
  notificações do painel (API `/developers/panel/applications/api/webhooks/notifications`)
  revelou que o MP ENVIAVA os `payment.created` mas recebia **502 — o túnel QUIC
  do cloudflared degrada nesta rede** (a mesma que bloqueia ngrok). Recriado com
  `--protocol http2`: entrega real com **HTTP 200 em ~8s** e o MP fez retry
  automático dos 502 antigos. **Sempre subir o túnel com
  `cloudflared tunnel --url http://127.0.0.1:54321 --protocol http2`.**
  Payment sem `metadata.tipo='acesso_unico'` é ignorado pelo sync (correto —
  só payments de acesso concedem acesso; legados reais têm o metadata).
- 🔶 **C8 Pix parcial (limite do sandbox)**: Pix criado pelo Brick real (QR +
  countdown + polling), intenção/`pagamento` pending sincronizados e
  `payment.created` entregue; **aprovar Pix de teste é impossível** (PUT
  status→approved dá 403; ninguém "paga" o QR do sandbox). A aprovação
  assíncrona Pix→webhook→acesso fica para a janela de observação da F7.
- ⚠️ **Medição de qualidade: SÓ pós-deploy.** Todas as vias foram esgotadas:
  `quality_evaluation` via MCP recusa payments TEST- ("Payment was not
  originated from app", qualquer combinação de parâmetros); a ferramenta do
  painel exige explicitamente "um ID em produção" (recusou payment TEST na
  tela); payments com o par APP_USR do vendedor dão 401 (restrição da conta).
  → Agendar a medição oficial na F7 com o 1º pagamento real.
  **Auto-avaliação contra o checklist oficial (`quality_checklist` via MCP)**:
  requisitos todos ✓ (webhook, external_reference, SDK JS V2/Bricks secure
  fields, statement_descriptor, SSL/TLS do hosting, payer completo com email/
  nome/CPF, items com id/title/description/category/quantity/unit_price) exceto
  **backend SDK** (edges Deno chamam REST direto — não há SDK oficial p/ Deno;
  justificar na homologação se pedirem). Boas práticas: reconsulta pós-webhook ✓,
  mensagens de resposta ✓, address no boleto ✓; não usados por decisão/escopo:
  chargebacks API, cancel de pending, relatórios, auth+capture, customer/cards
  salvos; avaliar na F6: logo oficial do MP no checkout.

### Receita alternativa (sessão Windows, 2026-07-05) — reproduzir em outra máquina

1. Credenciais do vendedor via scripts portáveis: `MP_TEST_SELLER_PASS='<senha>'
   node scripts/teste-manual-mp/mp-seller-login.mjs` (headed; humano resolve o
   captcha) e depois `node scripts/teste-manual-mp/mp-seller-credentials.mjs`
   (grava `creds.json` + screenshot, gitignored). No Linux (sem captcha em
   2026-07-06) o `vendedor-login.mjs` headless resolveu direto.
2. Usuário local com e-mail de comprador de teste — em vez de renomear o seed,
   dá para CRIAR um usuário novo via admin API (chaves demo do stack local):

   ```bash
   curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
     -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"test_user_8444543486803681374@testuser.com","password":"Teste123!","email_confirm":true,"user_metadata":{"nome":"Comprador Teste MP"}}'
   ```

   Compradores de teste conhecidos: `TESTUSER3564881035891632645`
   (test_user_3564881035891632645@testuser.com — usado no Linux) e
   `TESTUSER8444543486803681374` (test_user_8444543486803681374@testuser.com —
   usado no Windows). Criar novos: `POST /users/test_user` com o token da conta
   principal.
3. Cartões: no Windows a Visa MLA `4509 9535 6623 3704` resolveu; no Linux a
   Visa MLB `4235 6477 2802 5682` também. (Mastercard de teste não resolve com
   as keys do vendedor.)
4. O workaround de `APP_URL` https usado no Windows ficou DESNECESSÁRIO: a edge
   ganhou fallback https de `back_url` no código (commit `8cf4fee`, com teste).

### ✅ Achado "proxima_cobranca = agora" — RESOLVIDO (2026-07-06)

O Windows flagou que o preapproval nasce com `next_payment_date = date_created`.
Confirmado com túnel/webhook ligados: é o comportamento normal do MP — a 1ª
fatura processa assíncrono e o `subscription_authorized_payment` (ou qualquer
update, ex. cancelamento) avança o `next_payment_date` (+1 mês), que o webhook
sincroniza em `proxima_cobranca`. Em produção funciona; a janela entre autorizar
e o 1º webhook é exatamente a decisão (c) da seção RETOMADA (acesso provisório).
No sandbox a 1ª fatura nunca processou (limitação conhecida).


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

## Checklist de go-live (rascunho — revisar com o usuário antes da F7)

Ordem pensada para **rollback barato** (o frontend antigo continua funcionando
com as edges novas; reverter = só o deploy do frontend). Marcar cada item na
janela de deploy.

**Pré-deploy (na branch, antes de tocar produção)**
- [ ] Suites verdes: Deno `deno test --allow-env .` (116), `ng build`, `ng test`
      (475/2 pré-existentes), E2E `mocked`. Reconfirmar na hora.
- [ ] Diff da migration `20260703120000_*` revisado: **aditivo** (nova tabela +
      colunas + COMMENTs), sem DROP, sem reverter grants (cuidado do `db pull`).
- [ ] `config.toml`: `verify_jwt=true` nas edges de processamento; `false` só no
      `mp-webhook`. Conferir que nada legado foi removido (F8 é depois).
- [ ] CSP do hosting (se houver): `script-src https://sdk.mercadopago.com
      https://http2.mlstatic.com`, `frame-src https://*.mercadopago.com https:`,
      `connect-src https://api.mercadopago.com https://events.mercadopago.com`.

**Secrets/credenciais de PRODUÇÃO (conta principal, não o vendedor de teste)**
- [ ] `MP_ACCESS_TOKEN` = **APP_USR de produção** nos secrets das edges.
- [ ] `mercadoPagoPublicKey` = **public key de produção** no `environment.prod`.
- [ ] `MP_WEBHOOK_SECRET` = secret do webhook de PRODUÇÃO (NÃO o do túnel de teste).
- [ ] `SUPABASE_URL`/`APP_URL` https reais (habilitam `notification_url` e
      `back_url` — em prod deixam de cair no fallback).

**Deploy faseado (cada passo verificável isolado)**
1. [ ] `supabase db push` da migration aditiva → conferir tabela/colunas no prod.
2. [ ] `functions deploy` das edges NOVAS (`mp-processar-pagamento`,
       `mp-processar-assinatura`, `mp-consultar-pagamento`) — ainda sem tráfego.
3. [ ] `functions deploy` do `mp-webhook` + `mp-gerenciar-assinatura` atualizados
       (contêm o cancelamento do órfão da F6-b e o `trocar_cartao`).
4. [ ] Webhook de PRODUÇÃO no painel: URL = `${SUPABASE_URL}/functions/v1/mp-webhook`,
       eventos **Pagamentos** + **Planos e assinaturas**; validar HMAC com 1 evento.
       **NUNCA usar `save_webhook` do MCP** (atua na conta e pode rotacionar o
       secret de prod).
5. [ ] Deploy do **frontend** (checkout embutido vira o caminho ativo).

**Smoke test em produção (1º pagamento real, valor real)**
- [ ] Semestral cartão aprovado → acesso na hora; `pagamento`/`assinatura` ok.
- [ ] Mensal aprovado → acesso provisório imediato; 1ª fatura corrige a data via
      webhook (janela curta em prod).
- [ ] Pix e boleto: geração + aprovação real → webhook concede acesso.
- [ ] **Uma assinatura viva só (F6-b)**: pausar o mensal e comprar o semestral →
      confirmar no painel do MP que o preapproval pausado ficou **cancelled** **E
      que o usuário CONTINUA com acesso** logo depois (a notificação
      `subscription_preapproval` cancelled que o próprio cancel dispara é
      row-scoped por `mp_preapproval_id` no webhook — não deve revogar o acesso
      único recém-concedido; validar ao vivo).
- [ ] **Medição oficial de qualidade** no painel do MP com o 1º payment de
      produção (não dá com TEST-) e corrigir apontamentos. Único gap conhecido do
      `quality_checklist`: backend sem SDK oficial (edges Deno via REST) —
      justificar se pedirem.

**Observação (2–4 semanas)**
- [ ] Monitorar logs das edges + entregas do webhook (retries/502).
- [ ] Confirmar assinantes **legados** (mensal via redirect / semestral Checkout
      Pro) intactos: renovação, refund/chargeback, cancelar/pausar/reativar.
- [ ] Rollback disponível a qualquer momento = reverter só o frontend.
- [ ] Só depois de tráfego legado zerado → **F8** (remoção do código legado).

## O que falta (em ordem)

1. ~~Fechar as pontas do webhook/qualidade~~ **FEITO em 2026-07-06**: topic
   `payment` real validado (túnel http2); medição oficial de qualidade só é
   possível pós-deploy (diagnóstico na seção pós-outage) — **incluir na F7**:
   rodar a medição no painel com o 1º pagamento real e corrigir apontamentos.
2. ~~**Decidir o hotfix da main**~~ **DECIDIDO em 2026-07-07: esperar a F7.**
3. **F6**: code review completo da branch (segurança + regressão legado);

   opcional preview branch do Supabase via MCP para ensaio; checklist de go-live
   revisado com o usuário. Itens da F6:
   - ~~**Assinatura `paused`**~~ **FEITO (2026-07-07)**: rota Minha Assinatura
     liberada do paywall + `paused` incluído no anti-dupla com CTA de reativação
     (ver "F6 — implementado" no topo);
   - ~~**Acesso imediato do mensal**~~ **FEITO (2026-07-07)**: acesso provisório
     de 1 período quando `next_payment_date` nasce = agora;
   - ~~**Modal Trocar cartão**~~ **FEITO (2026-07-07)**: e-mail pré-preenchido +
     rótulo do botão `formSubmit = 'Salvar cartão'`;
   - ~~**Uma assinatura viva só / preapproval órfão**~~ **FEITO (2026-07-07,
     F6-b)**: ao conceder acesso único, o preapproval recorrente do usuário é
     cancelado no MP (ver seção "F6-b" no topo);
   - **PENDENTE** — `mp-gerenciar-assinatura` devolve `detail: <body cru do MP>`
     no 502 (contrato legado) — avaliar sanitizar como nas edges novas;
   - **PENDENTE** — normalizar `federal_unit` extenso→UF na edge (boleto com
     CEP-lookup 401 no sandbox);
   - **PENDENTE** — erro de console `<svg> attribute width/height` vazio na tela
     de status (ícone; cosmético); box do challenge 3DS vaza a borda direita;
   - **PENDENTE** — 2 falhas pré-existentes de guards (mock sem
     `isRecoverySession`) — corrigir fora desta PR.
   - **Achados do code review (2026-07-07), avaliados e NÃO corrigidos** (baixo
     risco / pré-existentes):
     - *Ordenação replay × anti-dupla* em `mp-processar-assinatura`: o check de
       acesso (passo 4) roda antes do replay idempotente (passo 5); um retry com
       o MESMO `attempt_id` de uma assinatura já `authorized` devolve 409 em vez
       do 200 idempotente. Estreito (o front gera `attempt_id` novo por tentativa
       + lock anti dupla-submissão) e pré-existente em produção. Se incomodar:
       mover o passo 5 (replay por `mp_preapproval_id` do attempt) antes do 4.
     - *`addPeriodo` estoura fim de mês* (31/jan +1 mês → 03/mar): valor
       provisório, o webhook corrige na 1ª cobrança (minutos em prod). Também só
       trata `months`/`days` — outros `frequency_type` viram dias.
     - *Lockout do pausado há muito tempo*: se a única assinatura é `paused` com
       carência vencida e o preapproval no MP já não reativa, o 409 do anti-dupla
       do mensal o impede de reassinar o mensal — mas ele consegue comprar o
       semestral (não barrado), e ao comprá-lo o preapproval pausado agora é
       **cancelado** (F6-b), então ele deixa de ficar preso na próxima vez.
       Escape direto no mensal (reassinar quando o `paused` é irreversível) segue
       como melhoria futura de baixa prioridade.
     - *`valor_centavos`/`liquido_centavos` com falsy-zero* em
       `mp-payment-sync.ts` (`transaction_amount` 0 → null): pré-existente,
       `transaction_amount` real nunca é 0.
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
