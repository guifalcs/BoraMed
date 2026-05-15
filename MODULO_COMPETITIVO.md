# Plano: Módulo Competitivo BoraMed

## Contexto

O BoraMed já tem um ciclo funcional de estudos (simulados, tentativas, análise de desempenho). O problema é que não existe gancho de retorno diário — o usuário usa quando lembra, não por hábito. Este módulo adiciona camadas de engajamento (XP, streak aprimorado, Daily Challenge, ligas semanais, conquistas) com foco em **consistência sem ansiedade**, alinhado ao perfil de público de medicina/vestibular que já está sob pressão.

**Princípios de design (anti-burnout):**

| ID | Princípio |
|---|---|
| P1 | Múltiplos eixos de progresso (XP, streak, conquistas, liga) |
| P2 | Loss-aversion controlada (Streak Freeze automático) |
| P3 | Matchmaking por hábito, não habilidade |
| P4 | Opt-out obrigatório para ranking público |
| P5 | Não punir ausência |
| P6 | Recompensar consistência, não intensidade |

**Referências:** Duolingo (streaks, ligas, daily quests), Wordle (desafio compartilhado), Strava Local Legend (consistência > talento), AMBOSS (analytics densos para medicina), Anki (spaced repetition sem gamificação agressiva).

---

## 1. Sistema de Pontuação (XP)

### Arquitetura: event-sourced + snapshot denormalizado

- `gamificacao_evento` — log imutável de cada XP concedido (append-only)
- `user_gamificacao_stats` — 1 linha por usuário, totais correntes; atualizada por trigger

### Fórmula de XP (por tentativa finalizada)

```
base        = acertos * 10
bonus_nota  = nota >= 70 ? 50 : nota >= 50 ? 20 : 0
bonus_dif   = soma(dificuldade_questao_acertada * 2)
bonus_tempo = tempo_medio_resposta < 60s E nota >= 50 ? 15 : 0
xp_total    = base + bonus_nota + bonus_dif + bonus_tempo
```

- **Cap diário: 500 XP** de tentativas (evita farming)
- Modo `visualizar` não concede XP
- Idempotente via `idempotency_key = 'tentativa:{tentativa_id}'`

### Níveis (cosmético)

`nivel = floor(sqrt(xp_total / 100))` — nível 1 = 100 XP, nível 10 = 10.000

### Schema

**`gamificacao_evento`**:
```sql
id                uuid PK default gen_random_uuid()
user_id           uuid FK auth.users
tipo              text CHECK IN ('tentativa', 'desafio_diario', 'streak_marco', 'conquista', 'liga_promocao')
xp                integer
metadata          jsonb
idempotency_key   text NOT NULL
criado_em         timestamptz default now()
UNIQUE(user_id, idempotency_key)
```

**`user_gamificacao_stats`** (1:1 com user):
```sql
user_id              uuid PK FK auth.users
xp_total             bigint default 0
xp_semana_atual      integer default 0
semana_iso           text          -- ex: '2026-W20'
nivel                smallint
streak_atual         smallint default 0
streak_recorde       smallint default 0
ultimo_dia_ativo     date
freezes_disponiveis  smallint default 0
freeze_usado_em      date
competir_publico     boolean default true
atualizado_em        timestamptz
```

---

## 2. Streak Aprimorado

- Manter `get_streak_estudo()` v1 intacta (resolvers existentes dependem dela)
- **Criar** `get_streak_estudo_v2()` retornando `{atual, recorde, freezes_disponiveis, freeze_usado_hoje, dias_para_proximo_marco}`
- Migrar `inicio.resolver.ts` para v2

### Streak Freeze (P2)

- 1 freeze ganho a cada 7 dias consecutivos completos, máximo 2 armazenados
- Consumido automaticamente quando gap = exatamente 1 dia e há freeze disponível
- UI: "2 protetores de sequência" + ícone Shield

### Marcos de Streak (XP + Conquista)

| Dias | XP |
|---|---|
| 3 | 50 |
| 7 | 150 |
| 14 | 300 |
| 30 | 750 |
| 100 | 3.000 |
| 365 | 15.000 |

---

## 3. Daily Challenge

### Conceito

