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

- [ ] Migration revogando escrita direta + drop das policies de write
- [ ] Smoke test: iniciar → responder → pausar → retomar → finalizar → XP no banco local

---

## 🟠 MÉDIO (antes do go-live)

- [ ] **Ranking desanonimiza perfil privado** — `get_ranking_global/_semana` põe `nome_display='Anônimo'` quando `competir_publico=false`, mas devolve `user_id` real e XP exato (dá pra reidentificar e enumerar `user_id`s). → Omitir/`NULL` no `user_id` quando não for `is_me` e o perfil for privado.
- [ ] **Buckets de Storage públicos** — `questao-imagens`, `questoes-lab` (sem policies), `avatars`, `avisos` estão `public=true`. Imagens de lâminas/peças (conteúdo de prova) acessíveis por URL sem login, contornando policies. → Tornar `questao-imagens` e `questoes-lab` privados e servir por signed URL.
- [ ] **Open redirect no `/auth/callback`** — `server.ts:76` aceita `next=//evil.com` (`startsWith('/')` deixa passar protocol-relative). → Validar `next.startsWith('/') && !next.startsWith('//')`. Mesmo fix em `auth-callback.component.ts:31`.
- [ ] **Sem headers de segurança** no `vercel.json` (CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy). → Adicionar bloco `headers`:
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
- [ ] **Senha fraca** — `minimum_password_length=6`, `password_requirements=""` e *leaked password protection* (HIBP) desligada em produção (confirmado pelo advisor). → Dashboard: mínimo 8, exigir letras+dígitos, habilitar HIBP.
- [ ] **Refresh token do admin em `sessionStorage`** durante impersonação (`auth.service.ts:140`) — XSS exfiltra credencial admin de longa duração. → Não persistir refresh token; restaurar sessão server-side ou re-autenticar ao sair.
- [ ] **Signup aberto** (`enable_signup=true`) amplia impacto enquanto o público é fechado (alunos). Considerar allowlist/convite.

---

## 🟡 BAIXO / endurecimento

- [ ] Grants legados `GRANT ALL` (`TRUNCATE/TRIGGER/REFERENCES`, e DML do `anon` em `profiles`/`notificacoes`) — não explorável via PostgREST, mas viola menor-privilégio. Revogar.
- [ ] 6 funções definer com `SET search_path = public` sem `pg_temp` (`is_admin`, `is_super_admin`, `admin_get_stats`, `prevent_papel_change`, `admin_enviar_notificacao`, `get_historico_kpis`). → usar `public, pg_temp`.
- [ ] Log de impersonação é *best-effort* (`.then()` sem await) — se o INSERT falhar, impersonação ocorre **sem auditoria**. Gravar antes de retornar o `token_hash`. Considerar restringir leitura do log a `super_admin` (hoje qualquer `admin` lê tudo).
- [ ] CORS `*` na edge function `admin-impersonate` — baixo risco (exige JWT admin); travar na origem do app.
- [ ] **Não-segurança (vai quebrar):** `get_streak_estudo_v2` referencia variável inexistente `v_freeze_uso_hoje` (declarou `v_freeze_usado_hoje`) → erro em runtime. O arquivo `reset_xp_semanal_cron.sql` **não cria cron** (nome enganoso; reset é lógico por semana ISO).

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
