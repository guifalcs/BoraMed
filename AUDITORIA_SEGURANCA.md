# Auditoria de Segurança — BoraMed (pré-produção)

> Data: 2026-06-09 · Escopo: Supabase (RLS, Auth, RPCs, Storage, Edge Functions), frontend Angular, deploy Vercel/SSR.
> Método: verificação contra o **banco de produção ao vivo** (`project_ref gakvktwtdunljojghpff`) — grants, policies e código real das RPCs extraídos do projeto linkado — além de revisão de migrations, frontend, edge function e config. API REST probada como `anon` (bem trancada).

## Veredito

**Não liberar para dados reais ainda.** Base de segurança boa (RLS em todas as tabelas, escalonamento de privilégio bloqueado, escrita de admin protegida por `is_admin()`, score/XP server-side), mas há **2 falhas CRÍTICAS exploráveis hoje** por qualquer aluno autenticado via `curl`, e itens MÉDIOS a resolver antes do go-live.

Ordem de execução sugerida:
1. Crítico 2 (só banco, fecha farm de XP imediatamente)
2. Crítico 1 (banco + ajustes no frontend)
3. Médios
4. Baixos / higiene

---

## 🔴 CRÍTICO 1 — Gabarito vaza para qualquer aluno

**Onde:** `alternativa` e `questao` têm policy de SELECT `USING (true)` para `authenticated`, e `authenticated` tem `SELECT` nas tabelas. Colunas de resposta legíveis: `alternativa.correta`, `questao.resposta_correta_texto`, `questao.respostas_aceitas`, `questao.explicacao`, `questao.explicacao_alternativas`.

As RPCs (`iniciar_tentativa`, `gerar_simulado_personalizado`) mascaram `correta = NULL` no modo simulado — a intenção de esconder existe — mas é inútil: o aluno lê direto da tabela. O frontend também lê `alternativa(*)` direto (`tentativa.service.ts:143,232`, `prova-visualizar.resolver.ts:79`). Também explorável via GraphQL (`graphql_public` exposto, mesmo grant).

**Ataque (aluno logado):**
```
GET /rest/v1/alternativa?select=questao_id,letra,correta      → gabarito inteiro
GET /rest/v1/questao?select=id,enunciado,resposta_correta_texto,respostas_aceitas,explicacao
GET /rest/v1/desafio_diario?select=data,questao_id            → mapeia o desafio do dia (50 XP)
```

**Correção (banco):**
```sql
REVOKE SELECT (correta) ON public.alternativa FROM authenticated, anon;
REVOKE SELECT (resposta_correta_texto, respostas_aceitas, explicacao, explicacao_alternativas)
  ON public.questao FROM authenticated, anon;
```
**Correção (frontend):** trocar `select('*')`/`alternativa(*)` da execução/visualização por colunas explícitas (sem `correta`); obter gabarito de revisão só via RPC (`finalizar_tentativa` já retorna).

**Atenção:** admins também são `authenticated` → o editor de questões (lê `alternativa(*)` direto) precisará carregar a resposta via RPC admin (`admin_get_questao` com `is_admin()`). Alternativa mais simples: revogar `SELECT` inteiro de `alternativa`/`questao`/`prova_questao` do `authenticated` e servir tudo pelas RPCs definer.

- [ ] Migration revogando colunas de resposta (ou SELECT inteiro)
- [ ] Ajustar selects do frontend (execução/visualização)
- [ ] RPC admin para o editor de questões ler a resposta
- [ ] Testar simulado/estudo/visualizar/desafio/admin no banco local

---

## 🔴 CRÍTICO 2 — Aluno fabrica nota e farma XP/ranking sem responder

**Onde:** `authenticated` tem `INSERT`/`UPDATE`/`DELETE` direto em `tentativa` e `tentativa_resposta`; a policy `tentativa_update_own` só checa `auth.uid() = user_id`, **sem restrição de coluna** (ausência de `WITH CHECK` reusa o `USING`, que só protege `user_id`). O aluno reescreve `acertos`, `nota`, `status` da própria tentativa.

