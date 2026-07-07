# Inspeção de Segurança — BoraMed (Supabase + Frontend)

**Data:** 2026-06-24
**Escopo:** Supabase (RLS, RPCs/SECURITY DEFINER, grants, storage, auth) e a interação frontend ↔ backend (Angular + supabase-js / PostgREST).
**Método:** análise do estado **ao vivo** do projeto `gakvktwtdunljojghpff` (políticas RLS, corpo das funções, grants por coluna, buckets) + revisão das edge functions e do cliente Angular. Achados marcados como *provados* foram confirmados empiricamente com `set role authenticated`.

---

## Resumo executivo

A base de segurança é **boa**: RLS está ligada em todas as 34 tabelas, as funções de admin checam `is_admin()` internamente, troca de papel é restrita a `super_admin` e protegida por triggers, o sistema de banimento é `RESTRICTIVE` (funciona de fato), o webhook do Mercado Pago valida assinatura HMAC, e não há `service_role` vazado no frontend nem segredos commitados.

**Porém há 1 falha CRÍTICA e 1 ALTA** que quebram a integridade do produto (cola em tempo real, dump do acervo, adulteração de notas) e dependem da mesma causa-raiz: **as tabelas-base estão expostas via PostgREST com `SELECT/UPDATE` amplo, e a proteção real (esconder gabarito, validar pontuação) vive apenas nas RPCs — que o atacante simplesmente ignora chamando a tabela direto.**

| # | Severidade | Achado | Causa-raiz |
|---|-----------|--------|-----------|
| 1 | 🔴 **CRÍTICA** | Gabarito + acervo inteiro legível por qualquer usuário logado | `alternativa`/`questao` com RLS `qual: true` e grant de coluna em `correta`/`explicacao`/`resposta_correta_texto` |
| 2 | 🟠 **ALTA** | Aluno adultera a própria nota/respostas via `UPDATE` direto | `tentativa`/`tentativa_resposta` com `UPDATE` amplo e policy `with_check: null` |
| 3 | 🟡 MÉDIA | Paywall só no client — conteúdo acessível sem assinatura | RPCs de conteúdo não chamam `tem_assinatura_ativa()`; tabelas-base abertas |
| 4 | 🟡 MÉDIA | `mp-vincular-assinatura` permite vincular assinatura não reivindicada | falta checar `payer_email == user.email` |
| 5 | 🔵 BAIXA | `get_ranking_global` vaza `user_id` de quem optou por não competir | `user_id` emitido incondicionalmente |
| 6 | 🔵 BAIXA | Token de impersonação é sessão completa (não escopada/curta) | `generateLink` magiclink |
| 7 | 🔵 BAIXA | Webhook MP sem checagem de frescor (replay) | `ts` não validado |
| 8 | 🔵 BAIXA | Proteção de senha vazada (HIBP) desligada | config de Auth |
| 9 | ⚪ HIGIENE | Grants `anon`/EXECUTE em RPCs admin; `criar_ticket` sem null-check; CORS wildcard fallback | — |

---

## 🔴 1. CRÍTICA — Gabarito e acervo inteiro legíveis por qualquer usuário autenticado

> **STATUS: ✅ APLICADO EM PROD** (2026-06-24) na migration `20260624125610_seguranca_revogar_gabarito_e_escrita_tentativa.sql`. Prova: como `authenticated`, `SELECT correta FROM alternativa` → `permission denied for table alternativa`. Gabarito só sai via RPC SECURITY DEFINER. Frontend já estava preparado.
>
> ⚠️ **REGRESSÃO (causa-raiz):** esta falha JÁ tinha sido fechada em `20260609130000_seguranca_critico1_revogar_gabarito`, mas a migration **autogerada** `20260612174550_sistema_suporte` (criada via `supabase db pull`/`db diff`) re-emitiu `grant select on alternativa/questao to authenticated`, revertendo o hardening. **`db pull`/`db diff` captura os grants default e desfaz recortes de coluna.** Ver seção "Processo" abaixo.

