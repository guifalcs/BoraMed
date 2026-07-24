# Auditoria de Segurança e Performance — BoraMed

**Data:** 2026-07-24
**Escopo:** App completo com foco em Supabase (Postgres/RLS, Auth, Storage, Edge
Functions), frontend Angular/SSR e fluxo financeiro (Mercado Pago).
**Método:** revisão estática das 155 migrations, das 13 edge functions e do
frontend + execução ao vivo dos *advisors* de segurança e performance contra o
projeto de produção (`gakvktwtdunljojghpff`).

> Este documento é **diagnóstico**. Nada foi alterado no banco, no código de
> produção ou na infraestrutura. As correções serão feitas depois, item a item.

---

## Sumário executivo

A postura de segurança do banco é **madura e acima da média**. Os pontos que mais
preocupam o negócio (gabarito, dados de usuário, financeiro) têm defesa real no
servidor, não só no frontend:

- **RLS habilitada em 100% das tabelas** (o advisor não achou nenhuma tabela
  exposta sem RLS).
- **Gabarito é segredo por padrão:** `alternativa.correta`,
  `questao.explicacao`, `resposta_correta_texto`, `respostas_aceitas` e
  `explicacao_alternativas` foram **revogados** de `authenticated`/`anon` via
  *column-level grants*. A leitura só acontece por RPCs `SECURITY DEFINER` que
  mascaram a resposta no modo simulado e só liberam a revisão depois de o aluno
  finalizar a tentativa.
- **Paywall em duas camadas** (RLS + gate dentro das RPCs de conteúdo), então
  não dá para dumpar o acervo via PostgREST nem chamando a RPC direto sem
  assinatura.
- **Webhook do Mercado Pago valida HMAC-SHA256** em tempo constante; **preços
  vêm sempre do banco**, nunca do cliente; cupom é validado server-side.
- **Impersonação de admin é auditada antes de emitir o token**, com `super_admin`
  irrepresentável.

O ponto **crítico** não está no runtime do app — está no **repositório git**: o
acervo inteiro de questões **com o gabarito** está versionado. Esse é o vazamento
de maior impacto e o mais fácil de um colaborador/vazamento de repo explorar.

### Placar

| Severidade | Qtd | Itens |
|---|---|---|
| 🔴 Crítico | 1 | C1 |
| 🟠 Alto | 2 | A1, A2 |
| 🟡 Médio | 4 | M1, M2, M3, M4 |
| 🔵 Baixo / Perf | 5 | B1–B5 |

Advisors de produção: **segurança** → 66 WARN + 1 INFO (detalhado abaixo, a
maioria é uma classe única esperada por design); **performance** → 24 INFO
(nenhum WARN/ERROR — o banco está saudável).

---

## 🔴 Crítico

### C1 — Acervo completo + gabarito versionado no git

**O quê:** `supabase/backups/backup-questoes-2026-06-24.json` está **rastreado no
git** (`git ls-files` confirma), apesar de o `.gitignore` ignorar
`supabase/backups/**`. O `.gitignore` **não remove o que já foi commitado** — o
arquivo entrou antes da regra e continua no histórico.

**Conteúdo exposto** (verificado):
- **775 questões** com `enunciado`, `enunciado_apoio`, `resposta_correta_texto`,
  `respostas_aceitas`, **`explicacao`** (todas as 775 preenchidas) e
  `explicacao_alternativas`.
- **3.100 alternativas** com a flag **`correta`** (775 marcadas como corretas).

**Agravante:** as migrations de seed `20260512100416_seed_soi_2025_q1_q3.sql` …
`20260512100638_*` também inserem **questões reais com gabarito** (`explicacao`,
`correta = true`) direto no SQL versionado.

**Por que é crítico:** qualquer pessoa com acesso de leitura ao repositório
(colaborador atual ou futuro, runner de CI, um fork, ou o repo indo a público por
engano) obtém o acervo inteiro **com as respostas**. É exatamente o cenário
"trágico de vazar" — não depende de furar RLS nem de burlar o paywall; basta
`git clone`.

**Correção proposta (a combinar):**
1. `git rm --cached supabase/backups/backup-questoes-2026-06-24.json` e commitar a
   remoção. Guardar o backup fora do git (Storage privado, bucket de backup, ou
   segredo de infra).
2. Se o repositório **já foi exposto** a alguém que não deveria ter o acervo,
   remoção do *working tree* não basta: é preciso **reescrever o histórico**
   (`git filter-repo`/BFG) e considerar o conteúdo comprometido.
3. Definir política para os **seeds**: conteúdo real de prova não deveria viver em
   migrations versionadas. Opções: mover as questões reais para um seed **local
   gitignored** aplicado só nos ambientes que precisam, ou manter no git apenas
   um conjunto sintético de demonstração e carregar o acervo real via import
   fora do versionamento.

---

## 🟠 Alto

### A1 — Bucket `questao-imagens` é público (paywall não cobre as imagens)

