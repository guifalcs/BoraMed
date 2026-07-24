# Auditoria de Segurança e Performance — BoraMed

**Data:** 2026-07-24
**Escopo:** App completo com foco em Supabase (Postgres/RLS, Auth, Storage, Edge
Functions), frontend Angular/SSR e fluxo financeiro (Mercado Pago).
**Método:** revisão estática das 155 migrations, das 13 edge functions e do
frontend + execução ao vivo dos *advisors* de segurança e performance contra o
projeto de produção (`gakvktwtdunljojghpff`).

> **Status:** diagnóstico + correções aplicadas no branch
> `claude/app-performance-security-audit-tb3sv7`. Nada foi aplicado
> diretamente em produção: as migrations precisam ser testadas num stack local
> (`supabase start` + `db reset`) e depois promovidas pelo fluxo normal.
>
> Ver **"Situação das correções"** ao final para o que foi feito, o que ficou
> pendente e por quê.

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
| 🟡 Médio | 3 | M2, M3, M4 |
| 🔵 Baixo / Perf | 6 | M1, B1–B5 |

> M1 nasceu como Médio e foi rebaixado para Baixo durante a execução — a RLS já
> continha o vazamento. Detalhe na própria seção.

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

**Parcialmente corrigido:**
- ✅ o arquivo saiu do rastreamento (`git rm --cached`) e o `.gitignore` já
  impede que volte; o arquivo continua no disco local;
- ✅ `supabase/backups/README.md` agora documenta a regra e o comando de
  conferência (`git ls-files supabase/backups/` deve listar só o README).

**Pendente — exige decisão sua (não fiz por ser destrutivo):**

1. **Reescrever o histórico.** O backup continua acessível em todos os commits
   anteriores: `git log --all -- supabase/backups/` ainda o encontra. Enquanto
   isso não for feito, quem tem (ou teve) acesso ao repo continua com o acervo.
   Exige `git filter-repo`/BFG + `push --force` e um novo clone por todos os
   envolvidos — por isso deixei para você decidir a janela.
2. **Considerar o conteúdo comprometido** se o repositório já foi exposto a
   alguém que não deveria ter o acervo.
3. **Seeds.** As migrations `20260512100416_*` … `20260512100638_*` inserem
   questões reais com `explicacao` e `correta`. Não removi: são migrations **já
   aplicadas**, e editá-las viola a regra do projeto (e quebraria o histórico de
   quem já aplicou). O caminho é definir a política daqui para frente — acervo
   real fora do versionamento, seed versionado apenas com conteúdo sintético.

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

**Corrigido** em `20260724130000_questao_imagens_bucket_privado.sql` + camada de
signed URL no frontend. Dois achados durante a execução:

1. **O bucket não tinha NENHUMA policy de SELECT** — só INSERT/UPDATE/DELETE de
   admin. A leitura funcionava exclusivamente por ser público. Virar
   `public = false` sem criar a policy antes teria quebrado todas as imagens,
   inclusive para admins. A migration cria a policy primeiro.
2. **4 questões do desafio diário têm imagem**, e o desafio é aberto a
   não-assinantes por decisão de produto. Por isso a policy exige apenas
   **estar autenticado**, sem gate de assinatura — fechar mais quebraria o
   desafio para o usuário grátis. O ganho principal (fim do acesso **anônimo** e
   permanente por URL) está garantido; um logado sem assinatura continua sem
   conseguir descobrir as URLs, porque quem as entrega são as RPCs gateadas.

Também fechado o bucket legado `questoes-lab` (1 objeto, nenhuma referência).

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

**Corrigido:** `supabase/tests/grants_gabarito_test.sql` + job `db-security` no
CI. Valida por introspecção de catálogo (sem seed, sem troca de role):

1. gabarito ilegível para `authenticated`/`anon`;
2. sem `INSERT/UPDATE/DELETE` em `tentativa`/`tentativa_resposta`;
3. policies de `questao`/`alternativa` referenciando `tem_assinatura_ativa()`;
4. `anon` sem `SELECT` no acervo;
5. RLS habilitada em toda tabela de `public`;
6. e falha também se uma **coluna protegida sumir** — senão o teste passaria
   vazio, sem verificar o que promete.

O teste foi exercitado contra as 6 regressões correspondentes (incluindo as duas
que já aconteceram de verdade) e **falhou em todas**, voltando a passar com o
estado restaurado. Também roda verde contra o schema atual de produção.

Isso transforma a regressão de "descobri em produção" para "quebrou o PR".

---

## 🟡 Médio

### M1 — RPCs `admin_*` sem checagem de papel interna

> ⚠️ **Severidade corrigida durante a execução: de Médio para BAIXO.** A
> redação original dizia que avisos inativos vazavam e que a busca servia de
> oráculo para qualquer autenticado. Isso está **errado**: as três funções são
> `SECURITY INVOKER`, então a RLS do chamador continua valendo. Verificado:
> `avisos` tem `avisos_select_authenticated USING (ativo = true)` (o inativo
> nunca sai para não-admin) e `questao`/`alternativa` exigem
> `tem_assinatura_ativa()` (não-assinante não casa nenhuma linha). O problema
> real é **falta de defesa em profundidade**, não vazamento.

