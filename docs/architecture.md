
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
## ADR-011: Provas separadas por origem, formato e instituição

 **Data** : 2026-05
 **Decisão** : A modelagem de provas passa a separar origem (`autoral`, `faculdade`, `personalizado`), formato pedagógico (`nacional`, `processual`, `laboratório`, `multiestações`) e contexto institucional (`rede`, `faculdade_id`, `subtipo`). `prova.tipo` permanece apenas como campo legado de compatibilidade.
 **Motivo** : O produto precisa atender os formatos iniciais no modelo Afya sem travar o banco a uma única rede. Separar as dimensões permite cadastrar novos formatos da Afya e, futuramente, outras faculdades sem reescrever fluxos de admin, listagem e tentativa.

## ADR-012: Dependências ricas carregadas fora do bootstrap

 **Data** : 2026-05
 **Decisão** : Dependências pesadas de renderização, como Markdown e Chart.js/ng2-charts, devem ser providas nos componentes ou rotas que as usam, evitando registro global no bootstrap principal.
 **Motivo** : A primeira carga atende landing, auth e shell do aluno. Isolar Markdown e gráficos em chunks lazy reduz o bundle inicial e melhora o tempo até a primeira interação sem remover recursos das telas de questões, histórico, competitivo e admin.

## ADR-013: Auth e dashboard carregados sob demanda

 **Data** : 2026-05
 **Decisão** : O bootstrap principal não deve inicializar AuthService/Supabase globalmente. Guards de auth, guest e admin carregam a sessão sob demanda, e as rotas internas do dashboard ficam em arquivo lazy separado.
 **Motivo** : Landing e rotas públicas não precisam carregar Supabase Auth, resolvers do dashboard ou telas logadas na primeira renderização. Deixar auth e dashboard em chunks sob demanda reduz o bundle inicial e mantém a proteção das rotas privadas no ponto de navegação.

## ADR-014: Avisos broadcast via tabela Supabase + modal no shell do dashboard

 **Data** : 2026-05
 **Decisão** : Avisos administrativos (imagem + texto opcional) são armazenados na tabela `avisos`. O controle de visualização por usuário é feito via `avisos_vistos`. A verificação ocorre uma vez por sessão no `effect()` do `DashboardComponent`, ignorada durante impersonação. O modal fica montado no shell, não em rotas filhas.
 **Motivo** : Solução simples, sem polling, sem Realtime. Admin cria o aviso, usuários veem na próxima entrada. Impersonação ignorada para não poluir a experiência de debug do admin.

## ADR-015: Notificações in-app com estrutura pronta, sem gatilhos predefinidos

 **Data** : 2026-05
 **Decisão** : A tabela `notificacoes` e o `AppNotificacaoService` estão implementados, mas sem gatilhos automáticos ainda. Novos tipos (`sistema`, `conquista`, `info`, `aviso`) serão adicionados via RPCs SECURITY DEFINER em migrations futuras conforme a necessidade.
 **Motivo** : Evitar acoplamento prematuro a eventos de negócio ainda indefinidos. A estrutura está pronta para receber qualquer tipo de notificação sem reescrever o frontend.

## ADR-019: Buckets públicos sem listagem ampla

 **Data** : 2026-05
 **Decisão** : Buckets públicos usados para imagens (`avisos`, `questao-imagens`) podem servir arquivos por URL pública, mas não devem manter policy ampla de `SELECT` em `storage.objects`. Escrita, update e delete seguem restritos a administradores.
 **Motivo** : URL pública é suficiente para renderizar imagens já referenciadas no banco. Permitir `SELECT` amplo em objetos de bucket público também permite listagem de arquivos, aumentando exposição sem necessidade funcional.

## ADR-014: Performance visual sem decoração cara

 **Data** : 2026-05
 **Decisão** : Componentes públicos devem respeitar o budget de CSS por componente e evitar texturas SVG inline, fundos decorativos animados e listeners de scroll sem limitação por frame. Imagens abaixo da dobra devem usar carregamento/decodificação não bloqueante.
 **Motivo** : A landing é a primeira experiência pública do produto. Reduzir CSS, trabalho de pintura e callbacks de scroll melhora carregamento e fluidez sem retirar funcionalidades centrais para o usuário.

