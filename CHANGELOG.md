# Changelog

## 2026-06-27 | Feature | sem commit

**Novo módulo: Materiais de Estudo (APGs)**

- Módulo extensível de materiais de estudo: mural de categorias com cards, visualizador de PDF embutido, acesso gateado por assinatura.
- Banco: bucket privado `materiais` (Supabase Storage, 50 MB, somente PDF), tabelas `material_categoria`, `material_topico` (preparado para UI futura) e `material_arquivo` com RLS completo via `tem_assinatura_ativa()`. Migration em `supabase/migrations/20260627120000_materiais_estudo.sql`.
- Frontend (aluno): rota `/dashboard/materiais` (mural) e `/dashboard/materiais/:categoriaSlug` (lista de PDFs + viewer). PDF exibido em iframe com `#toolbar=0&navpanes=0` via signed URL temporária (TTL 1h). Protegido pelo `lazySubscriptionGuard` do dashboard pai.
- Frontend (admin): `/admin/materiais` com CRUD de categorias e upload/gerenciamento de PDFs por categoria. Exclusão de arquivo remove também do storage.
- Novos componentes shared (com Storybook): `MaterialCardComponent`, `PdfViewerComponent`, `PdfUploadComponent`.
- Novo serviço `MaterialService` + métodos de materiais no `AdminService`.
- Link "Materiais" adicionado ao menu do dashboard e ao sidebar admin.
- ADR-028 adicionado em `docs/architecture.md`; seção "Materiais de Estudo" adicionada em `docs/business-rules.md`.

---

## 2026-06-25 | Fix | sem commit

**Correcoes de pre-producao no admin**

- Admin de questoes passa a validar alternativas preenchidas antes de salvar, impedindo questao objetiva ativa sem gabarito valido.
- Impressao de simulados zera o offset da sidebar em `@media print`, evitando coluna branca e conteudo espremido no Safari/iPad sem alterar a visualizacao normal no desktop.
- Drawer de questoes de uma prova agora carrega inicialmente respeitando o filtro visivel de status e o formato da prova aberta.
- Importacao de disciplinas transforma siglas duplicadas em erro de validacao, cobrindo duplicatas ja cadastradas e duplicatas no proprio lote.
- Admin de usuarios passa a usar paginacao server-side e busca normalizada, evitando carregar todos os perfis de uma vez e reduzindo falhas com caracteres especiais no filtro.
- Build pode ser executado tambem a partir da raiz do repositorio via scripts que delegam para `frontend/`, evitando falha `ENOENT` por ausencia de `package.json` no diretorio raiz.
- Landing page divide estilos de secoes grandes em stylesheets dedicados e remove CSS legado nao usado, eliminando o warning de budget `anyComponentStyle` no build.
- Logout passa a redirecionar de forma centralizada para `/login` no `AuthService`, com limpeza imediata de usuario/cache local e fallback pelo evento `SIGNED_OUT`.
- Desafio diario passa a renderizar imagens e legendas de questoes, cobrindo questoes de laboratorio no hub competitivo.

---

## 2026-06-23 | SEO | sem commit

**Fundação técnica de SEO + motor de conteúdo indexável**

- Novo `core/seo/seo.service.ts` (SSR-safe) + `seo.config.ts`: centraliza title, description, robots, canonical, Open Graph, Twitter e blocos JSON-LD por rota. Helpers para `WebSite`+`SearchAction` (sitelinks search box), `Organization`, `BreadcrumbList`, `Article`, `FAQPage` e `ItemList`.
- Páginas que herdavam o meta da landing (login, cadastro, termos, privacidade) agora têm **title/description/canonical próprios** — fim do conteúdo duplicado.
- Landing refatorada para usar o `SeoService`; passa a emitir `WebSite`+`SearchAction` e `Organization` (antes ausentes). Título encurtado para < 60 caracteres.
- **Motor de conteúdo** `(marketing)/guias/`: hub `/guias` + 4 guias autorais pré-renderizados (`/guias/:slug`) atacando buscas reais ("como estudar para prova de medicina", "simulado de medicina", "questões de medicina por especialidade", "avaliação nacional de medicina"). Conteúdo data-driven em `guias.data.ts` — novo guia entra sozinho no sitemap e na pré-renderização.
- Sitemap dinâmico (`scripts/generate-sitemap.mjs`, hook `prebuild`): enumera rotas públicas + guias automaticamente. `robots.txt` ampliado com as rotas privadas/transacionais.
- Conteúdo segue a regra de independência: **não referencia marca de instituição** em metadados, URLs ou structured data.

---

## 2026-06-22 | Pagamentos | sem commit

**Unicidade de assinatura ativa (B5) + mapeamento de estorno recorrente (D4)**

- Nova migration `20260622130000_unicidade_assinatura_ativa.sql`: índice único parcial `assinatura (user_id) WHERE status='authorized'` (com normalização dos dados existentes), fechando a corrida que podia criar duas assinaturas ativas e inflar MRR.
- `mp-webhook`: ao conceder/renovar acesso (preapproval autorizado e acesso único aprovado), passa a **superar** (cancelar) as assinaturas `authorized` anteriores do usuário — mantém no máximo uma ativa e evita que o índice bloqueie reassinatura legítima após o semestral expirar (que permanece `authorized`).
- `mp-webhook`: branch `subscription_authorized_payment` agora mapeia `refunded`/`charged_back` (antes virava `pending`), refletindo estornos no financeiro. Acesso recorrente não é revogado por uma parcela estornada.
- **Aplicar em produção:** rodar a migration e redeploy da function `mp-webhook`.

