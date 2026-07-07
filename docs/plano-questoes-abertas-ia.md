# Plano — Questões Abertas (discursivas) com correção por IA

## Contexto

O BoraMed hoje só opera múltipla escolha / V-F. Objetivo: suportar questões abertas de ponta a ponta — cadastro no admin (manual, markdown e prompt-IA), conversão de fechadas em abertas, execução em estudo e simulado, correção por IA com nota 0–100 e feedback pedagógico, revisão/anotações, histórico e métricas. A IA é motor adicional, não dependência: sem IA o app continua funcionando (aluno vê a resposta padrão; a questão não conta na nota).

**Decisões do dono (já confirmadas):**
1. **Nota parcial 0–100** por questão aberta, contribuindo proporcionalmente para a nota da tentativa.
2. **Simulado**: aluno **envia** a resposta aberta definitivamente durante a prova (não edita depois); correção dispara em background no envio; a tela de resultado **bloqueia** até todas corrigidas (com progresso e timeout de fallback).
3. **IA indisponível/falha permanente**: questão **excluída do denominador** da nota; resposta padrão sempre visível.
4. **Provider**: provavelmente **OpenRouter** → adapter OpenAI-compatible, troca de modelo/provider só por config/env.

**Estado atual (exploração):**
- Schema já prevê parcialmente: `questao.formato` aceita `'resposta_aberta_curta'` (check constraint), colunas `resposta_correta_texto`/`respostas_aceitas[]` existem; `tentativa_resposta.resposta_texto` existe. **Nada disso é usado** — nenhum branch no frontend usa `questao.formato`.
- Correção só em `finalizar_tentativa` (RPC SECURITY DEFINER): `correta = (alternativa_id = alternativa correta)`, `nota = acertos/total*100`. KPIs (`get_historico_kpis`, `get_desempenho_por_tema`) usam somas binárias e `WHERE tr.alternativa_id IS NOT NULL` (excluiria respostas de texto).
- Gabarito protegido por revogação de colunas + RPCs (migration `20260624125610`); `iniciar_tentativa` mascara `alternativa.correta` quando `modo='simulado'`. Novas colunas secretas nascem ocultas (sem grant).
- Import IA hoje é copy-paste: app gera prompt → admin cola no ChatGPT/Claude → cola markdown de volta → parser client-side em `admin-importar.component.ts`. **Não existe integração LLM server-side no projeto.**
- Edge functions seguem padrão thin `index.ts` + `handler.ts` com DI (`_shared/deps.ts`) + testes Deno com fakes.
- Estudo e simulado compartilham `tentativa-exec.component.ts` + `tentativa.service.ts`, diferindo por `modo`.

## Decisões de design