## ADR-015: Imagens públicas otimizadas para entrega web

 **Data** : 2026-05
 **Decisão** : Assets raster usados na landing devem ser servidos em formatos e dimensões adequados ao tamanho real de exibição. PNGs grandes ficam reservados para casos que exigem transparência ou fidelidade sem perdas.
 **Motivo** : Depois da redução de JS e CSS, imagens passam a dominar o payload percebido. Redimensionar e comprimir assets públicos reduz tempo de carregamento, consumo de dados e tamanho do deploy sem alterar a experiência funcional.

## ADR-016: Fonte externa única no frontend

 **Data** : 2026-05
 **Decisão** : O frontend carrega apenas Inter como família externa global. Títulos e painéis devem reutilizar Inter ou fontes do sistema, salvo justificativa forte de marca.
 **Motivo** : Cada família adicional de fonte aumenta requisições, bytes e risco de troca visual tardia. Como Playfair Display era usada em apenas um título, o custo de carregamento era maior que o ganho de experiência.

## ADR-017: Allowlist explícita para CommonJS auditado

 **Data** : 2026-05
 **Decisão** : O build Angular permite explicitamente o pacote `cookie` como dependência CommonJS conhecida.
 **Motivo** : `cookie` é usado internamente por `@supabase/ssr@0.10.3`, versão mais recente disponível no momento da decisão. O allowlist remove ruído de build para esse caso auditado sem desativar alertas para novos pacotes CommonJS.

## ADR-018: Prefetch de rotas e cache leve para percepção de velocidade

 **Data** : 2026-05
 **Decisão** : Após login, carregar chunks das rotas mais prováveis em idle time. Dados dos resolvers do dashboard são cacheados em sessionStorage com TTL de 5 min (stale-while-revalidate).
 **Motivo** : Reduz tela em branco após login e entre navegações do aluno. O cache é limpo no logout. Nenhum dado sensível além do necessário para UX é cacheado. Rotas admin não são pré-carregadas.

## ADR-020: Anexos privados nas mensagens de suporte

 **Data** : 2026-06
 **Decisão** : Fotos e vídeos enviados no suporte ficam no bucket privado `suporte-anexos`, com metadados em `suporte_anexos` ligados a `suporte_mensagens`. A UI abre arquivos por URLs assinadas temporárias, nunca por URL pública.
 **Motivo** : Evidências de debug podem conter dados sensíveis da tela do usuário. Associar anexos a mensagens preserva contexto da conversa, enquanto bucket privado + RLS restringe leitura ao dono do ticket e administradores.

## ADR-021: Anotações de questão vinculadas à tentativa

 **Data** : 2026-06
 **Decisão** : Anotações do aluno em questões são armazenadas por `user_id + tentativa_id + questao_id`, exibidas somente na revisão de uma tentativa finalizada. A revisão principal usa a rota `/dashboard/simulados/:provaId/tentativa/:tentativaId/revisao` e a RPC `get_revisao_tentativa` para carregar exatamente as questões daquela tentativa.
 **Motivo** : A mesma questão pode aparecer em simulados diferentes, com contexto pedagógico, ordem, desempenho e objetivo de revisão distintos. Vincular anotações à tentativa evita vazamento de contexto entre simulados e preserva uma UX limpa durante a execução cronometrada.