---

## 2026-06-22 | Pagamentos | sem commit

**Revisão pré-produção do fluxo de pagamento — correções de UX e cobrança dupla**

- `mp-criar-assinatura`: bloqueio de reassinatura (409) enquanto houver acesso ativo, incluindo assinatura `cancelled` ainda em carência (`proxima_cobranca` futura). Evita criar um novo preapproval que cobraria de novo sobre o período já pago (cobrança dupla).
- `/assinatura/retorno`: novo estado "Pagamento não aprovado". A tela lê `status`/`collection_status` da back_url e, em `rejected`/`failure`/`cancelled` (após uma confirmação no servidor para evitar falso-negativo de corrida com o webhook), mostra mensagem clara e CTA "Tentar novamente" — antes, cartão recusado caía em "em processamento".
- `/dashboard/assinatura`: estado `paused` agora exibe aviso de pausa e botão "Reativar assinatura" (paused→authorized via `mp-gerenciar-assinatura`); "Assinar novamente" fica oculto durante a carência para não induzir cobrança dupla.
- Doc `docs/analise-pagamentos.html` atualizado (B4, U5, U6, U7, D3, D4). Verificado no banco de produção que `plano` já usa IDs do Mercado Pago de produção e que não há dados de teste residuais.
- **Pendente:** confirmar secrets de produção das functions (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `APP_URL`, `APP_ALLOWED_ORIGINS`); índice único parcial `(user_id) WHERE status='authorized'` (B5); notificações de ativação/cobrança recusada (U7); mapear `refunded` na parcela recorrente (D4). Deploy das edge functions necessário para as mudanças de backend valerem.

---

## 2026-06-20 | Pagamentos | sem commit

**Integração Mercado Pago — assinaturas recorrentes + paywall total**

- Nova migration `20260620120000_planos_assinaturas_pagamentos.sql`: tabelas `plano`, `assinatura` e `pagamento` com RLS (aluno só lê as próprias; escrita de assinatura/pagamento apenas via service role), trigger `set_atualizado_em`, helper `tem_assinatura_ativa()` (SECURITY DEFINER, admin sempre passa) e seed dos planos mensal/anual.
- Três edge functions: `mp-criar-assinatura` (autenticada — devolve o `init_point` do plano com `external_reference`), `mp-webhook` (pública, `verify_jwt=false` — valida `x-signature` HMAC-SHA256 e faz upsert de assinatura/pagamento; fonte da verdade do status) e `mp-gerenciar-assinatura` (cancelar/pausar via `PUT /preapproval/{id}`). Helpers de CORS/JSON em `functions/_shared/cors.ts`.
- Frontend: `SubscriptionService` + `subscription.types.ts`; `lazySubscriptionGuard` (paywall total em `/dashboard`, bypass admin, consulta RPC autoritativa); rotas `/planos` e `/assinatura/retorno`; tela `/dashboard/assinatura` (gerenciar e histórico). `mercadoPagoPublicKey` adicionada aos environments (reservada para futura migração a CardForm).
- Modelo: assinatura recorrente *com plano associado*, checkout por redirecionamento (sem manuseio de cartão no app). Planos de TESTE (sandbox) criados no Mercado Pago. **Pendente para produção**: ativar credenciais MP, recriar planos com token de produção, definir preços finais, configurar webhook + secret e fazer deploy das migrations/functions (ver ADR-025).

---

## 2026-06-18 | Backend | sem commit

**Fuso de Brasília na API e `atualizado_em` nas entidades de questão**

- Nova migration `20260618140000_fuso_horario_brasil_api.sql`: define `timezone = America/Sao_Paulo` nos papéis da API (`authenticator`, `anon`, `authenticated`, `service_role`). Colunas `timestamptz` seguem armazenadas em UTC; muda apenas a apresentação, fazendo `criado_em`/`atualizado_em` retornarem com offset `-03:00` (hora exata do Brasil).
- Nova migration `20260618150000_atualizado_em_entidades_questao.sql`: adiciona `atualizado_em` (com trigger `update_atualizado_em()` em BEFORE UPDATE) a `disciplina`, `tema`, `prova` e `alternativa`. `alternativa` ganha também `criado_em`. Linhas existentes recebem `atualizado_em = criado_em`.

---

## 2026-06-15 | Performance | sem commit

**Navegação sem espera bloqueante e com feedback**

- Barra de progresso global no topo (`app-root`) acende durante a navegação do router (guards lazy + download de chunks) e durante carregamentos de dados de página, eliminando a navegação "travada sem feedback".
- Novo `NavigationProgressService` centraliza o estado de carregamento; páginas registram seus fetches via `track()`.
- `app.config.ts` passa a pré-carregar os chunks lazy em background (`withPreloading(PreloadAllModules)`) e habilita `withViewTransitions()`.
- **Nenhuma rota logada bloqueia mais a navegação.** Todos os resolvers foram removidos (`inicio`, `historico`, `provas-afya`, `montar-simulado`, `prova-visualizar`): as páginas navegam instantaneamente e carregam os dados no próprio componente, com skeleton/barra enquanto chegam. `inicio` e `historico` usam stale-while-revalidate (cache aplicado na hora em revisitas).
- O bloqueio só faria sentido em página pública/SEO; a única candidata (landing) é estática e não busca dados, então segue sem resolver.
- Novo método `ProvaService.getQuestoesRevisao()` encapsula os RPCs de revisão (antes chamados direto no resolver).
- `ProfileService.loadProfile()` passa a deduplicar chamadas concorrentes (guard + effect do dashboard no load inicial).
- Imagens de questão (lâminas) passam a usar `loading="lazy"` + `decoding="async"`: num simulado com muitas questões, as imagens não baixam mais todas de uma vez.
- Gráfico de evolução do histórico carregado via `@defer (on viewport)`: o `chart.js` (~440 kB) sai do caminho de carregamento da página e só é baixado quando o gráfico entra na tela.