Uma questão por dia, **a mesma para todos os usuários**, válida 00:00–23:59 (America/Sao_Paulo). Após responder, revela estatística coletiva ("63% acertou hoje") — padrão Wordle. Cria viralidade orgânica e ponto de conversa.

### Seleção determinística

- Nova coluna `questao.apto_desafio_diario boolean default false` (curadoria manual)
- RPC `get_desafio_do_dia(data date)` usa `seed = abs(hashtext(data::text)) % count(questoes_aptas)` — resultado idêntico para qualquer chamada no mesmo dia

### XP

- Correto: **100 XP** | Errado: **25 XP** (consolação, P5)
- Bônus streak de desafio: +10 XP/dia consecutivo (cap +100)
- **Não conta** para o cap diário de 500 XP

### Schema

**`desafio_diario`**:
```sql
data                      date PK
questao_id                uuid FK
total_respostas           integer default 0
total_acertos             integer default 0
tempo_medio_segundos      numeric
distribuicao_alternativas jsonb  -- {"A":12,"B":40,"C":5,"D":23,"E":20}
criado_em                 timestamptz default now()
```

**`desafio_diario_resposta`**:
```sql
id                    uuid PK
user_id               uuid FK auth.users
data                  date
alternativa_id        uuid FK
correta               boolean
tempo_gasto_segundos  integer
respondida_em         timestamptz
UNIQUE(user_id, data)
```

### RPCs

- `get_desafio_do_dia()` — questão sem gabarito + flag se usuário já respondeu hoje
- `submeter_desafio_diario(alternativa_id, tempo_gasto)` — registra, concede XP, retorna gabarito + stats coletivas
- `get_historico_desafios(limite)` — calendário verde/vermelho dos últimos 30 dias

---

## 4. Ligas Semanais

### Tiers (7, nomes do universo médico)

| Tier | Nome | Promove | Relega |
|---|---|---|---|
| 1 | Estagiário | Top 7 | — |
| 2 | Interno | Top 7 | Bottom 5 |
| 3 | Residente R1 | Top 7 | Bottom 5 |
| 4 | Residente R3 | Top 7 | Bottom 5 |
| 5 | Plantonista | Top 5 | Bottom 5 |
| 6 | Especialista | Top 5 | Bottom 5 |
| 7 | Chefe de Clínica | — | Bottom 5 |

Usuários entram em Estagiário ao acumular ≥1 evento de XP.

### Matchmaking por atividade (P3)

Agrupar por `media_xp_4_semanas` (volume de estudo), **nunca por % acerto**. Grupos de ~30 usuários do mesmo tier com hábitos semelhantes.

### Calendário

- Semana: segunda 00:00 → domingo 23:59 BRT
- Rotação via **`pg_cron`** (job toda segunda 00:05 BRT)
- Ranking exibe ±5 posições ao redor do usuário — nunca top-100 sem contexto (P1)

### Schema

```sql
-- liga_temporada
id uuid PK, semana_iso text UNIQUE, iniciada_em date, terminada_em date, status text

-- liga_grupo
id uuid PK, temporada_id uuid FK, tier smallint CHECK(1..7), nome text

-- liga_participante
id uuid PK, grupo_id uuid FK, user_id uuid FK,
xp_semana integer default 0, posicao_final smallint,
acao text CHECK('promovido','mantido','relegado','pendente')
UNIQUE(grupo_id, user_id)
```

### RPCs

- `get_minha_liga()` — grupo atual, tier, XP da semana, dias restantes
- `get_liga_ranking(janela_acima, janela_abaixo)` — ±5 ao redor do usuário
- `get_liga_top_grupo(limit 10)` — top do próprio grupo (não global)

---

## 5. Conquistas / Badges

**Catálogo seed em SQL** (`conquista_catalogo`), avaliado por RPC `verificar_conquistas_usuario()` assincronamente via trigger após cada evento.

### Catálogo inicial (25 conquistas, 5 secretas)