**Prova empírica** (rodado como role `authenticated`):
```sql
set local role authenticated;
select count(*) from public.alternativa where correta = true;  -- => 748  (= todas as questões)
```

As tabelas `alternativa` e `questao` têm política de leitura totalmente aberta para qualquer logado:
```
alternativa_select_authenticated : SELECT  qual = true
questao_select_authenticated      : SELECT  qual = true
```
e o role `authenticated` tem `SELECT` nas colunas sensíveis:
`alternativa.correta`, `questao.resposta_correta_texto`, `questao.respostas_aceitas`, `questao.explicacao`, `questao.explicacao_alternativas`.

**Impacto:**
- **Cola em tempo real:** durante um simulado, o aluno faz `GET /rest/v1/alternativa?select=questao_id,letra,correta` e recebe o gabarito de tudo. As RPCs (`iniciar_tentativa`, `retomar_tentativa`) escondem `correta` com cuidado — esforço **inútil**, porque a tabela-base entrega o mesmo dado.
- **Dump do acervo (IP do produto):** qualquer conta grátis baixa as 748 questões com enunciado, alternativas, explicações e referências.
- **Bypass de paywall** (ver #3).
- **Rascunhos:** `qual: true` ignora `status`, então questões `rascunho`/em revisão também vazam (hoje há 0, mas é estrutural).

**Agravante no frontend:** `frontend/src/app/core/services/questao.service.ts:55` lê `alternativa(*)` (inclui `correta`) direto da tabela — o app já entrega o gabarito ao browser nesse caminho.

**Correção (requer migration + ajuste de frontend, não é só revoke):**
1. Revogar leitura das colunas de resposta da tabela-base:
   ```sql
   revoke select (correta) on public.alternativa from authenticated, anon;
   revoke select (resposta_correta_texto, respostas_aceitas, explicacao, explicacao_alternativas)
     on public.questao from authenticated, anon;
   ```
2. Servir questões **sempre via RPC** que decide quando revelar gabarito (durante a prova: não; na revisão de tentativa finalizada: sim). O fluxo de execução já usa RPCs (`iniciar_tentativa`, `salvar_resposta_tentativa`, `get_revisao_*`) — migrar `questao.service.ts` (`listarPorProva`, `buscarPorId`) para uma RPC equivalente ou uma *view* sem as colunas de resposta.
3. (Opcional) Restringir `SELECT` da própria tabela a questões `status='ativa'` para esconder rascunhos.

---

## 🟠 2. ALTA — Aluno adultera a própria nota e respostas via UPDATE direto

> **STATUS: ✅ APLICADO EM PROD** (2026-06-24) na mesma migration `20260624125610` (revoga INSERT/UPDATE/DELETE de `tentativa`/`tentativa_resposta`; remove as policies de escrita; `salvar_resposta_tentativa` convertida INVOKER→DEFINER). Verificado em prod: privilégios = só `SELECT`. **Mesma regressão do #1** — havia sido fechado em `20260609120000_seguranca_bloquear_escrita_tentativa` e revertido por `20260612174550_sistema_suporte`.

`authenticated` tem `UPDATE` amplo e há policy de update **sem `with_check`**:
```
tentativa_update_own          : UPDATE  qual = (auth.uid() = user_id)   with_check = NULL
tentativa_resposta_update_own : UPDATE  qual = (dono via subquery)      with_check = NULL
```
Colunas atualizáveis incluem `tentativa.nota, acertos, status, total_respondidas` e `tentativa_resposta.correta, alternativa_id, resposta_texto`.

**Exploração:** o aluno faz, na própria tentativa,
```
PATCH /rest/v1/tentativa?id=eq.<minha>            { "nota": 10, "acertos": 999, "status": "finalizada" }
PATCH /rest/v1/tentativa_resposta?id=eq.<minha>   { "correta": true }
```
Sem `with_check`, nada valida o valor escrito — contorna `salvar_resposta_tentativa` (que bloqueia escrita após finalizar) e `finalizar_tentativa` (que calcula a nota).

**Impacto:** falsifica histórico/KPIs (`get_historico_kpis`, `get_desempenho_por_tema`), infla o ranking e a percepção de desempenho. Integridade do produto comprometida.

> Observação: `user_gamificacao_stats` e `gamificacao_evento` têm grant de UPDATE, mas **não têm policy permissiva de UPDATE**, então a RLS nega — XP/nível **não** são graváveis direto. Bom.

**Correção:** remover a capacidade de escrita livre nessas tabelas. Preferível: `revoke update on public.tentativa, public.tentativa_resposta from authenticated` e deixar toda mutação para as RPCs `SECURITY DEFINER` (que já validam dono e estado). Se precisar manter algum update direto (ex.: `favorito`), usar grant **por coluna** + `with_check` espelhando o `qual` e proibindo colunas de pontuação.

---

## 🟡 3. MÉDIA — Paywall aplicado só no cliente

> **STATUS: ✅ APLICADO EM PROD** (2026-06-24, migration `20260624131517_seguranca_paywall_conteudo_assinantes`). Decisão de produto: **conteúdo só para assinantes**. Duas camadas: (1) RLS em `questao`/`alternativa` exige `tem_assinatura_ativa()`; (2) gate de assinatura nas RPCs `iniciar_tentativa`, `gerar_simulado_personalizado`, `gerar_simulado_impressao`, `get_simulado_impressao` (DEFINER não passam por RLS). Rotas `/imprimir/*` ganharam `lazySubscriptionGuard`. Verificado em prod: não-assinante → `questao` retorna 0 linhas e RPC lança `subscription_required`; admin → 748 questões e gera normal.
>
> **Fronteira escolhida:** gateamos a *aquisição* de conteúdo. `get_revisao_prova`/`get_revisao_tentativa` (tentativas que o próprio usuário já finalizou) e o desafio diário ficaram **abertos de propósito** — ajustar se a regra mudar. **Operacional:** hoje há **0 assinaturas ativas**; só admins acessam conteúdo (igual ao comportamento do guard que já estava no ar).

Existe `tem_assinatura_ativa(uid)` (migration `20260620120000`), mas **nenhuma** das RPCs de conteúdo a chama (`iniciar_tentativa`, `gerar_simulado_personalizado`, `gerar_simulado_impressao`, `get_simulado_impressao`). O guard é só o `subscription.guard.ts` do Angular. Some-se a isso o #1 (tabelas abertas) e: **usuário grátis ou com assinatura vencida acessa todo o conteúdo** chamando RPC/tabela direto.

**Correção:** validar entitlement no servidor — `IF NOT public.tem_assinatura_ativa() THEN RAISE EXCEPTION` no topo de cada RPC de conteúdo, e/ou incorporar a checagem na RPC/view de leitura criada no #1. (Decisão de produto: confirmar o que o tier grátis pode ver — mas a regra precisa ser server-side.)

---

## 🟡 4. MÉDIA — `mp-vincular-assinatura`: vincular assinatura não reivindicada (IDOR)

> **STATUS: ✅ APLICADO EM PROD** (2026-06-24, edge function `mp-vincular-assinatura` v9). Agora exige `sub.payer_email == user.email` (normalizado) antes do upsert; rejeita com 403 se divergir ou faltar. A trava "já vinculada a outra conta" permanece como segunda camada.

A única trava de posse cobre assinatura **já vinculada**:
```ts
if (existente && existente.user_id !== user.id)
  return reply({ error: 'assinatura já vinculada a outra conta' }, 409);
```
Se `existente` é nulo (ainda não vinculada), faz upsert para o caller **sem checar `sub.payer_email === user.email`**. Quem obtiver um `preapproval_id` válido de um plano ainda não vinculado (ele vaza no `back_url` do browser e é logado por `mp-retorno`) liga a assinatura à própria conta.

**Correção:** exigir `sub.payer_email == user.email` (ou resolver o dono pelo mesmo `external_reference`/email do webhook) antes do upsert.

---

## 🔵 Achados BAIXOS

- **5. `get_ranking_global` vaza `user_id`** de quem tem `competir_publico=false` (nome vira "Anônimo", mas o UUID real ainda é emitido → re-identificação cruzando com autoria de comentários). Anular `user_id` quando não público.
- **6. `admin-impersonate`** emite sessão padrão (JWT ~1h + refresh token), não escopada nem curta no servidor; longevidade depende só de o frontend não persistir o refresh token. Autorização/anti-escalada estão corretas e auditadas — é gap de defesa em profundidade.
- **7. `mp-webhook`** valida assinatura mas não checa frescor do `ts` → replay (impacto limitado: re-busca o estado na API do MP).
- **8. Proteção de senha vazada (HaveIBeenPwned) desligada** no Auth. Ligar em Dashboard → Auth → Password security. (Supabase advisor: `auth_leaked_password_protection`.)

## ⚪ Higiene

- **EXECUTE para `anon`/`authenticated` em RPCs admin** (`admin_criar_faq`, `admin_listar_tickets`, `admin_detalhar_ticket`, `admin_toggle_faq`, `admin_deletar_faq`, etc.) e em `snapshot_prova_em_tentativas`/`toggle_favorito_tentativa`. **Não exploráveis** (todas checam `is_admin()`/`auth.uid()` internamente; `snapshot_*` é função de trigger, não chamável por RPC), mas revogar o grant de `anon` é boa higiene.
- **`criar_ticket`** (SECURITY DEFINER) sem checagem `auth.uid() IS NULL` — hoje salvo pelo NOT NULL; adicionar guarda explícita (como em `reabrir_ticket`).
- **CORS** cai em `Access-Control-Allow-Origin: *` se `APP_ALLOWED_ORIGINS` não estiver setado. Baixo risco (auth é por header Bearer, não cookie), mas definir a env em produção.
- **`tabela palavra_proibida`** com RLS ligada e sem policy (INFO): correto — só acessada por função `SECURITY DEFINER`.

---

## ✅ O que está correto (não mexer)

- RLS habilitada em todas as tabelas; políticas de propriedade (`auth.uid() = user_id`) consistentes nas tabelas de usuário.
- Todas as RPCs `admin_*` checam `is_admin()` internamente; `alterar_papel_usuario` exige `super_admin`; triggers `prevent_papel_change` e `prevent_ban_fields_change` (BEFORE UPDATE em `profiles`) **confirmados ativos** — aluno não promove a si mesmo nem se desbane editando o próprio profile.
- Banimento é `RESTRICTIVE` (AND) → de fato bloqueia.
- RPCs com ID de usuário (`get_revisao_tentativa`, `finalizar_tentativa`, `get_simulado_impressao`, tickets, comentários) validam posse contra `auth.uid()` → **sem IDOR** nesse conjunto.
- `mp-webhook`: HMAC verificado em tempo constante, rejeita antes de processar, re-busca estado na API do MP (corpo forjado não concede assinatura).
- `admin-impersonate`: autorização server-side via `profiles.papel`, log de auditoria antes de emitir token, bloqueia auto-impersonação e escalada para admin/super_admin.
- Segredos só em `Deno.env`; nenhum `service_role` no frontend; só `.env.local.example` versionado.
- `search_path` setado em todas as funções; nenhum SQL dinâmico (sem superfície de injeção).
- Bucket `suporte-anexos` privado com RLS por pasta de dono; demais buckets públicos contêm só imagens servíveis.

---

## ⚠️ Processo — hardening de segurança é revertido por `db pull`/`db diff`

As falhas #1 e #2 **já estavam corrigidas** (migrations de 2026-06-09) e foram
**silenciosamente revertidas** pela migration autogerada `20260612174550_sistema_suporte`.
O fluxo documentado em `supabase/CLAUDE.md` gera migrations via
`npx supabase db pull` — e o `db diff` por baixo **re-emite os GRANTs e POLICIES
default de todo o schema**. Quando isso roda a partir de um baseline que não tem
o hardening aplicado, ele produz `grant select on alternativa to authenticated`,
`grant insert/update/delete on tentativa ...` e recria as policies de escrita —
desfazendo o recorte de colunas e a revogação de escrita.

**Isto vai acontecer de novo** no próximo `db pull` que tocar nessas tabelas,
a menos que se adote uma salvaguarda. Recomendações (qualquer uma já ajuda):

1. **Revisar o diff de TODA migration autogerada** antes de commitar, procurando
   `grant ... on (alternativa|questao|tentativa|tentativa_resposta)` e policies
   `tentativa_*_own` — e remover essas linhas do arquivo gerado.
2. **Teste de CI/regressão** que falha se o hardening for desfeito. Exemplo
   (rodável via `supabase db query` / psql, ou um teste pgTAP):
   ```sql
   -- deve retornar 0 linhas; qualquer linha = regressão de segurança
   select 'alternativa.correta exposta' as falha
   from information_schema.role_column_grants
   where table_schema='public' and table_name='alternativa'
     and grantee in ('authenticated','anon') and column_name='correta'
   union all
   select 'escrita direta em tentativa'
   from information_schema.role_table_grants
   where table_schema='public' and table_name in ('tentativa','tentativa_resposta')
     and grantee in ('authenticated','anon') and privilege_type in ('INSERT','UPDATE','DELETE')
   union all
   -- #3: leitura de questao/alternativa tem que continuar exigindo assinatura
   select 'questao/alternativa legivel sem assinatura ('||tablename||')'
   from pg_policies
   where schemaname='public'
     and policyname in ('questao_select_authenticated','alternativa_select_authenticated')
     and qual not like '%tem_assinatura_ativa%';
   ```
3. **Manter uma migration de hardening sempre por último** (re-aplicável/idempotente)
   e re-gerá-la após qualquer `db pull` que mexa nessas tabelas.

## Ordem de correção sugerida

1. **#1 e #2 juntos** (mesma causa-raiz, mesma migration): tirar leitura de gabarito e escrita de pontuação das tabelas-base; canalizar por RPC/view. *Prioridade máxima — afeta integridade de toda prova/ranking.*
2. **#3**: checagem de assinatura server-side nas RPCs de conteúdo.
3. **#4**: validar `payer_email` em `mp-vincular-assinatura`.
4. **#5–#8 + higiene**: em sequência.

---

## Adendo 2026-07-07 — Questões abertas (novas colunas secretas)

As migrations `20260707120000`+ estendem o modelo de gabarito secreto para
questões discursivas:

* **Novas colunas SECRETAS em `questao`**: `resposta_modelo`, `pontos_chave`,
  `criterios_correcao` — nascem sem SELECT grant para `authenticated`
  (comportamento do grant por coluna da `20260624125610`) e só saem por RPC
  SECURITY DEFINER, mascaradas como NULL em `modo='simulado'`
  (`iniciar/retomar_tentativa`, `gerar_simulado_personalizado`) e liberadas em
  estudo/revisão/impressão-com-gabarito pós-finalização.
* **Nova tabela `resposta_correcao`**: RLS de SELECT para o dono da tentativa;
  INSERT/UPDATE/DELETE sem grant para clientes (escrita exclusiva de
  service-role/SECURITY DEFINER).
* **Colunas novas em `tentativa_resposta`** (`enviada_em`, `pontos`) e
  `tentativa` (`pontos`, `total_pontuaveis`): legíveis pelo dono (grant de
  tabela + RLS), escrita só via RPC.
* ⚠️ **O aviso anti-regressão de grants continua valendo**: um `db pull`/`db diff`
  autogerado dessas tabelas re-emitiria `GRANT SELECT` de tabela e **reexporia
  `resposta_modelo` (o gabarito das discursivas)**. Verificação rápida:
  `set role authenticated; select resposta_modelo from questao limit 1;`
  → deve dar `permission denied`.