## ADR-022: Impressão de simulados via print nativo do navegador

 **Data** : 2026-06
 **Decisão** : A impressão/PDF de simulados usa `window.print()` + `@media print` (variantes `print:` do Tailwind), em uma rota dedicada fora do dashboard (`/imprimir/simulado/:provaId` e `/imprimir/simulado/montado`). Não há biblioteca de PDF nem geração server-side. Os dados vêm de duas RPCs SECURITY DEFINER: `get_simulado_impressao(uuid, boolean)` para simulados existentes (provas prontas via `prova_questao`; montados via `tentativa_resposta` da tentativa mais recente) e `gerar_simulado_impressao(uuid[], int, text, text)` para montar um simulado só para impressão sem criar prova/tentativa. O gabarito (`correta`/`explicacao`) só é exposto após o aluno finalizar a prova (ou admin), espelhando `get_revisao_prova`.
 **Motivo** : O print nativo entrega texto vetorial nítido, imagens em alta, quebra de página por CSS e zero dependência/manutenção extra, contra rasterização e reconstrução manual de markdown/imagens das libs de PDF. A geração só-impressão mantém o histórico limpo e o mascaramento server-side do gabarito preserva a integridade do ranking/gamificação.

## ADR-024: Comentários públicos por questão com provider isolado por instância

 **Data** : 2026-06
 **Decisão** : `ComentarioQuestaoService` é declarado com `@Injectable()` sem `providedIn: 'root'` e provido via `providers: [ComentarioQuestaoService]` no decorator do `QuestaoComentariosComponent`. Na tela de revisão (`prova-visualizar`), múltiplas instâncias do componente coexistem no mesmo `@for`, cada uma com seu próprio estado isolado.
 **Motivo** : Comentários de questões diferentes são independentes. Um service singleton com `Map<questaoId, estado>` gerenciaria estado morto de questões não visíveis e complicaria o cleanup. O escopo de componente garante que o estado é destruído junto com o componente e elimina colisão entre acordeons simultâneos.

## ADR-023: Suspensão administrativa preserva acesso ao suporte

 **Data** : 2026-06
 **Decisão** : Usuários suspensos são marcados em `profiles` (`banido`, `banido_em`, `banido_por`, `motivo_banimento`) por RPC administrativa, não pelo ban nativo do Supabase Auth. A sessão autenticada permanece válida para que a rota fixa `/conta-suspensa` consiga exibir o estado da conta e manter o widget de suporte disponível. Tabelas fora do suporte recebem policy RLS restritiva para negar acesso a perfis suspensos.
 **Motivo** : O ban nativo do Auth impediria login/refresh e bloquearia o canal autenticado de suporte. O bloqueio em aplicação permite restringir a navegação normal e remover permissões administrativas (`is_admin()`/`is_super_admin()` ignoram perfis suspensos), mantendo um canal formal para contestação ou esclarecimento.

## ADR-025: Pagamentos recorrentes via Mercado Pago (assinaturas) com paywall total

> **Superado (parcialmente) pelo ADR-029** (2026-07): o checkout por
> **redirecionamento** descrito abaixo foi substituído pelo checkout
> **embutido** (Payment Brick + Checkout API) para compras novas. O restante
> do ADR (tabelas, webhook como fonte da verdade, paywall via
> `tem_assinatura_ativa()`) permanece válido. O fluxo de redirect segue
> deployado apenas para assinantes legados e checkouts em voo, até a limpeza
> pós-janela de observação.

 **Data** : 2026-06
 **Decisão** : Monetização por assinatura recorrente usando Mercado Pago no modelo *assinatura com plano associado* (`preapproval_plan` + checkout por redirecionamento via `init_point` do plano). Três tabelas novas — `plano` (catálogo: preço, frequência, `mp_preapproval_plan_id`, `mp_init_point`), `assinatura` (espelho do `preapproval`: `status` em `pending`/`authorized`/`paused`/`cancelled`, `proxima_cobranca`) e `pagamento` (histórico de parcelas). Escrita em `assinatura`/`pagamento` somente via service role (edge functions); aluno tem RLS de SELECT apenas das próprias linhas. Três edge functions: `mp-criar-assinatura` (autenticada, devolve o `init_point` do plano com `external_reference` = `profiles.id`), `mp-webhook` (pública, `verify_jwt=false`, valida `x-signature` HMAC-SHA256 e é a fonte da verdade do status — consulta o recurso no MP e faz upsert) e `mp-gerenciar-assinatura` (cancelar/pausar via `PUT /preapproval/{id}`). Paywall total: `lazySubscriptionGuard` protege `/dashboard`, consultando a RPC `tem_assinatura_ativa()` (autoritativa, sem estado local), com bypass para admin; sem assinatura → redireciona a `/planos`.
 **Motivo** : O redirect mantém o BoraMed fora do escopo PCI (cartão digitado no ambiente do Mercado Pago) e é a integração mais simples e rápida para o pré-lançamento; dá para migrar a checkout transparente (CardForm) depois sem refazer o backend. O webhook como fonte da verdade evita confiar no retorno do navegador (assíncrono e burlável). O modelo *sem plano associado* (que carregaria `external_reference` nativo e retorna `init_point` por usuário) foi descartado por retornar HTTP 500 consistente no app de teste; o `external_reference` é então anexado ao `init_point` do plano, com fallback de reconciliação por `payer_email`.