| Slug | Categoria | Critério | XP |
|---|---|---|---|
| `primeira_tentativa` | volume | 1ª tentativa finalizada | 25 |
| `streak_3` / `_7` / `_30` / `_100` | streak | marcos de streak | 50/150/750/3k |
| `volume_10` / `_50` / `_200` / `_500` | volume | tentativas acumuladas | 100/500/2k/5k |
| `precisao_70` / `_90` / `_100` | precisão | notas altas repetidas | 200/300/500 |
| `desafio_1` / `_7` / `_30` | desafio | dailies respondidos | 25/200/1k |
| `liga_promovido` / `_chefe` / `_topo` | liga | progressão de liga | 200/2k/300 |
| `madrugador` *(secreta)* | social | tentativa 5h–7h | 50 |
| `coruja` *(secreta)* | social | tentativa 23h–1h | 50 |
| `comeback` *(secreta)* | streak | streak após freeze usado | 100 |
| `variedade` | volume | acertar questões de 10 disciplinas distintas | 500 |
| `medico_em_formacao` | volume | nível 10 (10k XP) | 1.000 |

### Schema

```sql
-- conquista_catalogo (somente leitura para usuários)
id text PK (slug), nome text, descricao text, icone text,
categoria text, xp_recompensa integer, secreta boolean default false

-- user_conquista
user_id uuid FK, conquista_id text FK,
desbloqueada_em timestamptz,
PK(user_id, conquista_id)
```

---

## 6. Integração na UI

### Novas rotas (`app.routes.ts`)

```
/dashboard/competir               CompetirHubComponent (tabs)
/dashboard/competir/liga          LigaComponent
/dashboard/competir/desafio       DesafioDiarioComponent
/dashboard/competir/conquistas    ConquistasComponent
/dashboard/perfil/competicao      PerfilCompeticaoComponent
```

### Sidebar (`dashboard.component.ts` ~L71)

```ts
{ label: 'Competir', icon: Trophy, route: '/dashboard/competir' }
// Posição: entre Simulados e Histórico
```

### Tela `/inicio` (sem remover KPIs existentes)

- Card `DailyChallengeCardComponent` acima dos KPIs (status + CTA "Responder agora")
- Banner `LigaStatusBarComponent` (1 linha): "Tier: Interno · #3 do grupo · 3 dias restantes"
- 5º KPI: "XP da semana" com sparkline 7 dias

### Shared components a criar (todos com `.stories.ts`)

`xp-badge`, `streak-flame`, `daily-challenge-card`, `liga-status-bar`, `liga-ranking-row`, `conquista-tile`, `conquista-modal`, `tier-emblem`, `xp-event-toast`, `heatmap-calendar`

### Hook na finalização de tentativa (`tentativa.service.ts`)

Após RPC existente de finalização:
1. Chamar `conceder_xp_tentativa(tentativa_id)` (idempotente)
2. Receber `{xp_ganho, novas_conquistas[]}`
3. Disparar `XpEventToastComponent` ("+150 XP")
4. Se `novas_conquistas.length > 0` → modal de celebração

### Novos services

| Service | Responsabilidade |
|---|---|
| `GamificacaoService` | XP, nível, stats — signals `xpTotal`, `nivel`, `xpSemana` |
| `LigaService` | Liga atual, ranking, histórico de tiers |
| `DesafioService` | Questão do dia, submissão, histórico |
| `ConquistaService` | Catálogo + desbloqueadas, signal cache |

---

## 7. Migrations SQL

Ordem de aplicação (uma por bloco coeso):

```
20260516000001_gamificacao_schema.sql      -- tabelas + trigger denormalização
20260516000002_gamificacao_rpcs.sql        -- conceder_xp_tentativa, get_meu_xp
20260516000003_streak_v2.sql               -- get_streak_estudo_v2, usar_streak_freeze
20260516000004_profiles_competir_publico.sql
20260516000005_conquistas_schema_e_seed.sql
20260516000006_conquistas_rpcs.sql         -- verificar_conquistas_usuario
20260516000007_desafio_diario_schema.sql   -- questao.apto_desafio_diario + tabelas
20260516000008_desafio_diario_rpcs.sql
20260516000009_liga_schema.sql
20260516000010_liga_rpcs.sql
20260516000011_liga_cron_jobs.sql          -- habilitar pg_cron + jobs semanais
20260516000012_inicio_kpis_xp.sql          -- extensão das RPCs de KPI existentes
```