| # | Decisão | Racional |
|---|---------|----------|
| D1 | Novas colunas em `questao`: `resposta_modelo text`, `pontos_chave jsonb` (array de strings), `criterios_correcao text` — **não reutilizar** `resposta_correta_texto`/`respostas_aceitas` (semântica de match exato; deprecar) | Colunas novas nascem ocultas no modelo de grants; semântica limpa |
| D2 | `pontos_chave` estruturado (checklist p/ IA); `criterios_correcao` texto livre absorvendo rubrica + estilo ("curta e objetiva", penalizações, etc.) | Flexível sem virar schema-mush — atende "diferentes estilos, sem engessar" |
| D3 | Nova tabela `resposta_correcao` (1:1 com `tentativa_resposta`): `status ('pendente','corrigindo','corrigida','erro','sem_ia')`, `pontos`, `feedback`, `pontos_atendidos/faltantes jsonb`, `erros jsonb`, `provider`, `modelo`, `tokens_*`, `num_tentativas`, `erro_detalhe`, timestamps. Escrita só service-role/SECURITY DEFINER; SELECT via RLS (dono da tentativa) | Auditável, permite re-correção, mantém `tentativa_resposta` enxuta |
| D4 | Pontos via **coalesce, sem backfill**: `tentativa_resposta.pontos smallint (0–100, NULL = não pontuável)`; agregações usam `coalesce(tr.pontos, (tr.correta::int)*100)`. `tentativa` ganha `pontos numeric` + `total_pontuaveis int`; leituras usam `coalesce(t.pontos, t.acertos*100)` / `coalesce(t.total_pontuaveis, t.total_questoes)` | Dados antigos corretos por construção, zero UPDATE em massa |
| D5 | `correta` fica NULL para abertas; `nota = round(soma_pontos / total_pontuaveis, 1)` com `total_pontuaveis = total_questoes − count(sem_ia)`; não respondida (MC ou aberta) = 0 no denominador (comportamento atual) | Só falha permanente de IA sai do denominador |
| D6 | Lock de envio: `tentativa_resposta.enviada_em timestamptz` (NULL = rascunho). Rascunho via RPC `salvar_resposta_texto`; envio definitivo via RPC `enviar_resposta_aberta` (trava + cria `resposta_correcao` pendente) | Rascunho sobrevive a F5; RPC separada evita ambiguidade com a `salvar_resposta_tentativa` endurecida |
| D7 | Edge function `corrigir-resposta-aberta`, **uma resposta por chamada**, fan-out no cliente; claim idempotente (`UPDATE ... SET status='corrigindo' WHERE status IN ('pendente','erro')`) | Wall-clock seguro, retry por questão, concorrência segura |
| D8 | Interface `GradingProvider` com impls `openai-compat` (OpenRouter/OpenAI/Gemini via chat completions + JSON) e `fake` (determinístico p/ testes/local); seleção por env `AI_GRADING_PROVIDER`, `AI_GRADING_BASE_URL`, `AI_GRADING_MODEL`, `AI_GRADING_API_KEY` | Troca = config; `fake` garante dev/e2e sem rede e materializa "não depender de IA" |
| D9 | `finalizar_tentativa` v2: se há correções não resolvidas, deixa `nota` NULL e retorna `correcoes_pendentes: n`. Nova RPC `consolidar_correcoes_tentativa(p_tentativa_id, p_forcar_sem_ia)` fecha a nota quando tudo resolvido (ou força restantes → `sem_ia`). Tentativa só-MC: consolidação inline, comportamento idêntico ao atual | Contrato limpo p/ tela de resultado bloqueante com poll/timeout |
| D10 | Mascaramento espelha `alternativa.correta`: `iniciar/retomar` retornam `resposta_modelo`/`pontos_chave`/`criterios` como NULL em `modo='simulado'`, valores reais em `estudo` | Mesmo threat model, nenhum mecanismo novo |
| D11 | Admin lê campos secretos via `admin_get_questao` estendida; escrita direta continua, com grant `INSERT/UPDATE` (não SELECT) nas 3 colunas novas | Segue padrão existente sem reabrir vazamento de gabarito |
| D12 | Converter fechada→aberta mantém as `alternativa` no banco (ignoradas pelo formato); pré-preenche `resposta_modelo` com texto da alternativa correta + `explicacao`; admin termina de adaptar | Conversão reversível e sem risco |
| D13 | Import markdown: **mesma sessão/fluxo**, `FORMATO: aberta` por bloco | Um prompt, um parser, lotes mistos |
| D14 | Desafio diário: abertas excluídas por ora (guard `formato='multipla_escolha'`) | Fluxo síncrono/gamificado não combina com latência/custo de IA; fácil adicionar depois |
| D15 | Resposta do aluno limitada (~3.000 chars) na RPC + textarea; texto do aluno delimitado no prompt com instrução anti-injection; `temperature 0`; pontos clampados 0–100 server-side | Custo + prompt-injection + consistência |
| D16 | Cap diário de correções por usuário (env `AI_GRADING_DAILY_LIMIT`, contado em `resposta_correcao` do dia) na edge function | Guarda de custo/abuso barata |
| D17 | Stats binárias de `questao` (`vezes_acertada`/`taxa_acerto`): aberta conta como acertada quando `pontos >= 70` (mesmo threshold visual do app) | Default razoável; ajustável |

## Fases (cada uma entrega app funcionando)

