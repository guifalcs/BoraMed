# Changelog

> Registro de todas as alterações do projeto.
> Atualizado automaticamente ao final de cada feature, fix ou tweak.

<!-- Formato:
## YYYY-MM-DD | Tipo | hash_commit
Descrição do que foi feito.
-->

## 2026-05-18 | Fix | sem commit

**Sparkline da última nota no início**

- Card de última nota passa a desenhar o sparkline em escala fixa de 0 a 100, evitando distorção visual quando as notas variam pouco.
- Linha usa apenas as notas recentes do histórico da tela inicial, em ordem cronológica.
- Design system documenta que sparklines de nota devem seguir escala percentual fixa.

---

## 2026-05-16 | Fix | sem commit

**Persistência do papel de administrador**

- Nova RPC `alterar_papel_usuario` centraliza a promoção e revogação de administradores.
- A alteração de papel deixa de depender de `UPDATE` direto em `profiles`, que era bloqueado pelo RLS e atualizava zero linhas sem erro visível.
- A tela de usuários passa a usar o perfil retornado pelo banco após a persistência.
- A regra de acesso documenta que papéis devem ser alterados pela RPC e que administradores não podem revogar o próprio acesso.

---

## 2026-05-16 | Infra | sem commit

**Histórico de migrations alinhado ao Supabase remoto**

- `supabase/migrations` foi sincronizado com o histórico real registrado no projeto remoto.
- Migrations locais duplicadas com timestamps antigos foram removidas do diretório ativo para evitar reaplicação indevida.
- `supabase db push --linked --dry-run` voltou a retornar `Remote database is up to date`.

---

## 2026-05-16 | Feature | sem commit

**Onboarding de novos usuários — tour inicial do dashboard**

- Nova tabela `user_onboarding_state` persiste status do onboarding por usuário, fluxo e versão com RLS e grants explícitos.
- Novo `OnboardingService` controla carregamento, avanço, retorno, pulo e conclusão do fluxo `dashboard_intro`.
- Novo `OnboardingTourComponent` compartilhado renderiza welcome com Poloca, spotlight desktop, bottom sheet mobile e fallback central.
- Welcome/final usam o Poloca raster (`funny.png`) em vez da versão vetorial inicial.
- Dashboard passou a orquestrar o onboarding e expõe alvos estáveis para Início, Simulados, Competitivo, Histórico e Perfil.
- CTA final direciona o aluno para o inicio do modulo de simulados, onde ele escolhe o tipo de treino.
- Storybook, testes unitários, docs de onboarding, design system, arquitetura, regras de negócio e inventário do Poloca atualizados.

---

## 2026-05-16 | Fix | sem commit

**Retomada de simulado personalizado e streak v2**

- Nova migration recria `retomar_tentativa` para remontar questões pela tabela `tentativa_resposta`, cobrindo provas regulares e simulados personalizados.
- `retomar_tentativa` preserva a ordem da tentativa com `ordem_na_tentativa` quando disponível.
- `get_streak_estudo_v2` foi recriada de forma mais defensiva para evitar falha ao inicializar estatísticas do usuário.
- Frontend ordena respostas retomadas pela ordem persistida da tentativa.
- Tela de execução passa a exibir a mensagem real de falha da retomada, em vez de sempre mostrar erro genérico de carregamento da prova.

---

## 2026-05-16 | Fix | sem commit

**Resultado pós-simulado com próximos passos de revisão**

- Tela de resultado agora destaca ações objetivas para revisar os erros, refazer em modo estudo e treinar o tema de menor aproveitamento.
- Empates entre temas com o menor aproveitamento agora são tratados como um conjunto de temas críticos, sem eleger um único tema arbitrariamente.
- Revisão aceita filtro `erros` e mostra apenas as questões respondidas incorretamente quando acionada a partir do resultado.
- Detalhe da prova passa a aceitar `modo=estudo` por query param para reduzir atrito no refazer guiado.
- `docs/business-rules.md` documenta a obrigatoriedade de próximos passos acionáveis após finalizar a tentativa.

---

## 2026-05-16 | Fix | sem commit

**Histórico com estados vazios e erros mais úteis**

- Histórico agora diferencia ausência de tentativas, filtros sem resultado e falhas de carregamento.
- KPIs, evolução e desempenho por tema exibem empty states acionáveis com CTA para começar simulado, limpar filtros ou tentar novamente.
- Filtros e insights só aparecem quando fazem sentido, evitando uma tela ambígua para quem ainda não concluiu tentativas.
- `docs/business-rules.md` documenta a necessidade de estados explícitos no histórico do aluno.

---

## 2026-05-16 | Fix | sem commit

**Continuidade de tentativa em andamento**

- `TentativaService` agora hidrata a tentativa ativa mais recente do usuário ao entrar no dashboard, mesmo após recarregar a página.
- Home e entrada de simulados passam a destacar um CTA de continuidade com progresso da tentativa em andamento ou pausada.
- Novo teste cobre a exibição do card de continuidade em `ProvasHomeComponent`.
- `docs/business-rules.md` documenta a priorização do fluxo de retomada.