---

## 2026-06-14 | Feature | sem commit

**Suspensão administrativa de usuários**

- Admin de usuários passa a permitir suspender e reativar contas, com motivo opcional e status visível na listagem.
- Ações da lista de usuários passam a usar botões apenas com ícones, com tooltip no hover/foco explicando cada opção.
- Nova migration `20260614151017_admin_banir_usuario.sql` adiciona campos de suspensão em `profiles`, RPCs `admin_banir_usuario`/`admin_desbanir_usuario`, `is_banned` e policies restritivas para bloquear tabelas fora do suporte.
- `is_admin()` e `is_super_admin()` deixam de considerar perfis suspensos, impedindo privilégios administrativos durante a suspensão.
- Rotas privadas redirecionam usuários suspensos para `/conta-suspensa`, página fixa em português formal com acesso apenas ao suporte e opção de sair.
- Atualizados `docs/business-rules.md`, `docs/architecture.md` e `database.types.ts`.

---

## 2026-06-14 | UX | sem commit

**Ações finais do resultado de simulado**

- Resultado passa a exibir `Imprimir com gabarito` e `Revisar e anotar` na mesma linha final.
- O CTA primário colorido `Revisar e anotar` fica à direita, enquanto impressão ocupa a ação secundária à esquerda.
- Atualizados `docs/business-rules.md` e `docs/design-system.md`.

---

## 2026-06-13 | Feature | sem commit

**Anota??es por quest?o em revis?o de tentativa**

- Alunos agora podem criar anota??es privadas por quest?o dentro da revis?o de uma tentativa finalizada; a mesma quest?o em outro simulado n?o herda a anota??o.
- Nova tabela `tentativa_questao_anotacao` com RLS, grants expl?citos para Data API e unicidade por `user_id + tentativa_id + questao_id`.
- Novas RPCs: `get_revisao_tentativa`, `listar_anotacoes_tentativa`, `salvar_anotacao_questao` e `excluir_anotacao_questao`.
- Resultado passa a abrir a revis?o pela rota `/dashboard/simulados/:provaId/tentativa/:tentativaId/revisao`, preservando filtro de erros e contexto da tentativa.
- Frontend adiciona painel colaps?vel de anota??o por quest?o, com autosave, contador, estado de salvamento e exclus?o.
- Atualizados `docs/business-rules.md`, `docs/design-system.md`, `docs/architecture.md` e `database.types.ts`.

---

## 2026-06-12 | Feature | sem commit

**Exclusão de provas, questões, disciplinas e temas preservando histórico do aluno**

- Provas agora podem ser deletadas mesmo com tentativas vinculadas: trigger grava snapshot (nome/tipo/origem/formato) em `tentativa.prova_snapshot`, o FK vira `SET NULL` e o histórico/resultado/retomada do aluno seguem funcionando.
- Questões com respostas de alunos ou uso em desafio diário recebem soft delete (`status='deletada'`): saem do banco de questões, das provas e dos sorteios, mas a revisão dos alunos permanece intacta. Questões nunca usadas são removidas fisicamente.
- Disciplinas e temas podem ser deletados sempre: questões/temas ficam sem disciplina (`SET NULL`), subtemas sobem para o pai do tema removido e `qtd_questoes` das provas afetadas é recalculado.
- Novas RPCs SECURITY DEFINER com checagem `is_admin()`: `admin_deletar_prova`, `admin_deletar_questao`, `admin_deletar_disciplina`, `admin_deletar_tema`; `admin.service.ts` deixou de fazer guards client-side.
- Modais de confirmação do admin explicam o impacto real de cada exclusão e os toasts informam quantas tentativas/respostas foram preservadas ou vínculos desfeitos.
- Histórico do aluno exibe selo "prova removida" com o nome vindo do snapshot; página de resultado oculta ações de revisar/refazer quando a prova não existe mais e mostra aviso de que o desempenho continua salvo.
- Migration `20260612220000_exclusao_entidades_preserva_historico.sql`; `docs/business-rules.md` atualizado (seção Integridade de Dados).

---

## 2026-06-12 | Feature | sem commit

**Anexos e reabertura no suporte**

- Widget de suporte permite anexar at? 3 imagens/v?deos na abertura do chamado e nas respostas do usu?rio.
- Anexos exibem estado visual de upload com spinner, linha "Enviando anexos..." e controles travados enquanto o envio esta em andamento.
- Spinner dos anexos no suporte passa a girar corretamente durante o envio de arquivos, exibindo apenas um indicador no estado de envio.
- Chamados resolvidos podem ser reabertos pelo dono do ticket ou por administradores; a reabertura volta o status para `aberto` e registra uma mensagem no hist?rico.
- Painel admin exibe anexos no hist?rico do ticket com links assinados para abrir os arquivos privados.
- Painel admin de suporte passa a usar layout responsivo: master-detail em telas largas e lista/detalhe alternados em larguras compactas, com filtros, conversa, anexos, resposta e FAQ adaptados ao mobile.
- Novas migrations criam bucket privado `suporte-anexos`, tabela `suporte_anexos`, policies de Storage/RLS e RPCs `buscar_anexos_ticket`/`registrar_anexos_mensagem`/`reabrir_ticket`.
- `docs/architecture.md` documenta a decisao de manter evidencias de suporte em bucket privado com URLs assinadas temporarias.
- `docs/business-rules.md` documenta o ciclo de vida de chamados reabertos.

