# Teste local da integração de pagamento — BoraMed

Guia prático para testar **todos os fluxos de pagamento na sua máquina**, sem
tocar em produção e sem custo. Ambiente: stack local do Supabase (`supabase start`)
+ frontend Angular + credenciais de **TESTE** do Mercado Pago.

> Referência completa (incl. branch cloud, opcional): `docs/ambiente-testes-pagamento.md`.

---

## 1. Pré-requisitos (uma vez)

- **Docker** rodando (o `supabase start` sobe Postgres + Auth + Edge runtime).
- **Supabase CLI** e **Node** instalados (`npx supabase --version`, `node -v`).
- **Deno** (só para o simulador de webhook): https://deno.com.
- **ngrok** (só se quiser webhook real do MP): https://ngrok.com (plano grátis serve).
- **Conta de TESTE do Mercado Pago**:
  1. Painel MP → *Suas integrações* → crie um **vendedor de teste** e um **comprador de teste**.
  2. Logue como vendedor de teste e pegue o **Access Token (TEST-...)** e a **Public Key (TEST-...)**.
  3. Crie o **plano de assinatura (preapproval_plan)** do **mensal**. O **semestral** é
     pagamento único (Checkout Pro) e não precisa de plano.

---

## 2. Subir o ambiente local

```bash
# 1) Banco + migrations + usuário de teste (teste@boramed.com / Teste123!)
supabase start
supabase db reset

# 2) Apontar os planos para os SEUS ids de teste do MP
cp supabase/seed-test-planos.example.sql supabase/seed-test-planos.sql   # edite os ids
supabase db query -f supabase/seed-test-planos.sql

# 3) Secrets das edge functions (token/secret de TESTE)
cp supabase/functions/.env.local.example supabase/functions/.env.local   # preencha
supabase functions serve --env-file ./supabase/functions/.env.local

# 4) Frontend apontando para o Supabase local
cd frontend
cp src/environments/environment.local.example.ts src/environments/environment.local.ts
ng serve     # abre em http://localhost:4200
```

> `.env.local` e `environment.local.ts` são **gitignored** — nunca são comitados.
> Nunca cole esses valores no chat.

---

## 3. Webhook: como o Mercado Pago "avisa" o app

A confirmação do pagamento (ativar assinatura, registrar cobrança) chega por
**webhook** — o MP não enxerga `localhost`. Escolha **uma** das opções:

### Opção A — ngrok (webhook real, recomendado para o teste de verdade)
```bash
ngrok http 54321
# copie a URL https gerada e registre no painel MP test (Webhooks):
#   https://<sub>.ngrok.app/functions/v1/mp-webhook
# tópicos: subscription_preapproval, subscription_authorized_payment, payment
# gere o secret do webhook e coloque em MP_WEBHOOK_SECRET no .env.local
```

### Opção B — simulador (sem MP, testa assinatura/roteamento)
```bash
deno run --allow-net --allow-env scripts/mp-webhook-sim.ts \
  --url http://127.0.0.1:54321/functions/v1/mp-webhook \
  --secret "<seu MP_WEBHOOK_SECRET>" \
  --type subscription_preapproval \
  --id <preapproval_id_real_do_checkout_de_teste>
```
> O `mp-webhook` busca o recurso na API do MP, então para **gravar de fato** o
> `--id` precisa ser real (ex.: o `preapproval_id` que aparece na volta do checkout
> de teste). Secret errado → **401** (valida a rejeição de assinatura inválida).

---

## 4. Cartões de teste do Mercado Pago

No checkout, use os cartões oficiais de teste (o nome do titular controla o resultado):

| Resultado | Cartão | Nome do titular | CVV / validade |
|---|---|---|---|
| **Aprovado** | Mastercard `5031 4332 1540 6351` | `APRO` | `123` / qualquer futura |
| **Recusado (genérico)** | mesmo cartão | `OTHE` | idem |
| **Recusado (sem saldo)** | mesmo cartão | `FUND` | idem |
| **Pendente** | mesmo cartão | `CONT` | idem |

Pix/boleto de teste ficam `pending` e aprovam à parte (testa o cenário 8).

---

## 5. Roteiro de testes (rode na ordem)

Use o usuário de teste (`teste@boramed.com` / `Teste123!`) ou crie um pelo `/cadastro`.

### Cenário 1 — Assinar mensal (aprovado)
1. Logue → você cai no paywall → **/planos** → "Assinar" no **Mensal**.
2. No checkout do MP, pague com o cartão **APRO**.
3. Volta para **/assinatura/retorno** → "Confirmando…" → **"Assinatura ativada! 🎉"** → entra no painel.
- ✅ Esperado: `assinatura.status='authorized'`, paywall liberado, pagamento no histórico.

### Cenário 2 — Cartão recusado
1. Repita o checkout com o cartão **OTHE** (ou **FUND**).
2. Volta para **/assinatura/retorno**.
- ✅ Esperado: tela **"Pagamento não aprovado"** com botão **"Tentar novamente"**; sem acesso.

### Cenário 3 — Cancelar → carência
1. Com a mensal ativa, vá em **menu → Assinatura → "Cancelar assinatura"** e confirme.
- ✅ Esperado: banner âmbar "acesso até <data>"; o botão **"Assinar novamente" some**;
  você continua acessando o conteúdo até `proxima_cobranca`.

### Cenário 4 — Reassinar na carência (anti cobrança dupla) ⭐
1. Ainda em carência, tente assinar de novo (force indo direto a **/planos** → "Assinar").
- ✅ Esperado: erro **409 "Você já tem um acesso ativo no momento."**; **não** cria novo
  preapproval (esta é a correção principal — sem cobrança em dobro).

### Cenário 5 — Pausa → reativar
1. No painel MP test, **pause** a assinatura (ou via API). O webhook traz `paused`.
2. Abra **Assinatura** no app.
- ✅ Esperado: aviso de pausa + botão **"Reativar assinatura"**; reativar volta para `authorized`.

### Cenário 6 — Semestral parcelado (pagamento único)
1. **/planos** → "Assinar" no **Semestral** → no checkout, parcele em até 6x, cartão **APRO**.
- ✅ Esperado: `assinatura.status='authorized'`, `proxima_cobranca = hoje + 6 meses`, **não** renova.

### Cenário 7 — Reembolso/chargeback revoga (semestral)
1. No painel MP test, **reembolse** o pagamento do semestral.
- ✅ Esperado: webhook `payment` `refunded` → `assinatura` vira `cancelled`, acesso **revogado**.

### Cenário 8 — Pendente (Pix/boleto)
1. Pague o semestral com **Pix/boleto** de teste (fica `pending`).
- ✅ Esperado: retorno explica "em processamento"; o acesso libera quando o webhook aprovar.

---

## 6. Conferir o estado no banco

```bash
supabase db query "
  select status, proxima_cobranca, cancelada_em, mp_preapproval_id, mp_payment_id
  from assinatura order by criado_em desc limit 5;"

supabase db query "
  select status, valor_centavos, metodo_pagamento, processado_em
  from pagamento order by criado_em desc limit 10;"

# A RPC de acesso (true também na carência):
supabase db query "select tem_assinatura_ativa('<uuid-do-usuario>');"
```
Logs das functions: `supabase functions logs mp-webhook`.

---

## 7. Limpar / encerrar

```bash
supabase db reset   # zera dados de teste (mantém schema)
supabase stop       # derruba o Docker
```

> ⚠️ Nunca rode estes comandos/seeds contra o projeto de **produção**
> (`gakvktwtdunljojghpff`). Eles são só para o ambiente local.
