
# Arquitetura — BoraMed

> Decisões são append-only. Nunca editar uma decisão anterior — apenas adicionar novas.

## ADR-001: Angular + Supabase

 **Data** : 2025-05
 **Decisão** : Angular 18+ (standalone components, signals) para frontend; Supabase para DB, Auth e Storage.
 **Motivo** : Stack padrão Rebuild já dominada pelo time. Angular standalone + signals reduz boilerplate. Supabase elimina backend próprio para time de 2 pessoas.

## ADR-002: Web-first, mobile-friendly

 **Data** : 2025-05
 **Decisão** : Aplicação web responsiva. Sem app nativo no MVP.
 **Motivo** : Velocidade de entrega. Alunos de medicina estudam no notebook e no celular — browser cobre os dois.

## ADR-003: Auth por email/senha

 **Data** : 2025-05
 **Decisão** : Supabase Auth com email/senha. Sem OAuth social por ora.
 **Motivo** : Simplicidade. Cadastro manual no MVP. OAuth pode ser adicionado depois sem quebrar nada.

## ADR-004: Storage de imagens no Supabase

 **Data** : 2025-05
 **Decisão** : Imagens de lâminas e peças armazenadas no Supabase Storage.
 **Motivo** : Integrado ao mesmo projeto, RLS nativo, CDN incluído no plano.

## ADR-005: Deploy Vercel + Supabase Cloud

 **Data** : 2025-05
 **Decisão** : Vercel para frontend, Supabase Cloud para backend.
 **Motivo** : Free tier suficiente para MVP. Integração nativa entre os dois. Zero DevOps.

## ADR-006: Questões autorais, não copiadas

 **Data** : 2025-05
 **Decisão** : Banco de questões processuais e de laboratório contém questões autorais criadas pelo time, inspiradas em temas, objetivos pedagógicos e formatos de avaliação observados. Não armazenar cópias, transcrições ou adaptações próximas de provas, materiais, imagens, alternativas ou gabaritos oficiais de instituições.
 **Motivo** : Conteúdo institucional e docente pode ter proteção autoral. Conteúdo autoral reduz risco jurídico e é suficiente para o propósito pedagógico.

## ADR-010: Posicionamento independente sobre instituições citadas

 **Data** : 2026-05
 **Decisão** : Textos públicos devem apresentar o BoraMed como plataforma independente. Menções à Afya devem ser nominativas e contextuais, usando linguagem como "foco inicial em alunos da rede Afya" ou "modelo das avaliações", sem sugerir parceria, vínculo oficial, representação, acervo oficial ou uso de questões da instituição.
 **Motivo** : A plataforma precisa atrair alunos do público inicial sem criar risco de confusão de marca, parceria inexistente ou apropriação de conteúdo protegido.

## ADR-007: Sorteio de questões server-side via Supabase RPC

 **Data** : 2025-05
 **Decisão** : Lógica de sorteio e montagem do simulado roda em Supabase RPC ou Edge Function, não no cliente Angular.
 **Motivo** : Evita exposição dos IDs de todas as questões antes do aluno responder. Reduz superfície de manipulação.

## ADR-008: Google OAuth adicionado ao MVP

 **Data** : 2026-05
 **Decisão** : Google OAuth via Supabase Auth adicionado, ao lado de email/senha. ADR-003 revisado.
 **Motivo** : Templates de auth já previam os botões. Supabase OAuth não adiciona complexidade de backend nem exige mudança de schema.

## ADR-009: Onboarding próprio e versionado

 **Data** : 2026-05
 **Decisão** : O onboarding de novos usuários será implementado como componente Angular próprio, orquestrado pelo shell do dashboard e persistido em tabela Supabase `user_onboarding_state` por usuário, fluxo e versão.
 **Motivo** : O BoraMed precisa de uma experiência integrada ao design system, responsiva para sidebar/bottom-nav e segura por RLS. Ferramentas externas de product tour ficam para uma fase futura, quando houver necessidade real de edição no-code, segmentação avançada ou analytics de growth.
## ADR-011: Provas separadas por origem, formato e instituicao

 **Data** : 2026-05
 **DecisÃ£o** : A modelagem de provas passa a separar origem (`autoral`, `faculdade`, `personalizado`), formato pedagogico (`nacional`, `processual`, `laboratorio`, `multiestacoes`) e contexto institucional (`rede`, `faculdade_id`, `subtipo`). `prova.tipo` permanece apenas como campo legado de compatibilidade.
 **Motivo** : O produto precisa atender os formatos iniciais no modelo Afya sem travar o banco a uma unica rede. Separar as dimensoes permite cadastrar novos formatos da Afya e, futuramente, outras faculdades sem reescrever fluxos de admin, listagem e tentativa.