---

## 2026-06-12 | UX | sem commit

**Hub de simulados mais denso**

- `/dashboard/simulados` deixa o grid de dois cards pequenos e passa a usar cards de ação em largura total, empilhados com separador de decisão entre treino nacional pronto e montagem personalizada.
- Cards receberam mais preenchimento visual com altura mínima, blocos informativos, linha de atributos, CTA lateral com ícone e bordas de acento para ocupar melhor o espaço útil sem parecer landing page.
- O card de Treinos nacionais mantém o degradê institucional anterior; Montar simulado segue em superfície branca sem degradê.
- Em larguras abaixo de `lg`, os cards ficam mais enxutos: blocos grandes dão lugar a chips compactos e o CTA ocupa o rodapé inteiro.
- `docs/design-system.md` documenta o padrão do hub de simulados.

---

## 2026-06-11 | UX | sem commit

**Admin responsivo no mobile**

- Shell admin passa a usar drawer lateral em telas estreitas, com botão de menu no topbar, backdrop, botão de fechar e fechamento ao navegar.
- Dashboard, listagens, importação e fluxos de Questões/Provas receberam ajustes mobile: padding menor, toolbars/formulários empilhados, tabelas com rolagem horizontal controlada e drawers em tela cheia.
- `docs/design-system.md` documenta os padrões de responsividade do admin.

---

## 2026-06-09 | Segurança | sem commit

**Hardening pré-produção (fase 2 — Crítico 1: gabarito)**

Política: gabarito/explicação são segredo até o aluno finalizar a prova (admin vê sempre).

- **Banco:** revogada a leitura das colunas de resposta (`alternativa.correta`, `questao.{resposta_correta_texto,respostas_aceitas,explicacao,explicacao_alternativas}`) de `authenticated` — feito via `REVOKE SELECT ON tabela` + `GRANT SELECT (colunas seguras)`, porque revoke de coluna não tem efeito com SELECT a nível de tabela. `anon` já não lia essas tabelas. Fecha REST e GraphQL, inclusive durante simulado. Migration `20260609130000` (+ correção de grants).
- **RPC `get_revisao_prova`:** revisão do aluno só devolve o gabarito de provas que ele já finalizou (admin sempre). `SECURITY DEFINER`, EXECUTE só para `authenticated`.
- **RPC `admin_get_questao`:** editor de questões lê a questão completa (com gabarito) validando `is_admin()`.
- **Frontend:** resolver de revisão e `admin.service.buscarQuestaoCompleta` passam por RPC; selects admin sem `*`; código morto (`prepararVisualizacao*`) repontado para a RPC; removido o link aberto "Só quero ver as questões e o gabarito" do prova-detalhe; `database.types.ts` atualizado.
- **Verificação:** confirmado no banco que `authenticated` não lê mais `correta`/`explicacao`; a RPC entrega o gabarito a quem tem tentativa finalizada e bloqueia quem não tem.

---

## 2026-06-09 | Segurança | sem commit

**Hardening pré-produção (fase 1 — Crítico 2 + Médios/Baixos seguros)**

Baseado em `AUDITORIA_SEGURANCA.md`. Crítico 1 (gabarito) e Storage→signed URL ficaram para uma fase com smoke test dedicado.

- **CRÍTICO 2 — fim do farm de XP/nota forjada:** revogada escrita direta (`INSERT/UPDATE/DELETE`) de `authenticated` em `tentativa`/`tentativa_resposta` e removidas as policies de escrita. Toda escrita segue exclusivamente pelas RPCs `SECURITY DEFINER`. Migration `20260609120000_seguranca_bloquear_escrita_tentativa.sql`.
- **Ranking não desanonimiza perfil privado:** `get_ranking_global/_semana` mascaram `user_id` (NULL) quando o perfil é privado e não é o próprio usuário. Frontend ajustado (`RankingItem.user_id: string | null`, parser tolerante a NULL, `trackBy` por `posicao`). Migration `20260609120100`.
- **Open redirect** em `/auth/callback` corrigido (`server.ts` + `auth-callback.component.ts`): bloqueia `//evil.com`.
- **Headers de segurança** em `vercel.json`: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS. (CSP deferida para a fase de teste.)
- **Refresh token de admin** não é mais persistido em `sessionStorage` durante impersonação; saída re-autentica o admin.
- **Edge function `admin-impersonate`:** auditoria gravada com `await` antes de emitir o token (aborta se falhar); CORS travável por `APP_ALLOWED_ORIGINS`.
- **Endurecimento de banco:** revogados grants legados (`TRUNCATE/TRIGGER/REFERENCES` + DML do `anon` em `profiles`/`notificacoes`); `pg_temp` adicionado ao `search_path` de 6 funções definer; leitura do log de impersonação restrita a `super_admin`. Migrations `20260609120200`/`20260609120300`/`20260609120400`.
- **config.toml:** `minimum_password_length=8` + `password_requirements="letters_digits"`.
- **Pendências de dashboard/deploy:** habilitar HIBP e política de senha em produção; `deploy` da edge function; definir secret `APP_ALLOWED_ORIGINS`.