**O quê:** o bucket `questao-imagens` foi criado com `public = true`
(`20260519004145_prova_formatos_extensiveis.sql`). Em bucket público, o endpoint
`/storage/v1/object/public/questao-imagens/<path>` serve o arquivo **sem
autenticação e ignorando as RLS policies** de `storage.objects` (essas policies
só valem para o endpoint autenticado). As URLs têm o formato:

```
.../object/public/questao-imagens/questoes/<uuid>.webp
```

**Impacto:** as imagens de questão — em especial as de **laboratório**, onde a
imagem **é** a questão — são conteúdo pago/segredo, mas ficam acessíveis a quem
tiver a URL, sem assinatura. O UUID não é adivinhável por força bruta, mas as
URLs são embutidas no conteúdo servido, ficam em caches/compartilhamentos e —
pior — **estão em texto plano no backup versionado (C1)**. Uma vez conhecida, a
URL é permanente e não exige login. O paywall server-side (que é sólido para o
texto) simplesmente não alcança o objeto de storage.

Mesma observação, com menor sensibilidade, para `flashcard-imagens` (público;
flashcards são conteúdo do tier Avançado). `avisos` público é aceitável — são
banners destinados a todos os usuários.

**Correção proposta:** tornar `questao-imagens` privado e servir as imagens por
**signed URLs de TTL curto** emitidas dentro das RPCs de conteúdo (que já
validam assinatura/tier). Alternativamente, se a decisão for manter público,
documentar explicitamente que a imagem da questão não é considerada segredo.

### A2 — Regressão recorrente de grants via `supabase db pull` (sem teste de CI)

**O quê:** a própria migration `20260624125610_seguranca_revogar_gabarito_e_escrita_tentativa.sql`
documenta que um `supabase db pull`/`db diff` **já reexpôs o gabarito duas vezes**
ao regenerar os GRANTs e policies default do schema (a migration autogerada
`20260612174550_sistema_suporte.sql` reconcedeu `SELECT` em
`alternativa`/`questao` a `authenticated` e reabriu escrita em
`tentativa`/`tentativa_resposta`).

**Impacto:** o hardening de gabarito (C1 do runtime) e o bloqueio de adulteração
de nota dependem de *column grants* e revogações que **um único `db pull` desfaz
silenciosamente**. Hoje isso é evitado só por disciplina manual e comentários
`⚠️` nas migrations. Não há rede de proteção automática.

**Correção proposta:** adicionar um **teste de CI** (pgTAP ou script SQL) que
falha o build se, no schema resultante:
- `authenticated` tiver `SELECT` na coluna `alternativa.correta` ou nas colunas
  de gabarito de `questao`;
- `authenticated` tiver `INSERT/UPDATE/DELETE` em `tentativa` ou
  `tentativa_resposta`;
- as policies de `questao`/`alternativa` não exigirem `tem_assinatura_ativa()`.

Isso transforma a regressão de "descobri em produção" para "quebrou o PR".

---

## 🟡 Médio

### M1 — RPCs `admin_*` sem checagem de papel interna

Três funções concedidas a `authenticated` não validam `is_admin()` no corpo:

- **`admin_buscar_questao_ids_por_texto(text)`** — devolve os `id`s de questão
  cujo enunciado/alternativa casam com um termo. Retorna só UUIDs (não o
  conteúdo), mas permite a **qualquer usuário autenticado** (inclusive
  não-assinante) usar a função como oráculo de "existe questão contendo X".
- **`admin_listar_avisos()`** — retorna avisos **inativos/rascunho** para
  qualquer autenticado.
- **`admin_listar_faq()`** — baixo impacto (FAQ já é legível por autenticados).

**Correção proposta:** adicionar `IF NOT public.is_admin() THEN RAISE
permission_denied` no início das três (ou, no caso da busca, mantê-la como está
mas renomear para deixar claro que não é privilégio de admin).

### M2 — CORS com fallback `*`

`_shared/cors.ts` e `admin-impersonate/index.ts` usam
`Access-Control-Allow-Origin: *` quando `APP_ALLOWED_ORIGINS` não está
configurada. As functions exigem JWT, então o risco direto é baixo, mas o ideal
é **garantir que `APP_ALLOWED_ORIGINS` esteja setada em produção** e travar o
default (ex.: rejeitar origem desconhecida em vez de cair para `*`).

**Ação:** confirmar o valor do secret `APP_ALLOWED_ORIGINS` no projeto de
produção e, se estiver vazio, defini-lo com os domínios do app.

### M3 — Proteção contra senhas vazadas desligada (Auth)

Advisor de segurança: `auth_leaked_password_protection` está **desabilitado**. O
Supabase pode bloquear senhas presentes em vazamentos conhecidos
(HaveIBeenPwned). Como a auth é e-mail/senha, isso protege diretamente as contas
dos usuários. **Ação:** habilitar em Auth → Password Protection. Ganho fácil.

### M4 — 65 funções `SECURITY DEFINER` executáveis por `authenticated`

Advisor `authenticated_security_definer_function_executable` (65 ocorrências).
Isso é, em grande parte, **por design** — toda a arquitetura de conteúdo/gabarito
depende de RPCs DEFINER concedidas a `authenticated`. Auditei as 30 funções
`admin_*` e todas checam `is_admin()`/`is_super_admin()` internamente, **exceto
as três de M1**. O restante (iniciar/finalizar tentativa, rankings, etc.) valida
`auth.uid()` e/ou assinatura.