## ADR-026: Logout centralizado no AuthService

 **Data** : 2026-06
 **Decisao** : O logout da aplicacao deve passar por `AuthService.signOut()`, que limpa estado local de auth, impersonacao e cache, encerra a sessao no Supabase e navega para `/login` com `replaceUrl`. O evento `SIGNED_OUT` do Supabase permanece como fallback para encerramentos externos de sessao.
 **Motivo** : Botoes de sair existem em shells diferentes (aluno, admin, planos e conta suspensa). Centralizar a navegacao evita depender de cada componente ou da ordem de emissao do evento de auth para retirar o usuario de uma rota protegida.

## ADR-027: Impressao de simulados sem offset responsivo no papel

 **Data** : 2026-06
 **Decisao** : Em `@media print`, a rota de impressao de simulados deve zerar explicitamente qualquer offset visual da sidebar de configuracao e deixar o documento ocupar 100% da area imprimivel. A regra vale mesmo quando o viewport ainda ativa breakpoints desktop, como no Safari/iPad em landscape.
 **Motivo** : Alguns navegadores moveis preservam classes responsivas do layout de tela ao abrir o fluxo de impressao. Se o `margin-left` da sidebar continuar ativo depois que a sidebar e ocultada, a folha fica com uma coluna branca e o conteudo impresso e comprimido.

## ADR-028: Módulo de Materiais de Estudo — bucket privado + signed URLs

 **Data** : 2026-06
 **Decisão** : PDFs de materiais de estudo ficam em bucket privado `materiais` (Supabase Storage, public=false). O acesso do aluno é servido via `createSignedUrl` com TTL de 3600s, gerada on-demand ao clicar no arquivo. A visualização é feita via `<iframe>` embutido com parâmetro `#toolbar=0&navpanes=0` para suprimir a toolbar de download/impressão nativa do navegador (proteção "soft" — não impede captura de tela ou inspect; melhoria para pdf.js registrada como trabalho futuro). O acesso ao bucket e às tabelas é gateado por `tem_assinatura_ativa()` via RLS.
 **Hierarquia** : `material_categoria` (mural) → `material_arquivo` (PDFs diretos). A tabela `material_topico` foi criada com FK nullable em `material_arquivo` para permitir agrupamento por tópico sem nova migration estrutural quando o volume crescer.
 **Motivo** : Conteúdo autoral restrito a assinantes não deve ser acessível via URL pública. O bucket privado + signed URL segue o padrão já aplicado em `suporte-anexos`. A tabela de tópicos antecipa crescimento do módulo (APGs por sistema, por período etc.) sem forçar refatoração futura.

