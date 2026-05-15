# Status do Módulo Competitivo

Atualizado em: 2026-05-15

## Resumo

O módulo competitivo está quase completo. Falta apenas um card de desafio diário na tela inicial. Todas as demais features estão implementadas, testadas e aplicadas no Supabase Cloud.

---

## O que está pronto

### Backend (Supabase Cloud — todas as migrations aplicadas)

| Migration | O que faz |
|---|---|
| `20260515174048_gamificacao_xp_base` | Tabelas `gamificacao_evento` e `user_gamificacao_stats`, trigger de snapshot, RPCs `get_meu_xp` e `conceder_xp_tentativa`. XP com cap diário de 500, idempotência por tentativa, modo visualizar não pontua. |
| `20260515175525_streak_v2_stats` | `get_streak_estudo_v2` com streak, recorde, protetores (Streak Freeze: consome em 1 dia perdido, +1 a cada 7 consecutivos, máx 2). Backfill de dados históricos. |
| `20260515175945_conquistas_mvp` | Tabelas `conquista_catalogo` e `user_conquista`. 5 badges iniciais. RPCs `get_minhas_conquistas` e `verificar_conquistas_usuario`. `conceder_xp_tentativa` retorna conquistas novas. |
| `20260515180414_perfil_competitivo_privacidade` | Campo `profiles.competir_publico`. Usuário anônimo no ranking aparece como "Anônimo" sem avatar. |
| `20260515180948_ranking_competitivo_mvp` | RPCs `get_ranking_global`, `get_ranking_semana` e `get_minha_posicao_ranking`. |
| `20260515181500_ranking_is_me` | Ranking inclui campo `is_me` e auto-inclui o usuário mesmo fora do top-N. |
| `20260515182000_desafio_diario` | Tabelas `desafio_diario` e `desafio_diario_resposta`. RPCs `get_desafio_diario` e `responder_desafio_diario`. Anti-cheat: campo `correta` omitido nas alternativas antes de responder. XP: 50 correto / 10 errado. |
| `20260515183000_conquistas_expandidas` | 7 badges novos: `streak_14` (300 XP), `streak_30` (750 XP), `volume_25` (200 XP), `volume_50` (500 XP), `precisao_80` (400 XP), `desafio_diario_1` (25 XP), `desafio_diario_7` (100 XP). `verificar_conquistas_usuario` atualizada. |
| `20260515185000_security_perf_fixup` | REVOKE anon de todas as RPCs. Índices nas FKs de `desafio_diario`, `desafio_diario_resposta` e `user_conquista`. |
| `20260515186000_desafio_null_guard` | Validação de `p_alternativa_id IS NULL` em `responder_desafio_diario`. |
| `20260515187000_ranking_avatar` | `get_ranking_global/semana` inclui `avatar_url` (null para anônimos, preservando privacidade). |

**Total: 12 badges no catálogo** (primeira_tentativa, streak_3, streak_7, streak_14, streak_30, volume_10, volume_25, volume_50, precisao_70, precisao_80, desafio_diario_1, desafio_diario_7).

### Frontend

**Serviços novos:**
- `gamificacao.service.ts` — cache em signal de `GamificacaoStats`, `getMeuXp()`
- `conquista.service.ts` — `getMinhasConquistas()`
- `ranking.service.ts` — `carregarRankingGlobal/Semana/MinhaPosicao()`, parser com `avatar_url` e `is_me`
- `desafio.service.ts` — `carregarDesafio()` e `responderDesafio()` (faz refetch após resposta para obter `correta` nas alternativas)

**Modelos (`gamificacao.ts`):**
- `GamificacaoStats`, `RankingItem` (com `avatar_url`, `is_me`), `ConquistaUsuario`
- `DesafioDiario`, `DesafioAlternativa`, `DesafioQuestao`, `DesafioEstatistica`, `DesafioMinhaResposta`, `ResponderDesafioResult`

**Tela Competitivo (`/dashboard/competitivo`):**
- 3 KPI cards: XP total, XP da semana (com intervalo de datas, ex: "12–18 de mai"), Sequência
- Desafio diário com 4 estados: loading skeleton, indisponível, pendente (alternativas sem `correta`) e respondido (alternativas destacadas + XP badge + estatística coletiva)
- Ranking Global/Semana com abas, linha `is_me` em azul, separador `···` entre posições não-consecutivas, avatar (foto ou inicial colorida)

**Tela Inicial (`/dashboard`):**
- KPI `XP da Semana` com nível
- `RankingStatusBarComponent` com posição global/semanal e XP da semana

**Tela Perfil (`/dashboard/perfil`):**
- Seção competitiva: nível, XP, barra de progresso, streak, protetores
- Lista de conquistas desbloqueadas/bloqueadas do catálogo completo
- Toggle de privacidade competitiva (público/anônimo)

**Hooks:**
- `tentativa.service.ts` — após finalizar tentativa, chama `conceder_xp_tentativa`, exibe toast de XP e conquistas novas

**Tipos:**
- `database.types.ts` sincronizado com o schema atual do Supabase (inclui `desafio_diario`, `desafio_diario_resposta`, `apto_desafio_diario`, todas as RPCs novas)

**Testes:**
- 372 testes passando (27 arquivos)
- `desafio.service.spec.ts`: 16 testes (parsers, estados do signal, fluxo de resposta)
- `competir-hub.component.spec.ts`: 17 testes (`rankingComGap`, `desafioEstado`, `alternativaClass`, `rankingXp`)

---

## Pendência única

### Card de Desafio Diário na Tela Inicial

**O que fazer:**
Adicionar um card pequeno em `frontend/src/app/(dashboard)/inicio/inicio.component.ts/html` que mostra o status do desafio diário do usuário.

**Comportamento esperado:**
- Chamar `get_desafio_diario()` via `DesafioService` (já existe, basta injetar)
- Se `disponivel: false` → não exibir o card (ou exibir vazio discreto)
- Se `minha_resposta === null` → card com CTA "Fazer o desafio de hoje" linkando para `/dashboard/competitivo`
- Se `minha_resposta !== null` → card com "✓ Desafio feito hoje" + XP ganho

**Onde inserir no HTML:**
Após o `RankingStatusBarComponent` (já existente), antes da seção de simulados recentes.

**Serviço disponível:**
`DesafioService` já está `providedIn: 'root'`. Só injetar e chamar `carregarDesafio()` no `ngOnInit` ou no resolver `inicioResolver`.

**Atenção:**
O `inicioResolver` (`frontend/src/app/core/resolvers/inicio.resolver.ts`) já carrega XP, streak e posição de ranking. Avaliar se vale adicionar o desafio no resolver (para evitar loading visible) ou carregar após a tela montar.

---

## Bugs conhecidos

Nenhum crítico. Um bug menor no streak:
- `get_streak_estudo_v2` retorna `freeze_usado_hoje: null` em vez de `false` quando não foi usado (typo: `v_freeze_uso_hoje` em vez de `v_freeze_usado_hoje` na linha de `jsonb_build_object`). Não impacta funcionalidade visível — o frontend usa `streak_atual`, `recorde` e `freezes_disponiveis`, não `freeze_usado_hoje`.