### Fase 1 — Schema + cadastro no admin
**Migration** `abertas_schema_correcao_e_grants.sql`:
- `questao`: + `resposta_modelo`, `pontos_chave jsonb default '[]'`, `criterios_correcao`. Sem SELECT grant (ocultas por padrão); grant `INSERT/UPDATE` por coluna a `authenticated` (RLS de admin restringe linhas). Repetir o header de aviso anti-regressão de grants da `20260624125610`.
- `tentativa_resposta`: + `enviada_em timestamptz`, `pontos smallint check (0–100)`, com SELECT grant (dado do próprio aluno).
- Tabela `resposta_correcao` (D3) + RLS + índices (unique `tentativa_resposta_id`, parcial por status pendente).
- `admin_get_questao` estendida com os 3 campos.

**Frontend admin**:
- `core/models/questao.ts`: novos campos opcionais.
- `(admin)/questoes/admin-questoes.component.ts|html`: `fFormato` ganha opção discursiva; seção condicional (textarea `resposta_modelo` obrigatória, editor de lista `pontos_chave`, textarea `criterios_correcao`); esconde alternativas/gabarito; ajustar type-guard (linha ~537).
- `core/services/admin.service.ts`: `criarQuestaoCompleta`/`atualizarQuestaoCompleta` carregam os novos campos; pulam escrita de alternativas para abertas.

*Guarda da fase: não anexar abertas a provas publicadas até a Fase 4 (orientação de processo; opcionalmente filtrar abertas em `iniciar_tentativa` até a Fase 3).*

### Fase 2 — Serviço de correção (edge function, testável via curl)
- `supabase/functions/corrigir-resposta-aberta/` (`index.ts` thin + `handler.ts` + `handler.test.ts`), seguindo o padrão DI existente.
- `_shared/grading-provider.ts` (interface + tipos `GradingInput`/`GradingResult`), `_shared/grading-openai-compat.ts` (chat completions, `response_format` JSON, prompt em PT usando enunciado+apoio, `resposta_modelo`, `pontos_chave`, `criterios`; temperature 0; timeout ~60s; parse+clamp+validação), `_shared/grading-fake.ts`.
- `_shared/deps.ts`: `Deps` ganha `gradingProvider(): GradingProvider`.
- Handler: input `{ tentativa_resposta_id }`; valida JWT/ownership; exige `enviada_em IS NOT NULL`; cap diário (D16); claim idempotente (D7); 2 retries com backoff (429/5xx/JSON inválido); sucesso → `corrigida` + persiste resultado + `tentativa_resposta.pontos`; esgotado → `erro`; env de IA ausente → `sem_ia`. Retorna a correção (estudo aguarda a resposta).
- Documentar env vars em `supabase/functions/.env.local.example`; execução apenas local via `functions serve` (deploy/secrets remotos ficam para depois, fora deste trabalho).

### Fase 3 — RPCs core + modo estudo
**Migration** `abertas_rpcs_resposta_e_nota_pontos.sql`:
- RPCs `salvar_resposta_texto` (rascunho) e `enviar_resposta_aberta` (lock + correcao pendente) — validações de formato, ownership, não finalizada, tamanho.
- `finalizar_tentativa` v2 (D9) + colunas `tentativa.pontos numeric(7,2)`, `total_pontuaveis int`.
- `consolidar_correcoes_tentativa(p_tentativa_id, p_forcar_sem_ia)` — fecha nota, atualiza stats de questão (D17), retorna `ResultadoTentativa`.
- `get_status_correcoes(p_tentativa_id)` → `{ total, corrigidas, pendentes, erros, sem_ia }` para polling.
- `iniciar_tentativa`/`retomar_tentativa`: emitem os campos de gabarito aberto mascarados em simulado (D10) e o estado da resposta (`resposta_texto`, `enviada_em`, correcao) para restaurar após F5.

**Frontend**:
- Models: `TentativaResposta` + novos campos; novo `core/models/correcao.ts`.
- `tentativa.service.ts`: `salvarRespostaTexto`, `enviarRespostaAberta`, `getStatusCorrecoes`, `consolidarCorrecoes`; novo `core/services/correcao-ia.service.ts` (invoke da edge function em `ServiceResult`).
- Novos shared components (com `.stories.ts`, regra do repo):
  - `resposta-aberta-input/` — textarea, contador/maxlength, autosave de rascunho (debounce), estados rascunho/enviando/enviada, botão Enviar com confirmação.
  - `correcao-feedback/` — badge de nota 0–100 (thresholds 70/50), checklist pontos atendidos/faltantes, comentário, erros; estados `corrigindo` (spinner), `erro` (botão tentar de novo), `sem_ia` (aviso "não contou na nota").
  - `resposta-padrao/` — card da resposta modelo.