---

## 2026-06-08 | UX | sem commit

**Dashboard inicial redesenhado (layout bento)**

- `InicioComponent` reescrito do zero com um layout *bento* de blocos grandes e chamativos: hero, anel de progresso de nível/XP, gráfico de barras de evolução das notas, desafio do dia em destaque, anéis (gauges) de acerto geral e última nota, blocos de simulados concluídos e ranking, trajetória recente e bloco lateral de reforço de tema/streak.
- Anéis SVG (gauges) com gradiente, faixas de acento no topo dos cards, entrada escalonada (`bento-rise`), desenho animado dos anéis (`gauge-draw`) e crescimento das barras (`bar-grow`) — tudo respeitando `prefers-reduced-motion`.
- Progresso de nível derivado honestamente da fórmula do backend (`nivel = floor(sqrt(xp/100))`), sem inventar curva.
- Thresholds de cor (≥70 sucesso / ≥50 atenção / <50 perigo) centralizados em `varianteNota()` e reaproveitados por anéis, barras e badges.
- `greeting-hero` mantido e reaproveitado como hero. Componente órfão `ranking-status-bar` (só usado na início) removido junto com sua story. `kpi-card` deixa de ser usado na início, mas permanece em Histórico/Admin.
- `docs/design-system.md` documenta o padrão Dashboard Inicial (Bento).

---

## 2026-06-08 | Tweak | sem commit

**Provas prontas apenas nacionais**

- A lista de provas prontas (`/dashboard/simulados/rede-afya`) passa a ignorar formatos processual e laboratório, mantendo somente treinos nacionais mesmo quando houver query param legado.
- Removidos os atalhos visuais para processual e laboratório nessa lista; esses formatos ficam restritos ao fluxo de montar simulado.
- `docs/business-rules.md` documenta a separação entre provas prontas nacionais e montagem personalizada processual/laboratório.

---

## 2026-05-27 | Fix | sem commit

**Limpeza de advisors Supabase**

- Corrigidos warnings remotos plausiveis do Security/Performance Advisor: `search_path` fixo em RPCs de avisos/notificacoes, remocao de listagem ampla dos buckets publicos `avisos` e `questao-imagens`, consolidacao da policy de SELECT em `avisos`, e revogacao de EXECUTE direto em `is_super_admin`/`sync_ultimo_login`.
- Mantidos warnings de RPCs `SECURITY DEFINER` autenticadas que fazem parte do contrato do frontend e validam permissao internamente.
- `Leaked Password Protection` permanece dependente de configuracao do Auth no painel/plano Supabase, fora de migration SQL.

---

## 2026-05-27 | Fix | sem commit

**Desafio diario sem coluna de dificuldade**

- Nova migration redefine `get_desafio_diario` sem ler `questao.dificuldade`, coluna removida do schema em `20260520180000_remover_dificuldade_e_campos_prova.sql`.
- Contrato TypeScript do desafio diario e mocks de teste deixam de esperar `dificuldade` na questao.
- `docs/business-rules.md` documenta que o desafio diario nao depende mais de dificuldade.

---

## 2026-05-24 | UX | sem commit

**Melhoria de navegação e orientação do usuário**

- Criado componente reutilizável `PageHeaderComponent` com breadcrumbs contextuais e subtítulo em `shared/components/page-header/`.
- Breadcrumbs adicionados em: Histórico, Perfil, Suporte, Simulados (home, treinos nacionais, montar simulado, detalhes da prova).
- Bottom nav (mobile): indicador visual de barra superior na rota ativa com gradiente.
- Admin sidebar: barra lateral branca na rota ativa para melhor distinção.
- Atalho "Ir para o Suporte →" adicionado ao final da página de Perfil.
- Links de retorno manuais (`← Simulados`) substituídos por breadcrumbs consistentes.
- Subtítulos contextuais nas páginas principais para o usuário entender o que pode fazer.
- Imports não utilizados removidos (ChevronLeft, UiIconComponent, RouterLink) das páginas refatoradas.

---

## 2026-05-24 | Perf | sem commit

**Prefetch, cache e skeletons para percepção de velocidade**

- `PrefetchService` criado: após login ou auth-callback, carrega os chunks das rotas mais prováveis (`dashboard`, `simulados`, `historico`, `perfil`) durante idle time via `requestIdleCallback`.
- `CacheService` criado: cache leve em memória + `sessionStorage` com TTL de 5 min (stale-while-revalidate).
- Resolvers `inicioResolver` e `historicoResolver` agora retornam dados cacheados instantaneamente quando disponíveis e frescos, eliminando espera na navegação interna.
- Cache é limpo automaticamente no `signOut`.
- `SkeletonComponent` reutilizável adicionado a `shared/components/` com variantes `text`, `card`, `kpi`, `row`.
- Nenhum dado sensível é cacheado além do necessário para UX. Rotas admin e fluxos raros não são pré-carregados.

---

## 2026-05-23 | Perf | sem commit

**Otimizacao de imagens e compressao de uploads**