---

## 2026-05-16 | Fix | sem commit

**Revisão de simulado personalizado — ordem das questões**

- Nova migration adiciona `tentativa_resposta.ordem_na_tentativa` para persistir a sequência sorteada das questões.
- RPC `gerar_simulado_personalizado` agora grava a ordem de cada questão usando `WITH ORDINALITY`.
- Visualização de simulado personalizado reordena as questões completas conforme a sequência da tentativa antes de renderizar a revisão.
- `database.types.ts` atualizado com a nova coluna.
- `docs/business-rules.md` documenta a regra de preservação da ordem sorteada na revisão.

---

## 2026-05-16 | Feature | sem commit

**Desafio diário — explicação após resposta**

- Hub competitivo agora exibe a explicação pedagógica da questão após o aluno responder o desafio diário.
- A explicação usa Markdown, mantendo o mesmo padrão visual das explicações de questões em modo estudo.
- Teste do `CompetirHubComponent` cobre a exibição da explicação quando o desafio respondido possui `explicacao`.
- `docs/business-rules.md` documenta a regra de explicação pós-resposta no desafio diário.

---

## 2026-05-16 | Feature | sem commit

**App do aluno — treino recomendado por tema fraco**

- Tela de resultado agora sugere um próximo treino com base no tema de menor aproveitamento da tentativa.
- Home e Histórico ganharam CTAs para treinar o tema fraco usando os dados de desempenho já carregados.
- Montagem de simulado aceita `temaId` ou `tema` via query params e pré-seleciona o tema recomendado.
- Treinos recomendados abrem em modo estudo com 10 questões por padrão.
- `docs/business-rules.md` documenta a regra de sugestão de treino após resultado.

---

## 2026-05-16 | Fix | sem commit

**Admin sidebar — footer estável**

- Corrigido o shell do admin para ocupar `100dvh` com overflow controlado.
- Sidebar agora mantém o footer (`Voltar ao app` e `Sair`) fixo dentro do viewport, enquanto o conteúdo principal rola separadamente.

---

## 2026-05-16 | Tweak | sem commit

**Admin Dashboard — visualização analítica**

### Frontend
- Dashboard admin redesenhado com KPIs compactos, ícones Lucide e layout responsivo.
- Uso de `ng2-charts`/Chart.js já instalados no app para gráficos de volume da plataforma, status das questões e movimento do dia.
- Novos sinais operacionais derivados do RPC `admin_get_stats`, incluindo banco publicado, fila editorial, tentativas por usuário e questões por prova.
- Painel de prioridades exibe alertas e sinais úteis para acompanhamento editorial e uso diário.

### Docs
- `docs/design-system.md` documenta o padrão de Admin Analytics.

---

## 2026-05-15 | Feature | 32e8198

**Módulo Competitivo — MVP completo**

### Frontend
- Nova rota autenticada `/dashboard/competitivo`
- Novo `CompetirHubComponent` com KPIs iniciais do módulo e ordem visual de implementação
- Sidebar e navegação mobile agora exibem o item `Competitivo` entre Simulados e Histórico
- Novo `GamificacaoService` com cache em signal para stats de XP
- Finalização de tentativa chama `conceder_xp_tentativa` e exibe toast de XP quando houver ganho
- Tela inicial agora exibe o KPI `XP da Semana` com nível e XP total
- Tela de perfil agora incorpora nível, XP, streak e placeholders de conquistas em uma seção única
- Rota antiga `/dashboard/perfil/competitivo` redireciona para `/dashboard/perfil`
- Tela inicial agora consome `get_streak_estudo_v2` e mostra recorde, protetores e próximo marco
- Perfil agora lista conquistas reais do catálogo MVP e diferencia bloqueadas/desbloqueadas
- Finalização de tentativa exibe toast quando uma conquista é desbloqueada
- Perfil ganhou controle de privacidade competitiva público/anônimo, salvo imediatamente
- Hub competitivo agora exibe ranking Global/Semana com posição do usuário
- Tela inicial ganhou `RankingStatusBarComponent` com posição global/semanal e XP da semana
- Tela inicial ganhou card de **Desafio Diário** com 3 estados: oculto (indisponível), CTA pendente, e feito (com XP ganho)