## ADR-029: Métricas por usuário no admin — RPC agregada única

 **Data** : 2026-07
 **Decisão** : A tela de métricas individuais do admin (`/admin/usuarios/:id/metricas`) é servida por uma única RPC `admin_get_metricas_usuario(p_user_id, p_desde, p_ate)` (`SECURITY DEFINER` + `is_admin()` na entrada, `REVOKE` de `PUBLIC`/`anon`), em vez de múltiplas queries do cliente. A RPC agrega em um JSONB: perfil, tentativas do período (totais, nota média, tempo, distribuição por modo/formato), séries diárias (tentativas e XP, via `generate_series` no fuso America/Sao_Paulo, limitadas a 366 dias), snapshot de gamificação, assinatura relevante (com flag `renovacao_cancelada` = cancelou mas segue na carência), histórico de assinaturas e pagamentos do período (máx. 100). Cada tabela é lida uma única vez em CTEs compartilhados; índice de suporte `tentativa (user_id, iniciada_em)`.
 **Motivo** : Um único round-trip com agregação server-side é mais rápido e mais barato que N chamadas PostgREST, e mantém o padrão de segurança das demais RPCs administrativas — nenhuma policy RLS nova foi aberta em `assinatura`, `pagamento` ou `gamificacao_evento`; a RPC é o único canal de leitura cross-user desses dados.

## ADR-030: Checkout embutido com Checkout Bricks (Payment Brick + Checkout API)

 **Data** : 2026-07
 **Decisão** : O pagamento passa a acontecer **dentro da plataforma** (rotas `/checkout/:plano` e `/checkout/status/:intencaoId`), substituindo o redirect ao site do Mercado Pago para compras novas. UI de coleta: **Payment Brick** do SDK v2 (campos de cartão em iframes PCI do MP, validação inline, device ID automático, 3DS e Pix/boleto prontos), tematizado com a identidade BoraMed — e não Secure Fields custom, que exigiria reconstruir validação/parcelas/3DS à mão sem ganho no backend. Processamento: semestral via `POST /v1/payments` (cartão até 6x, Pix com expiração de 30min, boleto de 3 dias) na edge `mp-processar-pagamento`; mensal via `POST /preapproval` com `status:'authorized'` e `card_token_id` na edge `mp-processar-assinatura`; reconciliação ativa via `mp-consultar-pagamento`. Nova tabela `pagamento_intencao` registra cada tentativa (idempotência por `attempt_id`/`X-Idempotency-Key`, rate limit 5/15min, snapshot do preço do banco, polling do frontend via RLS "select own"). O `mp-webhook` continua sendo a **fonte da verdade** (mesma URL, mesmo secret, mesmos topics); a lógica do branch `payment` foi extraída para `_shared/mp-payment-sync.ts`, idempotente e compartilhada entre webhook, resposta síncrona e reconciliação. `mp-gerenciar-assinatura` ganhou a ação `trocar_cartao` (`PUT /preapproval/{id}` com `card_token_id` novo).
 **Nota /v1/payments vs Orders API** : a documentação do MP marca `/v1/payments` como API anterior (sucessora: Orders API), mas o fluxo documentado dos Bricks e o webhook atual usam `/v1/payments` — ficamos nela; migrar a Orders no futuro não altera o Brick nem o modelo de dados.
 **3DS** : `three_d_secure_mode:'optional'`; quando o emissor exige challenge (`pending_challenge`), o **Status Screen Brick** renderiza o iframe do banco — é o único uso do Status Screen (os demais estados têm UI própria com mensagens do mapa `mp-status-detail.map.ts`).
 **Coexistência com o legado** : corte direto na UI para compras novas, sem feature flag; nada é removido no mesmo deploy. As edges/rotas do redirect (`mp-criar-assinatura`, `mp-vincular-assinatura`, `mp-retorno`, `/assinatura/retorno`) permanecem deployadas durante a janela de observação — rollback = reverter só o frontend. Assinantes mensais legados **não migram**: os preapprovals antigos seguem cobrando e sendo geridos pelos mesmos webhooks e pela `mp-gerenciar-assinatura` (contrato preservado por testes de regressão). Payments legados sem `metadata.intencao_id` são tratados pelo sync exatamente como antes (refund/chargeback continuam revogando acesso).
 **Motivo** : o redirect quebrava a conversão (saída da plataforma, retorno por polling) e limitava o feedback de erro a estados genéricos. O checkout embutido mantém o BoraMed fora do escopo PCI, eleva o score de qualidade da integração (device ID, `additional_info`, `statement_descriptor`, `external_reference`, notification_url) e permite UX específica por cenário de recusa (`status_detail` → mensagem acionável).