- Imagens estaticas convertidas de PNG/JPG para WebP com redimensionamento adequado ao uso na UI.
- Peso total de imagens em `frontend/public` reduzido de ~6.2 MB para ~437 KB (economia de 93%).
- Utilitario `image-compress.util.ts` criado para pre-processamento de imagens no cliente antes de upload.
- Uploads de questoes, avatares e avisos agora comprimem automaticamente para WebP (max 1200px, qualidade 82%).
- Logo para email otimizada separadamente (PNG, 2 KB) por compatibilidade com clientes de email.
- Imagens originais pesadas removidas do deploy.

---

## 2026-05-23 | Tweak | sem commit

**Warning CommonJS do Supabase SSR**

- `cookie` foi adicionado ao allowlist de CommonJS do build Angular.
- O pacote e usado internamente por `@supabase/ssr@0.10.3`, que ja esta na versao mais recente disponivel.
- O build passa a alertar apenas novos CommonJS nao auditados, mantendo este caso conhecido documentado.

---

## 2026-05-23 | Tweak | sem commit

**Fonte externa simplificada**

- Import global de fontes passou a carregar apenas Inter.
- Playfair Display foi removida do CSS global, evitando uma familia externa usada em apenas um titulo.
- Painel visual de auth foi alinhado ao Inter com peso maior, mantendo hierarquia sem custo adicional de fonte.

---

## 2026-05-23 | Feat | sem commit

**Sistema de notificacoes e avisos broadcast**

- Migration `20260523000001_sistema_notificacoes.sql`: tabelas `notificacoes`, `avisos` e `avisos_vistos` com RLS, indices e RPCs.
- Storage bucket `avisos` (publico, limite 5 MB, JPEG/PNG/WebP/GIF) com policies de leitura publica e escrita restrita a admin.
- RPCs: `buscar_avisos_pendentes`, `marcar_aviso_visto`, `buscar_notificacoes`, `marcar_notificacao_lida`, `marcar_todas_notificacoes_lidas`, `admin_listar_avisos`.
- `AvisoService`: carrega avisos pendentes na entrada do dashboard (pula durante impersonacao), remove do estado local apos marcar como visto.
- `AppNotificacaoService`: gerencia notificacoes in-app por usuario com signals; estrutura pronta para receber novos tipos futuros.
- `AvisoModalComponent`: modal fullscreen com imagem + texto opcional, tecla Esc, fecha e marca como visto automaticamente.
- `NotificacoesSinoComponent`: sino com badge de nao lidas, dropdown animado, "marcar todas como lidas"; fecha ao clicar fora.
- Stories Storybook para ambos os componentes (`ComTexto`, `SomenteImagem`, `Vazio` / `ComNaoLidas`, `TodasLidas`, `Vazia`).
- `AdminAvisosComponent` em `/admin/avisos`: CRUD completo com upload de imagem para bucket, toggle ativo/inativo e preview instantaneo.
- Rota `/admin/avisos` adicionada ao `admin.routes.ts`; item "Avisos" adicionado ao menu lateral do admin.
- Dashboard integrado: `AvisoModalComponent` e `NotificacoesSinoComponent` montados no shell; sino visivel no header mobile.

---

## 2026-05-23 | Tweak | sem commit

**Imagens da landing otimizadas**

- Imagens principais da landing foram convertidas de PNG para JPEG redimensionado.
- Payload dos assets usados na landing caiu em aproximadamente 4.2 MB.
- Hero passou de `heroImage.png` com ~841 KB para `hero-image.jpg` com ~84 KB.
- Cards de modos e imagem de performance passaram a usar arquivos entre ~78 KB e ~190 KB.
- Assets PNG antigos da landing foram removidos do deploy apos troca das referencias.
- Placeholder institucional antigo, sem uso no app, foi removido de `public/landing-page`.

---

## 2026-05-23 | Tweak | sem commit

**Landing e SSR com menos custo de renderizacao**

- CSS da landing foi reduzida abaixo do budget de 20 kB por componente.
- Removidas texturas SVG inline e animacoes decorativas continuas que nao traziam valor direto ao usuario.
- Listener de scroll da landing passou a usar `requestAnimationFrame`, reduzindo trabalho em eventos frequentes.
- Imagens da landing ganharam `decoding="async"` para reduzir bloqueios de decodificacao.
- Header mobile do dashboard deixou de carregar `logotipo.png` de ~2 MB, passou a reutilizar `logo.png`, e o asset antigo foi removido do deploy.
- `SupabaseService` deixou de importar diretamente o pacote CommonJS `cookie`; o aviso restante vem do `@supabase/ssr`.

---

## 2026-05-23 | Tweak | sem commit

**Bundle inicial com auth e dashboard lazy**

- Bootstrap do Angular deixou de inicializar AuthService/Supabase antes da primeira rota protegida.
- Guards de auth, guest e admin passam a carregar a sessao sob demanda e de forma idempotente.
- Rotas internas do dashboard foram movidas para `dashboard.routes.ts`, mantendo resolvers e telas protegidas fora do chunk inicial.
- Bundle inicial do build de producao caiu de 638.85 kB para 396.21 kB, removendo o warning de budget inicial de 500 kB.
- Build e suite unitaria passaram apos a mudanca, com 393 testes executados.

---

## 2026-05-23 | Fix | sem commit

**Carregamento da lista de provas**

- Corrigida a query de listagem de provas para deixar de ordenar pela coluna removida `edicao`.
- Listagem passa a ordenar por `criado_em` e `subtipo`, ambos existentes no schema atual.
- Adicionado teste em `ProvaService` para impedir regressao com ordenacao por coluna removida.

---

## 2026-05-23 | Tweak | sem commit

**Melhorias de performance, historico e testes**

