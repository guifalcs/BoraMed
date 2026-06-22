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
3. **Planos de assinatura** (preapproval_plan) para o **mensal** (recorrente). O
   **semestral** é pagamento único (Checkout Pro) e **não** precisa de plano.
4. **Webhook**: configure a URL de notificação apontando para a função `mp-webhook`
   do ambiente (ver B) e **gere o secret** (`MP_WEBHOOK_SECRET`). Tópicos:
   `subscription_preapproval`, `subscription_authorized_payment`, `payment`.
5. **Cartões de teste** (para o checkout): use os cartões oficiais do MP. Resumo:
   - **Aprovado**: Mastercard `5031 4332 1540 6351`, CVV `123`, validade futura, nome `APRO`.
   - **Recusado por fundos**: nome `FUND`. **Recusado genérico**: nome `OTHE`.
   - **Pendente**: nome `CONT`.
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
| 1 | **Assinar mensal (aprovado)** | Cartão `APRO` no checkout do mensal | `assinatura.status='authorized'`; paywall libera; `pagamento` aprovado no histórico |
| 2 | **Cartão recusado** | Cartão `OTHE`/`FUND` | Tela `/assinatura/retorno` mostra **"Pagamento não aprovado"** + "Tentar novamente"; sem acesso |
| 3 | **Cancelar → carência** | Cancelar em "Minha assinatura" | Banner âmbar "acesso até <data>"; botão **"Assinar novamente" some**; acesso mantido até `proxima_cobranca` |
| 4 | **Reassinar na carência (anti cobrança dupla)** | Tentar assinar de novo durante a carência | `mp-criar-assinatura` retorna **409** "Você já tem um acesso ativo"; não cria novo preapproval |
| 5 | **Pausa → reativar** | Pausar (via MP) e abrir "Minha assinatura" | Aviso de pausa + botão **"Reativar"**; reativar volta para `authorized` |
| 6 | **Semestral parcelado** | Checkout do semestral, parcelar em até 6x, cartão `APRO` | `assinatura.status='authorized'`, `proxima_cobranca = hoje + 6 meses`; não renova |
| 7 | **Reembolso/chargeback (semestral)** | Reembolsar o pagamento no painel MP test | Webhook `payment` `refunded` → `assinatura` vira `cancelled`, acesso **revogado** |
| 8 | **Pendente (Pix/boleto)** | Pagar semestral com Pix/boleto de teste | Retorno explica "em processamento"; acesso libera quando o webhook aprovar |
| 9 | **1ª parcela recorrente** | Após assinar mensal, aguardar `subscription_authorized_payment` | Registra `pagamento` (retry 409 até o vínculo existir; sem perder receita) |

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