**Ação:** não é um bug em si, mas vale manter a lista sob revisão: toda nova RPC
DEFINER concedida a `authenticated` **precisa** validar identidade/assinatura no
corpo. Bom candidato a item de checklist de PR (junto com A2).

---

## 🔵 Baixo / Performance

O banco de produção está **saudável**: os advisors de performance retornaram
apenas **INFO**, nenhum índice crítico faltando.

- **B1 — FK sem índice:** `cupom.plano_id` (`cupom_plano_id_fkey`) não tem índice
  de cobertura. Tabela minúscula, impacto atual desprezível; criar o índice é
  trivial.
- **B2 — 23 índices não usados:** ex.: `idx_questao_anulada`,
  `idx_questao_grupo_equivalencia`, `idx_prova_faculdade_id`, vários
  `*_criado_por`. São *write overhead* leve. Muitos estão "não usados" só porque
  a feature é nova/pouco acessada — **não remover em bloco**; reavaliar depois de
  mais volume de produção.
- **B3 — Sorteio de simulado escala com o histórico:**
  `gerar_simulado_personalizado`/`gerar_simulado_impressao` montam a CTE
  `questoes_entregues` varrendo **todas** as tentativas+respostas do usuário e
  fazem `ORDER BY (já_entregue), random()` sobre a tabela `questao`. A 775
  questões e base pequena, tudo bem. Conforme o acervo e o histórico crescem, o
  full-scan + anti-join fica caro. **Ação futura:** revisitar a estratégia de
  sorteio (ex.: amostragem por chave, materializar "já entregues") quando o
  acervo passar de alguns milhares.
- **B4 — `palavra_proibida` com RLS habilitada e sem policy** (advisor INFO
  `rls_enabled_no_policy`). Isso é **deny-all** e, aqui, é o comportamento
  **correto**: a blocklist só deve ser lida pela função DEFINER
  `contem_palavra_proibida`. Apenas confirmar que é intencional (é) e documentar.
- **B5 — Frontend/SSR:** Angular 18 standalone + signals + `OnPush`, SSR via
  função Vercel, `PostgREST max_rows = 1000`. Headers de segurança bons no
  `vercel.json` (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy). Sem CSP
  explícita — avaliar adicionar `Content-Security-Policy` como defesa extra
  contra XSS. Sem achados de vazamento no cliente: os `environment.*.ts` só
  contêm chaves **publishable/públicas** (Supabase anon publishable key e MP
  public key), corretas para o browser.

---

## O que **não** é problema (verificado)

- Nenhum segredo real versionado: `service_role`/tokens não aparecem no tree;
  `.env.local` das functions é gitignored e só há `.env.local.example` com
  placeholders. As chaves nos `environment.*.ts` são públicas por natureza.
- Preço de assinatura/pagamento **sempre do banco** (`plano.preco_centavos`);
  cupom recalculado por `validar_cupom` server-side; replays de intenção usam o
  valor snapshotado. Não há preço vindo do cliente.
- Escrita em `tentativa`/`tentativa_resposta` revogada de `authenticated`; toda
  mutação passa por RPC DEFINER que valida posse e estado → aluno não adultera a
  própria nota.
- Ranking mascara `user_id` de perfis privados (não dá para reidentificar/enumerar).
- `tem_assinatura_ativa(uid)` só deixa consultar a própria assinatura (ou admin).
- Padrão *initplan* de RLS (`(select auth.uid())`, `(select is_admin())`) aplicado
  nas policies quentes (profiles, tentativa, assinatura, pagamento) → função de
  auth avaliada 1x por query, não por linha.
- Webhook MP: HMAC obrigatório, comparação em tempo constante, idempotência por
  `onConflict`, retries controlados; cron de reconciliação protegido por
  `x-cron-secret` (Vault).

---

## Plano de correção sugerido (ordem)

1. **C1** — tirar o backup do git + decidir política de seeds/histórico. *(maior
   impacto, urgente)*
2. **A1** — `questao-imagens` privado + signed URLs nas RPCs de conteúdo.
3. **A2** — teste de CI de grants/policies para travar regressão de gabarito.
4. **M3** — habilitar proteção de senha vazada (1 clique).
5. **M1** — `is_admin()` nas 3 RPCs.
6. **M2** — confirmar/definir `APP_ALLOWED_ORIGINS` em produção.
7. **B1** — índice em `cupom.plano_id`; **B5** — avaliar CSP.
8. **B2/B3** — reavaliar índices não usados e estratégia de sorteio conforme o
   volume crescer.

---

## Referências de advisor

- Segurança: `authenticated_security_definer_function_executable` (65),
  `auth_leaked_password_protection` (1), `rls_enabled_no_policy` (1 — INFO,
  esperado).
- Performance: `unindexed_foreign_keys` (1 — `cupom`), `unused_index` (23).
- Documentação: https://supabase.com/docs/guides/database/database-linter