- Bundle inicial do build de producao reduzido ao mover Markdown e Chart.js/ng2-charts para providers locais das telas que usam esses recursos.
- Historico passa a oferecer filtro de laboratorio junto de nacional e processual.
- Textos visiveis de simulados foram ajustados para reforcar treinos autorais e reduzir risco de leitura como vinculo institucional.
- Specs foram alinhadas aos modelos atuais de prova, perfil, questao e onboarding; suite unitaria voltou a passar com 392 testes.
- Arquitetura e regras de negocio documentam o carregamento lazy de dependencias ricas e os filtros atuais do historico.

---

## 2026-05-21 | Tweak | sem commit

**Logo menor na sidebar logada**

- Reduzida a logo da sidebar desktop da area logada para `2.25rem`.
- Marca da sidebar alinhada a esquerda no topo com recuo discreto.
- Ajustado o espacamento inicial da navegacao para manter a sidebar compacta.
- Design system atualizado com a escala atual da logo na navegacao desktop.

---

## 2026-05-17 | Docs | sem commit

**Landing page BoraMed**

- Criado `docs/landing-page/design.json` com analise estrutural da landing de referencia da Salte e traducao para a identidade BoraMed.
- Criado `docs/landing-page/boramed-landing-agent-prompt.md` com prompt pronto para gerar uma landing responsiva, com SEO, placeholders de imagem e guardrails de posicionamento.
- Implementada landing publica na rota raiz com hero, mockup de produto, secoes de treinos, tabs de solucao, timeline, FAQ, CTA final e SEO.
- Aplicadas as imagens adicionadas em `frontend/public/landing-page` no card de Treinos Nacionais e no bloco institucional da landing.
- Hero principal usa um frame de janela estilo macOS com mockup limpo em HTML/CSS, evitando reaproveitar a foto de estudo como imagem principal.
- Removido o formulario/lista de e-mails da hero; CTA principal agora direciona direto para cadastro.
- Ajustado layout da hero para texto centralizado com largura confortavel e mockup abaixo em largura ampla.
- Landing deixa de usar Playfair Display na hero e passa a usar Inter em toda a pagina.
- Reduzida a escala dos headings da landing para melhorar legibilidade e ritmo visual.
- Headline da hero reformulada em duas linhas curtas para melhorar leitura acima da dobra.
- Removida a imagem de estudante do card inicial de Treinos Nacionais para impedir que ela seja percebida como imagem da hero.
- Hero passa a renderizar `/landing-page/heroImage.png` dentro do frame estilo janela do macOS.
- Orçamento de CSS por componente no build foi ajustado para acomodar a landing completa sem forçar cortes visuais artificiais.
- A especificacao reforca que o BoraMed e plataforma independente, com questoes autorais no modelo das avaliacoes, sem sugerir vinculo oficial ou acervo Afya.

---

> Registro de todas as alterações do projeto.
> Atualizado automaticamente ao final de cada feature, fix ou tweak.

<!-- Formato:
## YYYY-MM-DD | Tipo | hash_commit
Descrição do que foi feito.
-->

## 2026-05-21 | Fix | sem commit

**Isolamento de dados em sessão impersonada**

- Histórico passa a filtrar tentativas explicitamente pelo `user_id` do usuário autenticado.
- Fluxos de tentativa personalizada e nota anterior também passam a restringir leituras ao usuário atual.
- Salvamento de resposta passa pela RPC `salvar_resposta_tentativa`, que valida o dono da tentativa antes de atualizar `tentativa_resposta`.
- Impersonação valida que a sessão trocada corresponde ao usuário alvo antes de exibir o banner de acesso incorporado.
- Regras de negócio documentam o escopo obrigatório das telas de aluno em impersonação.

---

## 2026-05-20 | Feature | sem commit

**Priorização de questões inéditas no montar simulado**

- RPC `gerar_simulado_personalizado` passa a consultar o histórico do usuário em `tentativa_resposta` antes do sorteio.
- Questões ainda não entregues ao usuário são priorizadas dentro dos filtros de formato e tema.
- Quando as questões inéditas acabam, o sorteio completa a quantidade com questões já vistas em ordem aleatória.
- Adicionado índice em `tentativa` para acelerar a leitura do histórico por usuário.
- Geração da prova sintética do simulado ganhou retry para evitar colisão de `edicao` em gerações muito próximas.
- Regras de negócio documentam a política de anti-repetição em simulados personalizados.

---

## 2026-05-20 | Tweak | sem commit

**Ícones nas ações dos CRUDs admin**

- Ações de visualizar, editar e deletar nas tabelas administrativas passam a usar ícones em vez de texto.
- Admin de questões usa `Eye`, `Pencil` e `Trash2` nas ações de linha.
- Admin de provas, disciplinas e temas usam botões compactos com ícones para ações repetidas.
- Design system documenta o padrão de ações por ícone em tabelas.

---

## 2026-05-20 | Feature | sem commit

**Visualização de questão no admin**

- Admin de questões ganha ação Visualizar em cada linha da listagem.
- A visualização reutiliza o `app-questao-card`, preservando a renderização vista pelo aluno.
- Abaixo da questão, a modal exibe panorama administrativo com status, tipo, formato, disciplina, temas, vínculo de prova, gabarito, revisão e métricas.
- Regras de negócio documentam que a visualização administrativa deve reaproveitar a experiência do aluno.

---

## 2026-05-20 | Tweak | sem commit

**Tabela de questões sem coluna de prova**