## ADR-012: Dependencias ricas carregadas fora do bootstrap

 **Data** : 2026-05
 **Decisao** : Dependencias pesadas de renderizacao, como Markdown e Chart.js/ng2-charts, devem ser providas nos componentes ou rotas que as usam, evitando registro global no bootstrap principal.
 **Motivo** : A primeira carga atende landing, auth e shell do aluno. Isolar Markdown e graficos em chunks lazy reduz o bundle inicial e melhora o tempo ate a primeira interacao sem remover recursos das telas de questoes, historico, competitivo e admin.

## ADR-013: Auth e dashboard carregados sob demanda

 **Data** : 2026-05
 **Decisao** : O bootstrap principal nao deve inicializar AuthService/Supabase globalmente. Guards de auth, guest e admin carregam a sessao sob demanda, e as rotas internas do dashboard ficam em arquivo lazy separado.

## ADR-014: Avisos broadcast via tabela Supabase + modal no shell do dashboard

 **Data** : 2026-05
 **Decisao** : Avisos administrativos (imagem + texto opcional) sao armazenados na tabela `avisos`. O controle de visualizacao por usuario e feito via `avisos_vistos`. A verificacao ocorre uma vez por sessao no `effect()` do `DashboardComponent`, ignorada durante impersonacao. O modal fica montado no shell, nao em rotas filhas.
 **Motivo** : Solucao simples, sem polling, sem Realtime. Admin cria o aviso, usuarios veem na proxima entrada. Impersonacao ignorada para nao poluir a experiencia de debug do admin.

## ADR-015: Notificacoes in-app com estrutura pronta, sem gatilhos pre-definidos

 **Data** : 2026-05
 **Decisao** : A tabela `notificacoes` e o `AppNotificacaoService` estao implementados mas sem gatilhos automaticos ainda. Novos tipos (`sistema`, `conquista`, `info`, `aviso`) serao adicionados via RPCs SECURITY DEFINER em migrations futuras conforme a necessidade.
 **Motivo** : Evitar acoplamento prematuro a eventos de negocio ainda indefinidos. A estrutura esta pronta para receber qualquer tipo de notificacao sem reescrever o frontend.
 **Motivo** : Landing e rotas publicas nao precisam carregar Supabase Auth, resolvers do dashboard ou telas logadas na primeira renderizacao. Deixar auth e dashboard em chunks sob demanda reduz o bundle inicial e mantem a protecao das rotas privadas no ponto de navegacao.

## ADR-014: Performance visual sem decoracao cara

 **Data** : 2026-05
 **Decisao** : Componentes publicos devem respeitar o budget de CSS por componente e evitar texturas SVG inline, fundos decorativos animados e listeners de scroll sem limitacao por frame. Imagens abaixo da dobra devem usar carregamento/decodificacao nao bloqueante.
 **Motivo** : A landing e a primeira experiencia publica do produto. Reduzir CSS, trabalho de pintura e callbacks de scroll melhora carregamento e fluidez sem retirar funcionalidades centrais para o usuario.

## ADR-015: Imagens publicas otimizadas para entrega web

 **Data** : 2026-05
 **Decisao** : Assets raster usados na landing devem ser servidos em formatos e dimensoes adequados ao tamanho real de exibicao. PNGs grandes ficam reservados para casos que exigem transparencia ou fidelidade sem perdas.
 **Motivo** : Depois da reducao de JS e CSS, imagens passam a dominar o payload percebido. Redimensionar e comprimir assets publicos reduz tempo de carregamento, consumo de dados e tamanho do deploy sem alterar a experiencia funcional.

## ADR-016: Fonte externa unica no frontend

 **Data** : 2026-05
 **Decisao** : O frontend carrega apenas Inter como familia externa global. Titulos e paineis devem reutilizar Inter ou fontes do sistema, salvo justificativa forte de marca.
 **Motivo** : Cada familia adicional de fonte aumenta requisicoes, bytes e risco de troca visual tardia. Como Playfair Display era usada em apenas um titulo, o custo de carregamento era maior que o ganho de experiencia.

## ADR-017: Allowlist explicita para CommonJS auditado

 **Data** : 2026-05
 **Decisao** : O build Angular permite explicitamente o pacote `cookie` como dependencia CommonJS conhecida.
 **Motivo** : `cookie` e usado internamente por `@supabase/ssr@0.10.3`, versao mais recente disponivel no momento da decisao. O allowlist remove ruido de build para esse caso auditado sem desativar alertas para novos pacotes CommonJS.

## ADR-018: Prefetch de rotas e cache leve para percepcao de velocidade

 **Data** : 2026-05
 **Decisao** : Apos login, carregar chunks das rotas mais provaveis em idle time. Dados dos resolvers do dashboard sao cacheados em sessionStorage com TTL de 5 min (stale-while-revalidate).
 **Motivo** : Reduz tela em branco apos login e entre navegacoes do aluno. O cache e limpo no logout. Nenhum dado sensivel alem do necessario para UX e cacheado. Rotas admin nao sao pre-carregadas.