**Ataque:**
```
PATCH /rest/v1/tentativa?id=eq.<minha>
  {"status":"finalizada","acertos":50,"nota":100,"total_respondidas":50}
POST  /rest/v1/rpc/conceder_xp_tentativa   {"p_tentativa_id":"<minha>"}
```
`conceder_xp_tentativa` lê `acertos*10` da linha forjada → até 500 XP/dia "legítimos", sobe no ranking e desbloqueia conquistas de precisão **sem responder nada**. `finalizar_tentativa` (server-side) é irrelevante: o atacante escreve direto e não chama o RPC (ou chama com `status='finalizada'`, que pula o recálculo). `get_historico_kpis` também mostra notas falsas.

**Correção (só banco — não quebra o app):** todas as escritas dessas tabelas já passam por RPCs `SECURITY DEFINER` (`iniciar_tentativa`, `salvar_resposta_tentativa`, `pausar/retomar/finalizar`); o frontend só faz SELECT direto nelas.
```sql
REVOKE INSERT, UPDATE, DELETE ON public.tentativa, public.tentativa_resposta FROM authenticated;
DROP POLICY tentativa_insert_own            ON public.tentativa;
DROP POLICY tentativa_update_own            ON public.tentativa;
DROP POLICY tentativa_resposta_insert_own   ON public.tentativa_resposta;
DROP POLICY tentativa_resposta_update_own   ON public.tentativa_resposta;
-- manter apenas as policies de SELECT (já scoped por dono/is_admin)
```

- [x] Migration revogando escrita direta + drop das policies de write — `20260609120000_seguranca_bloquear_escrita_tentativa.sql` (aplicada). Escritas seguem só via RPCs SECURITY DEFINER.
- [ ] Smoke test: iniciar → responder → pausar → retomar → finalizar → XP no banco local

---

## 🟠 MÉDIO (antes do go-live)

- [x] **Ranking desanonimiza perfil privado** — `get_ranking_global/_semana` agora mascaram `user_id` (NULL) quando o perfil é privado e não é `is_me`. Migration `20260609120100_seguranca_ranking_mascarar_user_id.sql` (aplicada) + frontend ajustado (`RankingItem.user_id: string | null`, parser tolera NULL, trackBy por `posicao`).
- [ ] **Buckets de Storage públicos** — `questao-imagens`, `questoes-lab` (sem policies), `avatars`, `avisos` estão `public=true`. Imagens de lâminas/peças (conteúdo de prova) acessíveis por URL sem login, contornando policies. → Tornar `questao-imagens` e `questoes-lab` privados e servir por signed URL.
- [x] **Open redirect no `/auth/callback`** — corrigido em `server.ts` e `auth-callback.component.ts` com `next.startsWith('/') && !next.startsWith('//')`.
- [~] **Headers de segurança** no `vercel.json` — adicionados X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy e HSTS. **CSP ainda pendente** (deferida para a fase de teste junto com Crítico 1/Storage: CSP mal calibrada pode quebrar o app em produção e precisa de smoke test em preview deploy). Bloco de referência:
```json
"headers": [{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
    { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://*.ingest.us.sentry.io https://*.vercel-insights.com; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; frame-ancestors 'none'" }
  ]
}]
```
(Ajustar `script-src` conforme hydration/analytics antes de aplicar.)
- [~] **Senha fraca** — `config.toml` atualizado para `minimum_password_length=8` e `password_requirements="letters_digits"`. **Pendente no dashboard de produção** (config.toml é dev/local): aplicar mínimo 8 + letras&dígitos e **habilitar HIBP** (leaked password protection) — advisor ainda acusa `auth_leaked_password_protection`.
- [x] **Refresh token do admin em `sessionStorage`** — não persistimos mais tokens (só o nome do admin para o banner). A reversão imediata em caso de mismatch usa a sessão em memória; ao sair da impersonação o admin **re-autentica** (`voltarParaAdmin` → signOut → /login). ⚠️ Mudança de UX: admin precisa logar de novo após impersonar.
- [ ] **Signup aberto** (`enable_signup=true`) amplia impacto enquanto o público é fechado (alunos). Considerar allowlist/convite.