Três funções concedidas a `authenticated` não validavam `is_admin()` no corpo:
`admin_buscar_questao_ids_por_texto(text)`, `admin_listar_avisos()` e
`admin_listar_faq()`.

O risco é de **fragilidade**: a proteção depende inteiramente de a função
permanecer INVOKER e de a policy não ser afrouxada. Como o padrão dominante no
projeto é `SECURITY DEFINER`, basta alguém converter uma delas — coisa natural de
se fazer numa função chamada `admin_*` — para o nome virar uma porta aberta de
verdade.

**Corrigido** em `20260724120000_hardening_rpcs_admin_e_indice_cupom.sql`: guard
explícito de `is_admin()` nas três, mantendo-as INVOKER (o guard é camada extra
sobre a RLS, não substituto).

### M2 — CORS com fallback `*`

`_shared/cors.ts` e `admin-impersonate/index.ts` usavam
`Access-Control-Allow-Origin: *` quando `APP_ALLOWED_ORIGINS` não está
configurada, e — pior — devolviam `ALLOWED_ORIGINS[0]` para uma origem **fora**
da lista, o que faz a resposta parecer liberada para quem não é o requisitante.

**Parcialmente corrigido:**
- a origem não permitida agora **não recebe** o header (o navegador bloqueia);
- lógica extraída para `resolveCorsHeaders` (função pura, com testes);
- a cópia divergente em `admin-impersonate` foi removida em favor do helper;
- quando a env está ausente, emite `console.warn` — o `*` foi **mantido**.

**Por que o `*` continua:** removê-lo derrubaria as functions de pagamento caso
o secret não esteja definido em produção, e não consigo ler secrets de edge
function daqui para confirmar. O risco do `*` aqui é baixo porque a autorização
vem do header `Authorization` (JWT), não de cookie — uma página de terceiro não
consegue preencher o token da vítima.

**Ação pendente (ops):** definir o secret e o fallback deixa de importar:
```bash
npx supabase secrets set APP_ALLOWED_ORIGINS=https://<dominio>,https://www.<dominio>
```

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

## Situação das correções

Tudo no branch `claude/app-performance-security-audit-tb3sv7`.

| Item | Situação | Onde |
|---|---|---|
| C1 — backup no git | ⚠️ Parcial — untracked; **histórico pendente** | `git rm --cached` + README |
| A1 — bucket público | ✅ Corrigido | `20260724130000_*.sql` + `ImagemProtegidaService` |
| A2 — regressão de grants | ✅ Corrigido | `supabase/tests/grants_gabarito_test.sql` + CI |
| M1 — RPCs `admin_*` | ✅ Corrigido (severidade → Baixo) | `20260724120000_*.sql` |
| M2 — CORS | ⚠️ Parcial — falta o secret em prod | `_shared/cors.ts` |
| M3 — senha vazada | ❌ Não feito — só no Dashboard | ver abaixo |
| M4 — DEFINER a `authenticated` | ℹ️ Por design; auditado | — |
| B1 — FK sem índice | ✅ Corrigido | `20260724120000_*.sql` |
| B2/B3/B5 | ⏸️ Deixado para depois (volume/decisão) | — |

### Validação executada

- **Migrations:** aplicadas contra um Postgres 16 descartável com stubs do
  schema. Aplicam limpo; os guards de `is_admin()` foram testados nos dois
  caminhos (admin passa, não-admin recebe `permission_denied` nas 3).
- **Teste de segurança:** passa no estado correto, **falha nas 6 regressões**
  simuladas, e passa contra o schema real de produção (introspecção read-only).
- **Frontend:** build de produção OK (18 rotas pré-renderizadas);
  **716/716 testes** passando (8 novos para a camada de signed URL).
- **Edge functions:** não executei os testes Deno — o sandbox bloqueia `jsr.io`,
  e os testes **pré-existentes falham igual** por isso. O CI os roda.

### O que falta você fazer

1. **Aplicar as migrations num stack local antes de promover.** Foram escritas à
   mão (sem Docker aqui), o que o `supabase/CLAUDE.md` marca como anti-pattern:
   ```bash
   npx supabase start && npx supabase db reset
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
     -v ON_ERROR_STOP=1 -f supabase/tests/grants_gabarito_test.sql
   ```
2. **Validar as imagens no app rodando** — é a mudança de maior superfície:
   simulado, revisão, desafio diário, `/imprimir` e os previews do admin.
3. **M3 — proteção de senha vazada:** Dashboard → Authentication → Passwords →
   *Leaked password protection*. Não há API/config.toml para isso; não dá para
   fazer por código.
4. **M2 — definir `APP_ALLOWED_ORIGINS`** nos secrets das edge functions.
5. **C1 — decidir sobre o histórico do git** (item mais importante que sobrou).

---

## Referências de advisor

- Segurança: `authenticated_security_definer_function_executable` (65),
  `auth_leaked_password_protection` (1), `rls_enabled_no_policy` (1 — INFO,
  esperado).
- Performance: `unindexed_foreign_keys` (1 — `cupom`), `unused_index` (23).
- Documentação: https://supabase.com/docs/guides/database/database-linter