### Backend
- Migration `gamificacao_xp_base` com `gamificacao_evento`, `user_gamificacao_stats`, trigger de snapshot, RLS e RPCs `get_meu_xp`/`conceder_xp_tentativa`
- XP de tentativa segue cap diário de 500 XP, ignora modo visualização e usa chave idempotente por tentativa
- Migration `streak_v2_stats` preserva `get_streak_estudo`, adiciona `get_streak_estudo_v2` e atualiza streak/protetores no trigger de eventos
- Backfill inicial preenche streak atual, recorde e protetores a partir de tentativas já finalizadas
- Migration `conquistas_mvp` adiciona `conquista_catalogo`, `user_conquista`, seed de 5 conquistas iniciais e RPCs `get_minhas_conquistas`/`verificar_conquistas_usuario`
- `conceder_xp_tentativa` agora retorna conquistas recém-desbloqueadas
- Migration `perfil_competitivo_privacidade` adiciona `profiles.competir_publico` e sincroniza o snapshot `user_gamificacao_stats.competir_publico`
- Migration `ranking_competitivo_mvp` adiciona RPCs `get_ranking_global`, `get_ranking_semana` e `get_minha_posicao_ranking`
- Migration `ranking_is_me` reescreve `get_ranking_global/semana` com campo `is_me` e auto-inclui o usuário fora do top-N
- Migration `desafio_diario` cria tabelas `desafio_diario`/`desafio_diario_resposta`, RPCs `get_desafio_diario` e `responder_desafio_diario` com anti-cheat (campo `correta` omitido antes de responder) e XP idempotente
- Migration `conquistas_expandidas` adiciona 7 badges (streak_14/30, volume_25/50, precisao_80, desafio_diario_1/7) e expande `verificar_conquistas_usuario`
- Migration `security_perf_fixup` revoga acesso anon de todas as RPCs e adiciona índices nas FKs de `desafio_diario`, `desafio_diario_resposta` e `user_conquista`
- Migration `desafio_null_guard` adiciona validação de `p_alternativa_id IS NULL` na RPC de resposta

### Frontend (continuação — ranking, desafio e conquistas)
- Ranking com `is_me` destacado em azul e separador `···` entre posições não-consecutivas
- Seção "Desafio de hoje" com 4 estados: loading skeleton, indisponível, pendente e respondido (com correta/incorreta e estatística coletiva)
- `DesafioService` com parser robusto sem `any` e refetch pós-resposta para exibir `correta` nas alternativas

### Testes
- 33 novos testes (27 arquivos total, 372 testes): `desafio.service.spec.ts` (16), `competir-hub.component.spec.ts` (17)
- Fix dos mocks de `Profile` em `perfil.component.spec.ts` e `profile.service.spec.ts`

### Docs
- `docs/business-rules.md` documenta as primeiras regras de gamificação competitiva, Streak Freeze, conquistas MVP, opt-out e ranking

---

## 2026-05-13 | Feature | 1575d3f

**Páginas de erro — 404, 403 e 500**

Implementação das páginas de erro globais do frontend, com design amigável e tom médico.

### Frontend
- `ErrorStateComponent` (`shared/components/error-state/`) — componente reutilizável com badge colorido por código, ícone Lucide, título, mensagem, texto de detalhe em itálico e lista de ações configurável; acessível com `role="alert"`, `aria-live` e `aria-hidden` no ícone decorativo
- Página 404 `/` (wildcard) — "Página não diagnosticada": ícone `FileQuestionMark`, ações para voltar ao início e ver simulados
- Página 403 `/sem-permissao` — "Acesso restrito": ícone `ShieldAlert`, botão "Voltar" com fallback para `/dashboard` quando não há histórico de navegação
- Página 500 `/erro` — "Parada no servidor": ícone `ServerCrash`, botão de retry via `window.location.reload()`
- 404 dentro do shell autenticado (`/dashboard/**`) renderiza com sidebar e bottom-nav preservados
- Stories Storybook: `Erro404`, `Erro403`, `Erro500`, `SemAcoes`, `SemDetalhe`
- `app.routes.ts` atualizado — wildcards corrigidos em nível raiz e dentro do dashboard

---

## 2026-05-11 | Feature | 72146cb

**Módulo de Simulados — BoraMed (modelo Afya)**

Implementação completa do módulo central da plataforma: alunos acessam simulados autorais inspirados no modelo de avaliações médicas, com foco inicial em alunos da rede Afya.

### Frontend
- Página `/dashboard/provas` com cards por instituição
- Página `/dashboard/provas/afya` com listagem de simulados nacionais, filtros por tipo, período e ano (selects com truncamento)
- Página `/dashboard/provas/:id` (detalhe da prova) com contagem de questões e botão de iniciar
- Página `/dashboard/provas/:id/tentativa` (execução) com navegação entre questões, timer e pausa
- Página `/dashboard/provas/:id/resultado` com resumo de acertos, nota e distribuição por tema
- Componentes compartilhados: `ProvaCardComponent`, `QuestaoCardComponent`, `AlternativaItemComponent`, `ResultadoSummaryComponent`, `TentativaHeaderComponent`
- Componentes UI: `UiSelectComponent` com label, validação e dropdown acessível

### Backend (Supabase)
- 8 tabelas: `faculdade`, `prova`, `tema`, `questao`, `alternativa`, `questao_tema`, `tentativa`, `tentativa_resposta`
- RLS em todas as tabelas; tabelas de conteúdo apenas leitura para `authenticated`, sem acesso para `anon`
- 4 RPCs SECURITY DEFINER: `iniciar_tentativa`, `retomar_tentativa`, `pausar_tentativa`, `finalizar_tentativa`
- `finalizar_tentativa` idempotente: retorna resultado existente se já finalizada
- Seeds de demonstração: 1 faculdade, 3 temas, 3 provas, 5 questões com alternativas
- Todos os advisors de segurança resolvidos (auth_rls_initplan, missing index, bucket policy)