---

## 🟡 BAIXO / endurecimento

- [x] Grants legados `GRANT ALL` — revogados `TRUNCATE/TRIGGER/REFERENCES` de `anon`/`authenticated` e DML do `anon` em `profiles`/`notificacoes`. Migration `20260609120300_seguranca_revogar_grants_legados.sql` (aplicada).
- [x] 6 funções definer com `SET search_path = public` sem `pg_temp` — corrigidas via `ALTER FUNCTION ... SET search_path TO 'public', 'pg_temp'`. Migration `20260609120200_seguranca_search_path_pg_temp.sql` (aplicada).
- [x] Log de impersonação — a edge function agora **grava a auditoria com `await` ANTES** de gerar/retornar o `token_hash` e **aborta** (500) se o INSERT falhar. Leitura do log restringida a `super_admin` (migration `20260609120400_seguranca_restringir_log_impersonacao.sql`, aplicada). ⚠️ Edge function precisa de **deploy** (`supabase functions deploy admin-impersonate`).
- [~] CORS `*` na edge function `admin-impersonate` — agora travável por env `APP_ALLOWED_ORIGINS` (lista separada por vírgula); sem a env mantém `*` para não quebrar. **Pendente:** definir o secret com a origem do app + deploy.
- [x] **Não-segurança:** `get_streak_estudo_v2` — verificado no banco de produção: a função **já usa** `v_freeze_usado_hoje` consistentemente (sem o bug). Nenhuma ação necessária. (`reset_xp_semanal_cron.sql` segue sem cron — reset lógico por semana ISO, sem impacto de segurança.)

---

## ✅ Verificado OK (no banco de produção)

- RLS habilitado em 100% das tabelas do `public`; nenhuma view (sem risco de `security_invoker`).
- **Aluno não vira admin** — sem policy de UPDATE liberando `papel`; trigger `prevent_papel_change` só deixa `super_admin` alterar papéis e torna `super_admin` irrevogável/único; `alterar_papel_usuario` exige `is_super_admin()`. PATCH direto: bloqueado.
- **Tabelas de conteúdo do admin** (`questao`, `alternativa`, `prova`, `tema`, `disciplina`, `questao_tema`, `prova_questao`, `avisos`): apesar do GRANT de escrita, **todas** as policies de INSERT/UPDATE/DELETE checam `is_admin()`. Aluno não escreve.
- **XP não-forjável por escrita direta** — `gamificacao_evento`/`user_gamificacao_stats`/`user_conquista` só têm policy de SELECT; RLS nega escrita direta. (O furo do Crítico 2 é por forjar a `tentativa`.)
- **RPCs admin** validam `is_admin()`/`is_super_admin()` e revogam EXECUTE do `anon`. As 20 funções `SECURITY DEFINER` que o advisor lista como "callable por authenticated" são esperadas: cada uma valida autorização internamente ou usa `auth.uid()`. Não são vulnerabilidades.
- **Edge function de impersonação robusta** — valida JWT do chamador, exige papel, bloqueia auto-impersonação, `super_admin` irrepresentável, admin só impersona aluno; service_role só no servidor; `token_hash` não logado/persistido; sessão revertida em divergência.
- **Sem segredos no frontend** além da anon key e DSN do Sentry (públicos). Sem `bypassSecurityTrust*`/`eval`/`innerHTML` perigoso; `ngx-markdown` com sanitização ativa; ranking/avisos via interpolação escapada.
- **`anon` trancado** — confirmado por `curl` na produção: SELECT negado em `tentativa`/`questao`/`alternativa`/`prova`/`admin_impersonation_log`; `profiles` retorna vazio.
- Notificações/avisos isolados por dono; uploads validam tipo/tamanho; storage de avatar/aviso/questão escopa escrita por dono/`is_admin()`.