**RLS — padrões críticos:**
- `gamificacao_evento`: SELECT apenas próprio; INSERT apenas via RPC `SECURITY DEFINER`
- Todo cross-user apenas via RPC `SECURITY DEFINER` + filtro `competir_publico = true`
- Auditar com `supabase db advisors` antes de cada deploy

---

## 8. Fases de Implementação

### Fase MVP (Sprint 1–2) — Sem features sociais

**Objetivo:** provar que XP e streak melhoram retorno diário.

- Migrations 1–5 (subset: 5 conquistas iniciais)
- `GamificacaoService`, `ConquistaService`
- Toast XP ao finalizar tentativa
- Streak Freeze automático
- KPI "XP da semana" no `/inicio`
- `/dashboard/perfil/competicao` minimal: nível, XP, 5 conquistas, streak
- **Sidebar sem item "Competir" ainda** (acesso só pelo perfil)

### Fase V2 (Sprint 3–4) — Daily Challenge

**Objetivo:** conteúdo compartilhado diário (maior ROI de DAU, Duolingo +25%).

- Migrations 6–8
- Curadoria de `apto_desafio_diario` em ~200 questões
- `DesafioService`
- Card de Daily no `/inicio`
- Rota `/dashboard/competir` com tab "Desafio" (Liga placeholder "Em breve")
- 20 conquistas restantes ativadas
- Heatmap calendar no perfil

*Por que antes de ligas: valida infra multi-usuário com risco menor (sem ranking, sem rotação semanal)*

### Fase V3 (Sprint 5–6) — Ligas Semanais

**Objetivo:** competição social com matchmaking justo.

- Migrations 9–12
- `LigaService`
- Tab "Liga" ativa em `/dashboard/competir`
- Banner de status no `/inicio`
- pg_cron testado com fast-forward de datas em stage
- Onboarding banner reforçando opt-out
- Conquistas de liga ativadas

### Fase V4 (Pós-lançamento)

- A/B test: default `competir_publico = true` vs `false`
- Conquistas sazonais ("Maratona ENEM 2026")
- Sistema de seguir amigos + friend streaks

---

## 9. Arquivos Críticos

| Arquivo | Mudança |
|---|---|
| `src/app/app.routes.ts` | Registrar rotas `/dashboard/competir/**` e `/dashboard/perfil/competicao` |
| `src/app/(dashboard)/dashboard.component.ts` | Adicionar item "Competir" em `navItems` |
| `src/app/core/services/tentativa.service.ts` | Hook pós-finalização para XP + toast |
| `src/app/core/resolvers/inicio.resolver.ts` | Incluir dados de liga, desafio e XP |
| `src/app/(dashboard)/inicio/inicio.component.ts` | Renderizar novos cards sem remover KPIs existentes |
| `supabase/migrations/` | 12 novas migrations |

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Burnout em público de medicina | Alta | Princípios P1-P6; opt-out fácil; ±5 ranking; sem comparação de % acerto |
| Farming de XP | Média | Cap 500 XP/dia; somente modos simulado/estudo |
| Duplicação de XP | Alta | `idempotency_key` + UNIQUE constraint; teste de double-call |
| Cron de rotação falhar | Alta | Job idempotente; fallback manual via RPC `processar_fim_temporada(semana_iso)` |
| RLS exposta em ranking | Crítica | Apenas RPCs SECURITY DEFINER para cross-user; auditar com db advisors |
| pg_cron indisponível no plano Supabase | Média | Fallback: Edge Function + Vercel Cron disparando RPC |
| Liga com poucos usuários | Média | Merge de tiers adjacentes se grupo < 10; UI "Liga em formação" se < 5 |

---

## 11. Verificação (end-to-end)

1. Finalizar simulado → toast "+XP" aparece → perfil mostra nível e XP atualizado
2. Estudar 7 dias consecutivos → freeze concedido → streak não quebra no 8º dia ausente
3. Responder Daily Challenge → gabarito revelado → estatística coletiva exibida → XP fora do cap diário
4. Segunda-feira 00:05 → cron rodou → novo grupo de liga atribuído para usuário ativo
5. Domingo 23:59 → cron fechou semana → promoção/relegação aplicada
6. Usuário com `competir_publico = false` → nome não aparece em ranking; ainda recebe XP e conquistas
