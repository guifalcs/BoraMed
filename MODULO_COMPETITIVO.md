# Plano: Módulo Competitivo BoraMed

## Contexto

O BoraMed já tem um ciclo funcional de estudos (simulados, tentativas, análise de desempenho). O problema é que não existe gancho de retorno diário — o usuário usa quando lembra, não por hábito. Este módulo adiciona camadas de engajamento (XP, streak aprimorado, Daily Challenge, ranking global, conquistas) com foco em **valorizar quem mais estuda**, sem confrontos diretos entre usuários.

**Princípios de design:**

| ID | Princípio |
|---|---|
| P1 | Múltiplos eixos de progresso (XP, streak, conquistas, ranking) |
| P2 | Loss-aversion controlada (Streak Freeze automático) |
| P3 | Ranking mede atividade (XP), não habilidade (% acerto) |
| P4 | Opt-out obrigatório para visibilidade no ranking |
| P5 | Não punir ausência |
| P6 | Recompensar consistência, não intensidade |

**Referências:** Duolingo (streaks, daily quests), Wordle (desafio compartilhado), Strava (ranking de atividade), AMBOSS (analytics densos para medicina).

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
tipo              text CHECK IN ('tentativa', 'desafio_diario', 'streak_marco', 'conquista')
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

## 4. Ranking Global

### Conceito

Ranking único, sem divisões ou grupos. Ordena todos os usuários que optaram por participar por **XP total acumulado** — ou seja, quem mais estudou desde que criou a conta. Sem reset, sem rotação.

A exibição é contextual: o usuário vê o top 10 + sua própria posição com os 5 acima e 5 abaixo (para tornar o ranking próximo alcançável).

### Dimensões de ranking

Dois recortes disponíveis na UI (tabs):

| Aba | Ordenação | Janela exibida |
|---|---|---|
| **All-time** | `xp_total DESC` | Top 10 + posição do usuário ±5 |
| **Semana** | `xp_semana_atual DESC` | Top 10 + posição do usuário ±5 |

A aba "Semana" reinicia todo domingo 23:59 BRT via trigger/cron — dá chance de novatos aparecerem sem destruir o ranking histórico.

### Privacidade (P4)

- `profiles.competir_publico boolean default true`
- Usuários opt-out: nome substituído por "Anônimo" no ranking; ainda acumulam XP e conquistas normalmente
- UI: toggle visível em Perfil + banner no onboarding

### Schema

Não requer tabela nova — o ranking é calculado diretamente de `user_gamificacao_stats` via RPC.

### RPCs

- `get_ranking_global(limite int default 10)` — top N filtrado por `competir_publico = true`, com `nome_display`, `nivel`, `xp_total`, `posicao`
- `get_ranking_semana(limite int default 10)` — mesmo padrão com `xp_semana_atual`
- `get_minha_posicao_ranking()` — retorna `{posicao_global, posicao_semana, total_participantes}` para o usuário logado

Todas as RPCs com `SECURITY DEFINER` — nunca expõem dados de usuários opt-out.

### Reset semanal

- Cron simples (`pg_cron` ou Edge Function + Vercel Cron) toda segunda 00:01 BRT:
  ```sql
  UPDATE user_gamificacao_stats
  SET xp_semana_atual = 0, semana_iso = to_char(now(), 'IYYY-"W"IW');
  ```
- Não apaga histórico — só o contador da semana corrente.

---

## 5. Conquistas / Badges

**Catálogo seed em SQL** (`conquista_catalogo`), avaliado por RPC `verificar_conquistas_usuario()` assincronamente via trigger após cada evento.

### Catálogo inicial (22 conquistas, 5 secretas)

| Slug | Categoria | Critério | XP |
|---|---|---|---|
| `primeira_tentativa` | volume | 1ª tentativa finalizada | 25 |
| `streak_3` / `_7` / `_30` / `_100` | streak | marcos de streak | 50/150/750/3k |
| `volume_10` / `_50` / `_200` / `_500` | volume | tentativas acumuladas | 100/500/2k/5k |
| `precisao_70` / `_90` / `_100` | precisão | notas altas repetidas | 200/300/500 |
| `desafio_1` / `_7` / `_30` | desafio | dailies respondidos | 25/200/1k |
| `ranking_top10` | ranking | entrar no top 10 global | 500 |
| `ranking_1` | ranking | chegar ao 1º lugar (all-time) | 3.000 |
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
/dashboard/competir/ranking       RankingComponent
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
- Banner `RankingStatusBarComponent` (1 linha): "Você está em #47 no ranking · +230 XP esta semana"
- 5º KPI: "XP da semana" com sparkline 7 dias

### Shared components a criar (todos com `.stories.ts`)