- Removida a coluna Prova da listagem administrativa de questões para reduzir ruído visual.
- O vínculo com prova permanece disponível no drawer de criação/edição da questão.

---

## 2026-05-20 | Feature | 90dcc17

**Impersonação de usuário pelo admin ("Entrar como")**

- Admins podem logar como qualquer aluno diretamente pela lista de usuários.
- Edge Function `admin-impersonate` verifica papel admin via JWT, gera magic link com service role, e protege o email do owner contra impersonação.
- Audit log (`admin_impersonation_log`) registra todas as impersonações com IP, user agent, admin e alvo — visível apenas para admins via RLS.
- Sessão admin é salva no `sessionStorage` antes da troca; restaurada ao clicar "Voltar para minha conta".
- Banner âmbar visível em todo o dashboard durante impersonação, com nome do usuário e botão de retorno.
- Corrige bugs em migrations pré-existentes que impediam `db reset` local.

---

## 2026-05-20 | Tweak | sem commit

**Checkbox visual no admin**

- Criado o componente compartilhado `app-ui-checkbox` com visual próprio, foco acessível e variante de card.
- Admin de questões passa a usar o novo checkbox em temas e opções do formulário.
- Admin de provas passa a usar o novo checkbox nas opções de publicação/arquivamento e seleção de questões.
- Design system documenta o padrão de checkbox do sistema.

---

## 2026-05-19 | Feature | sem commit

**Simulado sem tipo de prova**

- Montagem de simulado ganha a opção Todos para sortear questões sem filtrar por tipo de prova.
- RPC `gerar_simulado_personalizado` passa a aceitar `p_tipo_questao` e `p_formato` nulos como ausência de filtro.
- Contagem de temas reaproveita o carregamento geral quando a opção Todos está selecionada.
- Regras de negócio documentam que o tipo de prova é opcional na montagem do simulado.

---

## 2026-05-19 | Fix | sem commit

**Loading ao trocar formato no montar simulado**

- Tela de montar simulado passa a exibir estado de carregamento específico ao alternar entre Nacional, Processual e Laboratório.
- Lista de temas mostra skeleton com mensagem contextual enquanto a contagem por formato recarrega.
- Ações sobre formatos e temas ficam bloqueadas durante a recarga para evitar interação com dados antigos.
- Regras de negócio documentam o comportamento esperado da recarga de temas por formato.

---

## 2026-05-18 | Feature | sem commit

**Formatos de provas extensiveis**

- Nova migration adiciona `origem`, `formato`, `rede`, `subtipo`, `publicada` e `arquivada` em `prova`, mantendo `tipo` como legado.
- Questoes passam a ter `tipo_questao`, com regra de banco exigindo `imagem_url` para laboratorio.
- Bucket `questao-imagens` e policies de storage foram formalizados para upload administrativo.
- RPC de simulado personalizado passa a gravar `origem = 'personalizado'` e filtrar por tipo de questao.
- Admin de provas passa a separar origem, formato, rede e subtipo, permitindo Nacional, Processual, Laboratorio e Multiestacoes.
- Admin de questoes permite marcar questao como Laboratorio e exige imagem nesse caso.
- Listagem de simulados no modelo Afya passa a alternar por formato via query param.

---

## 2026-05-18 | Docs | sem commit

**Plano de adaptacao para tipos de provas**

- Adicionado plano em `docs/plano-adaptacao-tipos-provas.md` para adaptar o app aos formatos Nacional, Processual e Laboratorio.
- Plano separa origem, formato pedagogico e instituicao/rede para manter compatibilidade futura com outros formatos da Afya e outras faculdades.
- Documento lista fases de schema, admin, laboratorio, experiencia do aluno, RPCs, testes e criterios de pronto.

---

## 2026-05-18 | Feature | sem commit

**Importacao de questoes com temas cadastrados**

- Prompt de questoes passa a incluir as disciplinas e temas cadastrados no banco para orientar a IA com opcoes reais.
- Importacao de questoes passa a aceitar `TEMA:`/`TEMAS:` e validar o nome contra os temas existentes, usando a disciplina para desambiguar quando informada.
- Questoes importadas com tema valido agora criam o vinculo em `questao_tema`, inclusive no fluxo de criar prova.
- Regras de negocio documentam que disciplina e tema seguem opcionais, mas nao devem ser inventados pela IA.

---

## 2026-05-18 | Fix | sem commit

**Ajustes visuais na criacao de provas**

- Corrigida a altura do botao Buscar na etapa de selecao de questoes do fluxo administrativo de provas.
- Removida a largura total do botao Concluir no rodape do drawer, mantendo o padrao dos demais botoes do sistema.

---

## 2026-05-18 | Fix | sem commit

**Travas de relacionamento e delecao administrativa**

- Nova migration bloqueia delecoes silenciosas de disciplinas, temas e questoes vinculadas por FKs `RESTRICT`.
- `tentativa_resposta.ordem_na_tentativa` passa a ser garantida e usada nas RPCs de iniciar, retomar, finalizar e gerar simulado personalizado.
- RPCs de tentativa voltam a usar `disciplina_id` e `prova_questao`, evitando referencias a colunas antigas removidas.
- Leituras regulares de questoes de prova no frontend passam a usar `prova_questao` como fonte canonica.
- Admin antecipa bloqueios de delecao com mensagens especificas para disciplina, tema, questao e prova.
- Regras de negocio documentam as travas de integridade esperadas.

---

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