- `questao-card/`: branch por `questao.formato` (alternativas vs bloco aberto).
- `tentativa-exec.component.ts|html`: signals `respostasTexto`/`correcoes`; **estudo**: enviar → aguarda edge function → feedback + resposta padrão inline; contagem de respondidas inclui enviadas (atalhos de teclado já ignoram TEXTAREA).

### Fase 4 — Simulado + resultado bloqueante
- **Migration** `abertas_simulado_personalizado.sql`: filtro de formato de `gerar_simulado_personalizado` aceita discursivas/misto.
- `tentativa-exec` (simulado): rascunho salva enquanto digita; Enviar trava + dispara correção fire-and-forget (erros engolidos; resultado re-tenta); grade de questões mostra estado "enviada"; mensagem de finalização alerta abertas não enviadas.
- `tentativa-resultado.component.ts`: estado bloqueante quando `correcoes_pendentes > 0` — UI de progresso ("Corrigindo respostas… 2/3"), poll `get_status_correcoes` ~3s, re-invoca edge function para pendentes/erros parados, depois `consolidarCorrecoes()`; timeout ~90s → `consolidarCorrecoes(forcar=true)` + banner explicando exclusão da nota (resposta padrão continua visível).
- `resultado-summary/`: exibição por pontos; abertas listadas com chip de nota; filtro de "erradas" inclui abertas com `pontos < 70`; card de acertos vira aproveitamento por pontos.
- `montar-simulado.component.ts`: opção de formato "Discursivas" / "Misto".

### Fase 5 — Revisão, histórico e métricas
**Migration** `abertas_revisao_e_metricas.sql`:
- `get_revisao_tentativa`/`get_revisao_prova`: incluem `resposta_texto`, `resposta_modelo`, `pontos_chave` e correção (mesma classe de exposição pós-finalização que `explicacao`).
- `get_historico_kpis` + `get_desempenho_por_tema` + `distribuicao_temas`: somas binárias → `coalesce(tr.pontos, (tr.correta::int)*100)`; trocar `WHERE tr.alternativa_id IS NOT NULL` por `WHERE coalesce(...) IS NOT NULL` (inclui abertas, exclui `sem_ia` naturalmente); nível tentativa via coalesce do D4.

**Frontend**: `prova-visualizar/` renderiza revisão de aberta (resposta do aluno + feedback + resposta padrão + anotações); `historico` e charts quase intactos (nota já é %); labels por tema de "acertos" → "aproveitamento". `questao-explicacao` reutilizado ao lado de `resposta-padrao`.

### Fase 6 — Import markdown/IA + conversão
- `admin-importar.component.ts`: parser aceita por bloco `FORMATO: aberta`, `RESPOSTA_MODELO:` (multilinha), `PONTOS_CHAVE:` (lista `- item`), `CRITERIOS:`; matriz de validação (aberta ⇒ RESPOSTA_MODELO obrigatória, ALTERNATIVAS/GABARITO proibidos; fechada ⇒ vice-versa); preview renderiza os dois formatos; `montarPromptQuestoes()` ensina a IA externa os dois formatos e quando usar cada um (mesma sessão de import — D13).
- `admin-questoes.component.ts`: botão "Converter para discursiva" (D12) — muda formato, pré-preenche `resposta_modelo` (alternativa correta + explicação), sugere stub de `pontos_chave`; alternativas mantidas no banco.