`xp-badge`, `streak-flame`, `daily-challenge-card`, `ranking-status-bar`, `ranking-row`, `conquista-tile`, `conquista-modal`, `xp-event-toast`, `heatmap-calendar`

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
| `RankingService` | Ranking global, semana, posição do usuário |
| `DesafioService` | Questão do dia, submissão, histórico |
| `ConquistaService` | Catálogo + desbloqueadas, signal cache |

---

## 7. Migrations SQL (9 migrations)

```
20260516000001_gamificacao_schema.sql      -- tabelas + trigger denormalização
20260516000002_gamificacao_rpcs.sql        -- conceder_xp_tentativa, get_meu_xp
20260516000003_streak_v2.sql               -- get_streak_estudo_v2, usar_streak_freeze
20260516000004_profiles_competir_publico.sql
20260516000005_conquistas_schema_e_seed.sql
20260516000006_conquistas_rpcs.sql         -- verificar_conquistas_usuario
20260516000007_desafio_diario_schema.sql   -- questao.apto_desafio_diario + tabelas
20260516000008_desafio_diario_rpcs.sql
20260516000009_ranking_rpcs.sql            -- get_ranking_global, get_ranking_semana, get_minha_posicao_ranking
```

Reset semanal via cron simples (não requer tabelas extras de liga).

**RLS — padrões críticos:**
- `gamificacao_evento`: SELECT apenas próprio; INSERT apenas via RPC `SECURITY DEFINER`
- Todo cross-user apenas via RPC `SECURITY DEFINER` + filtro `competir_publico = true`
- Auditar com `supabase db advisors` antes de deploy

---

## 8. Fases de Implementação

### Fase MVP (Sprint 1–2) — XP + Streak

**Objetivo:** provar que XP e streak melhoram retorno diário.

- Migrations 1–5 (subset: 5 conquistas iniciais)
- `GamificacaoService`, `ConquistaService`
- Toast XP ao finalizar tentativa
- Streak Freeze automático
- KPI "XP da semana" no `/inicio`
- `/dashboard/perfil/competicao` minimal: nível, XP, 5 conquistas, streak

### Fase V2 (Sprint 3–4) — Daily Challenge + Ranking

**Objetivo:** conteúdo compartilhado diário + ranking global visível.

- Migrations 6–9
- Curadoria de `apto_desafio_diario` em ~200 questões
- `DesafioService`, `RankingService`
- Card de Daily no `/inicio`
- Banner de posição no ranking no `/inicio`
- Rota `/dashboard/competir` com tabs: Ranking, Desafio, Conquistas
- 22 conquistas ativadas
- Heatmap calendar no perfil

### Fase V3 (Pós-lançamento, conforme crescimento)

- Sistema de amigos / seguir usuários → ranking entre amigos
- Conquistas sazonais ("Maratona ENEM 2026")
- Notificações push para streak em risco e daily challenge

---

## 9. Arquivos Críticos

| Arquivo | Mudança |
|---|---|
| `src/app/app.routes.ts` | Registrar rotas `/dashboard/competir/**` e `/dashboard/perfil/competicao` |
| `src/app/(dashboard)/dashboard.component.ts` | Adicionar item "Competir" em `navItems` |
| `src/app/core/services/tentativa.service.ts` | Hook pós-finalização para XP + toast |
| `src/app/core/resolvers/inicio.resolver.ts` | Incluir posição no ranking, desafio do dia e XP |
| `src/app/(dashboard)/inicio/inicio.component.ts` | Renderizar novos cards sem remover KPIs existentes |
| `supabase/migrations/` | 9 novas migrations |

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Ranking desmotiva quem está longe do topo | Média | Exibir sempre posição do usuário ±5; destaque para "subi X posições esta semana" |
| Farming de XP | Média | Cap 500 XP/dia; somente modos simulado/estudo |
| Duplicação de XP | Alta | `idempotency_key` + UNIQUE constraint |
| RLS exposta no ranking | Crítica | Apenas RPCs SECURITY DEFINER; filtro `competir_publico = true` |
| Burnout por comparação | Média | Ranking de atividade (XP), nunca de % acerto; opt-out fácil |

---

## 11. Verificação (end-to-end)

1. Finalizar simulado → toast "+XP" aparece → perfil mostra nível e XP atualizado
2. Estudar 7 dias consecutivos → freeze concedido → streak não quebra no 8º dia ausente
3. Responder Daily Challenge → gabarito revelado → estatística coletiva exibida
4. Acessar `/dashboard/competir/ranking` → ver top 10 + posição própria com ±5 vizinhos
5. Segunda-feira 00:01 → `xp_semana_atual` zerado → ranking da semana reinicia
6. Usuário opt-out → nome não aparece no ranking; XP e conquistas continuam normalmente
