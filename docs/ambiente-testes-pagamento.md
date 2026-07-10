# Ambiente de testes — Integração de pagamento (Mercado Pago)

Como testar **todos os fluxos de pagamento** (assinar, recusa, cancelamento +
carência, pausa/reativação, semestral parcelado, reembolso/chargeback) **sem
tocar em produção**. Há dois ambientes complementares:

| Ambiente | Banco/Functions | Webhook do MP chega? | Quando usar |
|---|---|---|---|
| **A) Stack local** (`supabase start`) | Docker na sua máquina | Só via túnel (ngrok) ou simulador | Iterar rápido na lógica e na UI |
| **B) Branch de preview** (Supabase) | Isolado na nuvem, URL HTTPS real | Sim, direto | Teste fiel ponta a ponta com MP test |

> **Regra de ouro:** ambientes de teste usam **credenciais de TESTE** do Mercado
> Pago (vendedor de teste). Nunca o token de produção. Nunca colar secrets no chat.

---

## 0. Pré-requisitos no Mercado Pago (uma vez)

No painel do MP, em **modo de teste** (https://www.mercadopago.com.br/developers):

1. **Usuários de teste**: crie um **vendedor de teste** e um **comprador de teste**
   (Suas integrações → Contas de teste). Faça login com o vendedor de teste para o resto.
2. **Credenciais de teste** do vendedor: `Access Token` (TEST-...) e `Public Key` (TEST-...).
3. **Planos no MP**: com o **checkout embutido** (Payment Brick) não é preciso
   criar `preapproval_plan` — mensal = `POST /preapproval` com card token;
   semestral = `POST /v1/payments`. Os preços vêm da tabela `plano` do banco.
   (Só o fluxo LEGADO de redirect usava plano/`init_point`.)
4. **Webhook**: configure a URL de notificação apontando para a função `mp-webhook`
   do ambiente (ver B) e **gere o secret** (`MP_WEBHOOK_SECRET`). Tópicos:
   `subscription_preapproval`, `subscription_authorized_payment`, `payment`.
   O webhook continua obrigatório: confirma Pix/boleto e é a fonte da verdade.
5. **Cartões de teste** (digitados **no Payment Brick**, em `/checkout/mensal` e
   `/checkout/semestral` — sem redirect; CPF de teste `12345678909`):
   - **Aprovado**: Mastercard `5031 4332 1540 6351`, CVV `123`, validade futura, nome `APRO`.
   - **Recusado por fundos**: nome `FUND`. **Recusado genérico**: nome `OTHE`.
   - **CVV inválido**: `SECU`. **Validade**: `EXPI`. **Ligue para autorizar**: `CALL`.
   - **Duplicado**: `DUPL`. **Pendente (análise)**: `CONT`.
   - **Challenge 3DS**: Mastercard `5483 9281 6457 4623`.
   - (Pix/boleto de teste ficam `pending` e aprovam à parte.)

---

## A) Stack local

> Requer Docker rodando na sua máquina (o `supabase start` sobe Postgres + Auth +
> Edge runtime). O ambiente remoto do Claude **não** tem Docker — rode na sua máquina.

### A.1 Subir o banco e aplicar migrations
```bash
supabase start
supabase db reset          # aplica todas as migrations + seed.sql (usuário de teste)
```
O `seed.sql` cria `teste@boramed.com` / `Teste123!`. As migrations já semeiam os
planos sandbox. Para apontar aos **seus** planos de teste:
```bash
cp supabase/seed-test-planos.example.sql supabase/seed-test-planos.sql   # edite os IDs
supabase db query -f supabase/seed-test-planos.sql
```

### A.2 Secrets das functions
```bash
cp supabase/functions/.env.local.example supabase/functions/.env.local   # preencha
supabase functions serve --env-file ./supabase/functions/.env.local
```

### A.3 Frontend apontando para o local
```bash
cd frontend
cp src/environments/environment.local.example.ts src/environments/environment.local.ts
ng serve                    # usa environment.local.ts (configuração development)
```

### A.4 Webhooks no local — duas opções
- **Túnel (ngrok)** — recebe webhooks reais do MP test:
  ```bash
  ngrok http 54321
  # registre https://<sub>.ngrok.app/functions/v1/mp-webhook como webhook no MP test
  # e ajuste APP_URL no .env.local para a URL pública do app (ou do túnel do front)
  ```
- **Simulador** — sem MP, testa a validação de assinatura e o roteamento:
  ```bash
  deno run --allow-net --allow-env scripts/mp-webhook-sim.ts \
    --url http://127.0.0.1:54321/functions/v1/mp-webhook \
    --secret "$MP_WEBHOOK_SECRET" \
    --type subscription_preapproval --id <preapproval_id_real_de_teste>
  ```
  > O `mp-webhook` busca o recurso na API do MP. Para gravar de fato, o `--id`
  > precisa ser real (do seu ambiente de teste). Com id inventado, valida a
  > assinatura mas não grava (responde 200). Secret errado → 401 (teste de rejeição).

---

## B) Branch de preview do Supabase

Banco + functions isolados, com **URL HTTPS real** — o caminho mais fiel, pois os
webhooks do MP test chegam direto, sem túnel.

1. **Criar o branch** (via MCP do Supabase ou CLI). O branch roda as migrations
   automaticamente a partir da `main`.
2. **Secrets do branch** (Dashboard → Branch → Edge Functions → Secrets, ou CLI):
   `MP_ACCESS_TOKEN` (TEST), `MP_WEBHOOK_SECRET` (do webhook de teste), `APP_URL`
   (https do front de teste), `APP_ALLOWED_ORIGINS`.
3. **Planos**: ajuste a tabela `plano` do branch para seus IDs de teste
   (`seed-test-planos.example.sql`).
4. **Webhook no MP test**: aponte para
   `https://<branch-ref>.supabase.co/functions/v1/mp-webhook`.
5. **Frontend**: aponte `environment.local.ts` para a `supabaseUrl`/`supabaseAnonKey`
   do branch e rode `ng serve` (ou faça um deploy de preview no Vercel).
6. Ao terminar, **derrube o branch** para parar de gerar custo.

---

## Matriz de cenários (rode todos)

| # | Fluxo | Passos | Resultado esperado |
|---|---|---|---|
| 1 | **Assinar mensal (aprovado)** | Cartão `APRO` no Payment Brick de `/checkout/mensal` | `assinatura.status='authorized'` na hora (síncrono); paywall libera; verificação de cartão **não** vira `pagamento` |
| 2 | **Cartão recusado** | Cartão `FUND`/`SECU`/`CALL` no Brick | Permanece no checkout com **mensagem específica por recusa** e retry no próprio Brick; sem acesso |
| 3 | **Cancelar → carência** | Cancelar em "Minha assinatura" | Banner âmbar "acesso até <data>"; botão **"Assinar novamente" some**; acesso mantido até `proxima_cobranca` |
| 4 | **Reassinar na carência (anti cobrança dupla)** | Tentar assinar de novo durante a carência | `/checkout/*` redireciona ao dashboard; a edge retorna **409** "Você já tem um acesso ativo" |
| 5 | **Pausa → reativar** | Pausar (via MP) e abrir "Minha assinatura" | Aviso de pausa + botão **"Reativar"**; reativar volta para `authorized` |
| 6 | **Semestral parcelado** | `/checkout/semestral`, cartão `APRO` em 6x | Tela de status "Pagamento aprovado"; `proxima_cobranca = hoje + 6 meses`; não renova; `pagamento.parcelas=6` |
| 7 | **Reembolso/chargeback (semestral)** | Reembolsar o pagamento no painel MP test | Webhook `payment` `refunded` → `assinatura` vira `cancelled`, acesso **revogado** |
| 8 | **Pix** | `/checkout/semestral` → Pix → QR + copia-e-cola + countdown 30min | Tela de status aprova sozinha (polling + webhook); expirado → "Gerar novo pagamento" |
| 9 | **Boleto** | `/checkout/semestral` → boleto | Link "Abrir boleto" + "Já paguei, verificar" (`mp-consultar-pagamento`); acesso libera na compensação |
| 10 | **Challenge 3DS** | Cartão `5483 9281 6457 4623` | Tela "Confirmação do seu banco" (Status Screen Brick); aprovação via polling |
| 11 | **Trocar cartão (mensal)** | "Minha assinatura" → "Trocar cartão" | `PUT /preapproval` com card token novo; recusa mantém o cartão anterior |
| 12 | **1ª parcela recorrente** | Após assinar mensal, aguardar `subscription_authorized_payment` | Registra `pagamento` (retry 409 até o vínculo existir; sem perder receita) |
| 13 | **Rate limit / anti card testing** | 6 tentativas seguidas no checkout | 6ª tentativa → **429** "Muitas tentativas… aguarde alguns minutos" |
| 14 | **Regressão legado** | Simular webhooks de preapproval/payment antigos (sem `intencao_id`) | Comportamento idêntico ao anterior (fallbacks preservados) |

---

## Inspeção rápida do estado (SQL)

```sql
-- Estado da assinatura de um usuário
select status, proxima_cobranca, cancelada_em, mp_preapproval_id, mp_payment_id
from assinatura where user_id = '<uuid>';

-- Pagamentos do usuário
select status, valor_centavos, liquido_centavos, metodo_pagamento, processado_em
from pagamento where user_id = '<uuid>' order by criado_em desc;

-- A RPC de acesso (carência incluída)
select tem_assinatura_ativa('<uuid>');
```
Logs das functions: `supabase functions logs mp-webhook` (local) ou Dashboard do branch.

---

## Limpeza

- **Local**: `supabase db reset` zera tudo; `supabase stop` derruba o Docker.
- **Branch**: derrube o branch no Dashboard/MCP para parar custo.
- **Produção**: nunca rode os scripts/seeds de teste contra o ref de produção
  (`gakvktwtdunljojghpff`).