### Fase 7 — Transversais
- **XP/gamificação**: `conceder_xp_tentativa` — termos baseados em acertos → pontos/nota; frontend concede XP após consolidação (no-op para tentativas só-MC).
- **Desafio diário**: guard `formato='multipla_escolha'` em `get_desafio_diario` (D14).
- **Impressão**: `get_simulado_impressao` inclui abertas (linhas para resposta; gabarito imprime `resposta_modelo`).
- Anotações, comentários, favoritos: agnósticos de formato — sem mudança (confirmado na exploração).
- Docs + CHANGELOG por fase (regra do repo); atualizar doc de segurança com as novas colunas secretas + aviso de regressão de grants; documentar env vars de IA.

## Regras de ambiente (obrigatórias)

- **Tudo local, nada em produção.** Todo desenvolvimento e teste roda contra o Supabase **local via Docker** (`npx supabase start`). É **proibido**: `supabase db push` contra o projeto linkado (prod), `supabase functions deploy`, `supabase secrets set` no projeto remoto, ou qualquer `apply_migration`/`execute_sql` via MCP no projeto nuvem.
- Migrations são criadas como arquivos em `supabase/migrations/` e aplicadas **apenas** no stack local (`npx supabase db reset` / `migration up --local`).
- Edge functions rodam **apenas** via `npx supabase functions serve --env-file ./supabase/functions/.env.local`; env vars de IA vão no `.env.local` (e `.env.local.example` documentado), nunca em secrets remotos.
- O trabalho fica isolado na branch designada (`claude/open-ended-questions-plan-un8m3l`), com commits por fase e push só dessa branch. Sem PR e sem deploy até o dono decidir.

## Verificação
Toda a verificação abaixo roda no ambiente local (Docker), nunca no projeto de produção:

- **Deno tests** do handler com deps/provider fakes: sucesso, retry de JSON inválido, 5xx→erro, claim duplo idempotente, rejeição de ownership, cap diário, env ausente→sem_ia.
- **RPCs** testadas contra stack local (`npx supabase start`) antes do `db pull` da migration, cobrindo: tentativa só-MC (nota idêntica ao atual), mista (pontos parciais), aberta sem IA (denominador reduzido), re-envio rejeitado.
- **Karma**: `resposta-aberta-input`, `correcao-feedback`, novos métodos do `tentativa.service`, parser de import.
- **Playwright e2e** com `AI_GRADING_PROVIDER=fake`: estudo (responder→feedback imediato) e simulado (enviar→resultado bloqueante→nota consolidada).
- **Storybook**: stories obrigatórias para os 3 novos shared components.
- Grep-audit antes do merge da Fase 5: todos os usos agregados de `acertos`/`correta` nas RPCs migrados para as duas expressões coalesce canônicas.

## Riscos
1. **Regressão de grants via `db pull`** pode reexpor `resposta_modelo` — repetir header de aviso e considerar check de CI.
2. **Consistência das fórmulas de pontos** em 5+ RPCs — mitigar com as duas expressões canônicas + grep-audit.
3. **`forcar_sem_ia` é porta de mão única** (IA só lenta ≠ indisponível): timeout de 90s generoso + re-invocação de pendentes antes de forçar; aceitável para v1.
4. **Custo**: simulado com 20 abertas = 20 chamadas LLM — caps de tamanho e diário são as alavancas; provider default barato via OpenRouter.
5. **Prompt injection na resposta do aluno**: delimitadores + clamp de nota + feedback visível limitam o estrago.

## Arquivos críticos
- `supabase/migrations/20260624125610_seguranca_revogar_gabarito_e_escrita_tentativa.sql` (modelo de grants/mascaramento a estender)
- `supabase/migrations/20260520180000_remover_dificuldade_e_campos_prova.sql` (iniciar/finalizar a reescrever por pontos)
- `supabase/migrations/20260609000000_add_total_questoes_to_kpis.sql` (KPIs a migrar para pontos)
- `frontend/src/app/(dashboard)/provas/tentativa-exec/tentativa-exec.component.ts` (branch estudo/simulado)
- `frontend/src/app/core/services/tentativa.service.ts` (wrappers de RPC/edge function)
- `frontend/src/app/(admin)/importar/admin-importar.component.ts` (parser + prompt de import)
- `frontend/src/app/(admin)/questoes/admin-questoes.component.ts` (form + conversão)
- `supabase/functions/_shared/deps.ts` (padrão DI a estender com `GradingProvider`)
