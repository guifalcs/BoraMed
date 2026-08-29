# Changelog

## 2026-08-29 | Fix | Novo usuário voltou a chegar com nome

**O trigger de criação de perfil tinha parado de gravar `nome_completo`; todo cadastro desde 28/08 nascia sem nome e a UI caía no fallback de e-mail**

- **A causa foi um `create or replace` que reescreveu a função inteira.** A migration `20260828210000` alterou `handle_new_user()` para ler `faculdade_unidade` do metadata, mas o corpo novo passou a inserir só `(id, email, faculdade_unidade)` — a versão anterior também gravava `nome_completo` a partir de `raw_user_meta_data->>'full_name'`. Como `create or replace` substitui a função toda, o campo saiu junto.
- **O que despistava: essa versão anterior nunca esteve no repositório.** Ela tinha sido editada direto no banco, então o diff da migration não mostra nenhuma linha sendo removida — só o corpo novo, aparentemente completo. O `git log` de `handle_new_user` tem exatamente dois arquivos, e nenhum dos dois menciona o nome.
- **O frontend nunca teve culpa.** `auth.service.ts` sempre mandou `full_name` no `options.data` do `signUp`, e o Google preenche `full_name` e `name` sozinho. O dado chegava intacto em `auth.users` o tempo todo — só não era copiado para `profiles`.
- **Números:** 54 de 54 perfis criados até 27/08 têm nome; a partir de 28/08, 2 de 7 (e esses dois preencheram na mão pelo perfil). Dos 56 perfis com nome, 52 são idênticos ao `full_name` do metadata — a assinatura do preenchimento automático que havia parado. 5 usuários afetados, todos recuperáveis.
- **`coalesce('full_name', 'name')`** porque o cadastro por e-mail/senha manda só a primeira chave e o Google manda as duas. **`trim` + `left(…, 200)`** porque o metadata é preenchido pelo cliente e esse texto aparece em ranking, comentários e e-mail de campanha; string vazia ou só de espaços vira `NULL`, não `''`.
- **O backfill só toca em quem está sem nome**, para não sobrescrever quem já tinha corrigido na tela de perfil. A `faculdade_unidade` segue com o mesmo descarte silencioso de valor fora do CHECK — nome preenchido não pode abortar a criação da conta.
- Validado num Postgres 16 local com schema espelhando `auth.users` + `profiles`: o bug foi reproduzido com a função de produção (3 de 3 sem nome), e depois da migration foram conferidos backfill, preservação do nome editado à mão, cadastro por e-mail e por Google, fallback para `name`, `trim`, metadata vazio, nome de 500 caracteres truncado em 200, unidade inválida descartada sem abortar a conta, e reaplicação idempotente.
- Pendente de `npx supabase db push --linked` (migrations não saem por CI).

## 2026-08-26 | Feature | `/planos` decide o destino pela sessão

**Um link só para campanha, bio e anúncio: logado cai na tela de planos do app, deslogado cai na seção de planos da landing**

- **O problema era o link de campanha.** `/planos` é rota guardada e o `authGuard` manda quem não tem sessão para `/login` sem guardar a rota de destino — depois de entrar, a pessoa terminava no `/dashboard`, nunca na oferta que a fez clicar. Mandar o link para `/#planos` resolvia o deslogado e quebrava o logado, que o `rootRedirectGuard` desvia de `/` para `/dashboard`.
- **Novo `planosPublicoGuard`** (`core/guards/planos-publico.guard.ts`), declarado ANTES do `authGuard` no `canActivate` da rota: sem sessão, desvia para `/#planos`; com sessão, devolve `true` e o `authGuard` segue tratando recovery, conta suspensa e vínculo pendente de assinatura como sempre.
- **`location.replace`, não `Router`**: a âncora só rola até a seção num carregamento de página (o router não está com `anchorScrolling` ligado), e o `replace` mantém `/planos` fora do histórico — com `assign`, o "voltar" cairia no mesmo desvio. Fora do browser o guard devolve `UrlTree` para a landing; como `/planos` é `RenderMode.Client`, esse caminho é só rede de segurança.
- Testes: 3 unitários em `planos-publico.guard.spec.ts` (sessão segue para o app, visitante vai para a âncora da landing, SSR usa `UrlTree`).
- Conteúdo pronto da campanha da N1 em `docs/campanhas/`, apontando para esse link. Documentação em `docs/auth-root-routing.md`.

## 2026-08-25 | Feature | Trocar o formato da questão durante a prova

**Onde existe gêmea, o aluno decide na hora se responde por alternativas ou por escrito**

- **A escolha de formato só existia na montagem do simulado** (`fechadas`/`discursivas`/`misto`), antes de ver uma única questão. Agora, na execução, questão que tem gêmea (mesma questão lógica no outro formato, ADR-032) mostra um botão discreto no topo do card — "Responder por escrito" ou "Responder por alternativas".
- **A troca é um `UPDATE` de uma linha de `tentativa_resposta`.** Simulado não-nacional é sempre personalizado e não tem `prova_questao`: as questões da tentativa vivem só em `tentativa_resposta`, e resultado, revisão, KPIs do histórico, desempenho por tema e `taxa_acerto` já derivam dali. Trocar o `questao_id` propaga sozinho — nenhuma dessas telas precisou de uma linha de mudança.
- **A nota não precisou de nada.** A expressão canônica `coalesce(tr.pontos, correta::int*100)` já mistura formatos (é o caso `misto`), `total_pontuaveis` é calculado na consolidação — depois da troca — e a gêmea herda os temas da origem, então a distribuição por tema não muda de bucket.
- **Só troca questão intocada** (`respondida_em IS NULL AND enviada_em IS NULL`). Depois de enviada, a discursiva já criou `resposta_correcao` e já consumiu correção de IA; depois de respondida, a fechada já pode ter revelado o gabarito em modo estudo. Permitir a troca ali exigiria estorno de correção, que não existe. O rascunho de texto não bloqueia — é descartado, com diálogo de confirmação antes (o enunciado da outra versão é outro).
- **Guard de duplicidade porque não há UNIQUE em `(tentativa_id, questao_id)`**: se a gêmea já estivesse na mesma tentativa, a troca duplicaria a questão na tela. O sorteio nunca monta assim (dedup do ADR-032, e nenhuma prova do acervo tem as duas hoje), mas a RPC recusa (`P0013`) e o mapa nem oferece.
- **A questão nova volta mascarada.** Helper interno `montar_questao_tentativa_json` replica a máscara de `iniciar_tentativa`: em modo simulado, `resposta_modelo`/`criterios_correcao` NULL, `pontos_chave` `[]` e `alternativa.correta` NULL. Sem isso, trocar de formato seria um caminho para extrair gabarito no meio da prova.
- **O id da questão muda, e todo o estado da tela é indexado por ele.** Marcação de revisão e anulação do aluno migram de chave (são do aluno sobre a questão lógica); rascunho e resposta são descartados; o autosave em voo é cancelado antes, senão escreveria o rascunho na questão que está saindo. O mapa de gêmeas é invertido com o que a própria RPC devolve, então dá para voltar ao formato anterior sem nova consulta.
- **`get_gemeas_tentativa` é acessória e falha em silêncio**: sem ela a prova roda igual, só sem o botão. Devolve só ids e formato — nunca gabarito.
- **Cobertura hoje: 290 pares, todos de laboratório.** A conversão em lote (24/08) ainda não chegou nas 787 processuais fechadas, então o botão só aparece em questão de lâmina por enquanto. As gêmeas novas seguem com `revisao_conversao='pendente'` — flag de curadoria, que não afeta aluno nem sorteio.
- Testes: 6 de regressão em `supabase/tests/troca_formato_gemea_test.sql` (troca/máscara/simetria, bloqueio por resposta, duplicidade, elegibilidade, integridade do resultado, dono), 14 unitários do `tentativa-exec` e 3 e2e no projeto `mocked`.

## 2026-08-24 | Feature | Pódio do ranking competitivo

**Os três primeiros do ranking ganham coroa de ouro, prata e bronze; o 1º ganha manto de rei**

- **O top 3 era indistinguível do resto da lista**: mesma linha, mesmo `#1 #2 #3` em cinza. Sem hierarquia visual, o ranking não criava nenhuma aspiração — a posição só era legível lendo o número.
- **Coroa em SVG inline, não imagem.** Dois componentes novos em `shared/components/ui/coroa-podio/`: `ui-coroa-podio` (coroa de três pontas com gemas, gradiente por metal) e `ui-manto-rei` (capa vermelha atrás do avatar do 1º). A 18px — o tamanho real na linha — um PNG ilustrado vira mancha; o SVG fica nítido em qualquer DPI, pesa ~1KB contra ~40KB por arquivo e não custa requisição.
- **Cada instância gera o próprio id de gradiente.** Sem isso as três coroas colidiriam no mesmo DOM e as três sairiam douradas, porque `url(#id)` resolve pelo primeiro match do documento.
- **O metal aparece em quatro lugares por linha**, para a posição ser legível sem ler o número: coroa sobre o avatar, anel colorido no avatar, o `#N` tingido e um fundo bem claro na linha.
- **Bronze puxado para o marrom avermelhado** (`#c2803f`), não para o ouro escuro: a 18px, bronze e ouro com a mesma matiz amarela ficam indistinguíveis.
- **`is_me` continua visível dentro do pódio.** O fundo do metal vence o azul, e a identidade fica na borda esquerda azul mais o "(você)" — antes era `bg-blue-50` puro, que apagaria o pódio de quem está em 1º.
- **O manto é todo em retas** (`M7 17 L2 42 L22 37 L42 42 L37 17 Z`), saindo 4px de cada lado do avatar. A primeira versão, curva e larga, lia como pedestal de pódio em vez de capa — o oposto do efeito. Com o tamanho atual a capa cabe no `py-3` da linha, então todas as linhas do ranking mantêm a mesma altura.
- Sem animação nenhuma: o reset global de `prefers-reduced-motion` do projeto congelaria qualquer transição aqui.
## 2026-08-24 | Fix | Enunciado de apoio no desafio diário

**O desafio diário nunca renderizou o enunciado de apoio — 80% do acervo elegível responde a questão sem ler o caso**

- **O card do desafio imprimia só `enunciado`.** A RPC `get_desafio_diario()` sempre devolveu `enunciado_apoio`, o `DesafioService` sempre fez o parse dele e o `DesafioQuestao` sempre teve o campo: o que faltava era o bloco no template do `competir-hub`. Em questão de comando curto — o caso clínico e as afirmativas I a IV vivem no apoio — o aluno via "É correto o que se afirma em" seguido direto de "I e III, apenas", sem nunca ver as afirmativas.
- **Não era caso isolado do dia:** 4.001 das 4.983 questões aptas ao desafio têm `enunciado_apoio`. O sorteio é LRU sobre a base inteira, então a chance de cair numa questão mutilada era ~80% todo dia. O desafio de 23/08 (malária no Pará) tinha o mesmo problema.
- **Ordem de renderização segue o `questao-card`**: badge de disciplina → imagem/legenda → apoio → enunciado. O bloco de apoio usa `var(--color-bg-soft)` em vez do `bg-slate-50` fixo do `questao-card`, que não acompanha o tema escuro.
- **Não corrigido, precisa de decisão de conteúdo:** a questão de 24/08 (`08275fa9`) cita `Influenza A (H1N3)`, subtipo que não existe — erro de transcrição na origem (`origem_geracao: ia_assistida`, `revisado: false`), duas ocorrências no apoio e nenhuma outra questão do acervo com o mesmo defeito. A mesma questão está com `disciplina_id` nulo, então o desafio do dia também apareceu sem o badge de disciplina.

## 2026-08-18 | Fix | Formatação das questões

**Acervo inteiro normalizado: tópicos viram tópicos, parágrafos param de virar parede de texto e imagem deixa de ser "abaixo"**

- **O acervo tinha 5.808 blocos de texto acima de 450 caracteres** (o maior com 4.012, ~40 linhas na tela). Enunciado, apoio e explicação são renderizados como Markdown, então quebra de linha simples era engolida e o aluno lia parágrafos de 10+ linhas. Sobraram 535 blocos grandes, e nenhum deles é divisível sem reescrever conteúdo: ou é uma frase única longa, ou é uma lista inteira (que não pode ser partida sem quebrar a lista).
- **Tópico não aparecia como tópico.** As questões guardavam listas com marcador `•`, travessão ou hífen no meio da frase (`Incorretas: – item – item – item`), que o Markdown renderiza como texto corrido. Viraram listas `- item` de verdade — 387 questões passaram a ter lista Markdown. Também entram nessa conta as enumerações separadas por ponto-e-vírgula (`intro: item; item; item`) e os blocos de dados de exame (`IMC: 31,5. Pressão arterial: 148/90.`), que agora são um item por linha.
- **`markdown ul/ol` não tinha `list-style`.** O preflight do Tailwind zera o marcador e o `styles.css` só restaurava margem e padding — ou seja, mesmo a lista Markdown que já existia no banco renderizava sem bolinha nenhuma, indistinguível de parágrafos soltos. Sem essa correção, metade do trabalho no banco não apareceria na tela.
- **Imagem é renderizada ANTES do enunciado, mas 14 questões diziam "abaixo".** Herança das provas em PDF, onde a figura vem depois do texto. Cada caso foi conferido individualmente antes de trocar para "acima" — "as alternativas abaixo" e "as assertivas a seguir" apontam para o texto, não para a imagem, e ficaram como estavam. De carona, dois erros de digitação: `imagem a acima` e `acimarepresentado`.
- **Rótulos de seção ganharam parágrafo próprio** (`Mecanismo cobrado:`, `Exame físico:`, `Exames laboratoriais:`, `Justificativa:`, `Distratores:`, `Referências bibliográficas:`). Só quando aparecem em início de frase: `Porto Alegre:` e `São Paulo:` de referência bibliográfica não são rótulo, e `Explicação dos Distratores:` não pode ser partido no meio.
- **A explicação estruturada renderizava o texto da alternativa com interpolação** (`{{ alt.texto }}`), que achata tudo em uma linha só — qualquer parágrafo ou tópico gravado no banco era perdido exatamente ali, onde as explicações são mais longas. Passou a renderizar Markdown. Mesmo problema no gabarito da impressão de simulado (`simulado-impressao`), também corrigido.
- **A normalização não altera conteúdo.** Invariante verificada antes e depois em todas as 4.952 questões: a projeção alfanumérica de cada campo (texto sem espaço nem pontuação) é idêntica — só mudam espaçamento e marcadores. As 14 diferenças alfanuméricas registradas são exatamente as trocas de "abaixo" por "acima". 4.252 questões foram alteradas.
- **`questao_backup_formatacao` guarda o snapshot dos três campos** antes da migration, com RLS ligado e sem policy (só service role). Rollback é um `update ... from` direto.
- Convenção de formatação documentada em `docs/business-rules.md` → Questão → Formatação do texto.
- **Defeitos pontuais de origem, corrigidos junto:** marcador de item sozinho na linha com o texto do item na linha seguinte (`1.` / `Confusão mental nova…`, 4 ocorrências); a tabela do escore CRB-65 desenhada com espaços — que o Markdown colapsa, embaralhando as colunas — virou tabela Markdown, com a linha de cabeçalho duplicada no meio dos dados removida; e espaços repetidos no meio da frase.
- **Não corrigido de propósito, precisa de decisão de conteúdo:** 2 questões com o texto intercalado por extração de PDF em duas colunas (`781fd5c8`, `0417f7fc`), que nenhuma regra determinística reconstitui, e 1 questão que cita "ver imagem a seguir" duas vezes mas não tem `imagem_url` (`120d068e`) — falta a imagem, não é erro de direção.


## 2026-08-10 | Feature | Free tier

**Free tier: plano gratuito com 3 simulados, upsell em vez de paywall**

- **O paywall total acabou.** `/dashboard/*` exigia assinatura `authorized`, e quem se cadastrava caía direto em `/planos` sem ver nada do produto. Agora qualquer autenticado entra; o que muda é o que cada nível pode fazer lá dentro. O `subscriptionGuard` saiu do dashboard (e do repo) e virou `nivelPagoGuard`, aplicado só na impressão de simulados.
- **`nivel_acesso()` é a nova fonte única, e é TOTAL**: devolve `gratuito | essencial | avancado`, nunca NULL. `assinatura_tier()` passa a ser `nullif(nivel_acesso(uid), 'gratuito')`, preservando o contrato antigo do `tierAvancadoGuard` e dos gates P0015. `tem_assinatura_ativa()` não mudou de semântica: continua significando "acesso pago" e por isso materiais e flashcards ficaram bloqueados para o gratuito **sem uma linha de alteração** nas policies.
- **O teto é vitalício, não por período.** 3 tentativas via `limite_tentativas_gratuitas()`, aplicadas em `iniciar_tentativa` com o novo `ERRCODE P0016` (`free_limit_reached`). O contador deriva de `count(*)` sobre `tentativa` (exceto `modo = 'visualizar'`), não de uma coluna materializada: dispensa backfill, não dessincroniza, e faz ex-assinante chegar naturalmente em 0. Debita ao iniciar, sem estorno; `retomar_tentativa` é outra RPC e nunca debita de novo.
- **`get_status_acesso()` devolve nível e contador num payload só**, porque quase toda tela precisa dos dois juntos. Entra no `SubscriptionService` com o mesmo cache/dedup/TTL de 5 min já usado pelo paywall, e o `TentativaService.iniciar` invalida esse cache — sem isso o aluno via "3 restantes" depois de gastar uma.
- **Recurso pago agora aparece bloqueado, não some.** Materiais e Flashcards viram botão com selo PRO que abre o `paywall-modal` no contexto daquele recurso. Vale também para o `essencial`, que antes simplesmente não via os itens: esconder o recurso escondia junto o motivo para assinar.
- Quatro componentes novos em `shared/components/`: `upgrade-badge`, `upgrade-card`, `limite-tentativas-banner` (tom escalando neutro → âmbar → vermelho conforme o saldo cai) e `paywall-modal`, com `PaywallService` para disparo sem prop drilling. Pontos de contato: Início, hub de Simulados, detalhe da prova (botão vira "Iniciar (2 grátis)" e depois "Assinar para continuar"), tela de resultado (enquadramento de perda logo abaixo da nota) e Minha assinatura.
- **Avisos e notificações ganharam segmentação por nível** (`todos | pagantes | gratuitos | essencial | avancado`), para conteúdo de assinante não chegar em quem não paga. De carona, corrige um problema que já existia: o broadcast varria `auth.users` **sem filtro nenhum**, incluindo admins, contas banidas e cadastros não confirmados. Agora varre `profiles` filtrado.
- **Bug corrigido de carona**: `assinatura_tier()` ignorava a carência de assinatura `cancelled` que `tem_assinatura_ativa()` respeitava, então quem cancelava dentro do período pago passava no paywall e era barrado pelo gate de tier. E `bottomNavItems` era array estático que não passava pelo filtro de tier: o usuário `essencial` via Materiais e Flashcards na barra inferior mobile como se estivessem liberados.
- **Corrigida a inconsistência de tagline da landing**: "até o 4º período" contra "até o 8º" na lista de features do Essencial. O `TODO(integração)` para ler `listarPlanos()` continua aberto — preço de plano muda por `UPDATE` direto em produção, sem migration, então qualquer número hardcoded aqui é candidato a ficar desatualizado silenciosamente (já aconteceu uma vez nesta mesma sessão: "corrigi" o preço da landing usando os valores do banco local, que estavam desatualizados frente à produção real).
- Landing ganhou a coluna "Grátis" como âncora baixa da grade e CTAs de "Criar minha conta" para "Começar grátis, sem cartão".
- **Impressão de provas ficou bloqueada no plano gratuito**, com o mesmo tratamento visual dos itens do menu: botão visível e apagado, selo PRO e clique que abre o paywall (contexto `impressao`) em vez de um redirect sem explicação. A regra no servidor já existia (`get_simulado_impressao` recusa com P0009 e `/imprimir/**` tem o `nivelPagoGuard`); o que faltava era a UI não convidar para um clique que ia falhar. Vale nos três pontos que o gratuito alcança: detalhe da prova, resultado da tentativa e revisão.
- **Fechado um bypass do teto**: `iniciar_tentativa` isentava o modo `visualizar` da contagem, mas esse modo devolve o payload COM gabarito, explicação e resposta modelo — uma conta gratuita, mesmo com 0 restantes, extraía o acervo nacional inteiro chamando a RPC direto. Agora, no nível gratuito, `visualizar` só vale para prova já finalizada (mesma regra de `get_revisao_prova`). Antes do free tier isso era protegido porque a RPC exigia assinatura em qualquer modo.
- **Copy do upsell corrigida para quem paga**: o contexto `prova-bloqueada` atende gratuito E essencial (os dois batem no P0015), mas dizia "o plano gratuito cobre os treinos nacionais" e prometia "sem limite de tentativas" — ou seja, tratava um assinante do Essencial como se estivesse no plano grátis, no exato momento do upsell. Ajustada no modal e no cabeçalho de `/planos`.
- **`/planos` deixou de ser prerenderizado.** Sem entrada em `app.routes.server.ts` a rota caía no `**` = `RenderMode.Prerender`: o HTML saía no build, sem sessão, e o carregamento frio (link direto, F5, link de e-mail) passava pelo `/login` e terminava no `/dashboard` — nunca em `/planos`. O bug é anterior a esta feature, mas estava mascarado: o paywall do dashboard devolvia o não-assinante para `/planos`. Sem o paywall, o principal destino de upsell do free tier ficaria inalcançável. Era também a causa das falhas de `pagamento.spec.ts` no CI.

## 2026-08-02 | Feature | Redirecionamento rapido da rota raiz

- A rota `/` agora consulta a sessao local de forma idempotente antes de
  carregar a landing: usuarios autenticados seguem direto para `/dashboard`,
  enquanto visitantes continuam vendo a landing normalmente.
- O guard permanece lazy e nao cria uma tela de loading; o fluxo de recovery
  continua direcionando para `/redefinir-senha`.
- No acesso direto ao dominio, o SSR tambem redireciona pela sessao dos
  cookies antes de renderizar a landing, eliminando o flash visual para quem
  ja esta autenticado.
- Adicionado fallback lazy na propria landing para entradas hidratadas pelo
  SSR em que o guard de rota nao e reavaliado imediatamente no navegador.

## 2026-08-01 | Feature | Paginacao das tabelas do admin

- Todas as tabelas de listagem do painel administrativo agora exibem controles
  de paginação responsivos e consistentes: disciplinas, temas, campanhas,
  destinatários, financeiro, FAQ, métricas detalhadas de usuário e previews de
  importação.
- O controle compartilhado mantém o intervalo visível, desabilita os limites
  anterior/próxima e corrige páginas que ficaram inválidas após filtro, recarga
  ou exclusão. Usuários, questões, provas, avisos, notificações e flashcards
  preservam a paginação que já existia.
- O modal de destinatários troca o antigo "carregar mais" por navegação de
  páginas usando o `offset` da RPC, sem acumular e-mails de pessoas reais em
  memória. O conteúdo completo das prévias continua disponível para importar o
  lote inteiro.

## 2026-07-31 | Copy | sem commit

- Atualizada a comunicação da landing page e do painel visual do login para destacar **+4k questões para treinar**.

## 2026-07-31 | Feature | sem commit

**Pipeline de devolutiva generalizado: SOI, HAM e questões discursivas**

- `scripts/importar-prova-integradora/` → **`scripts/importar-prova-devolutiva/`**, e a skill junto. O pipeline nunca foi sobre a Integradora: é sobre o **relatório de devolutiva da AFYA**, e SOI, HAM e Integradora saem do mesmo gerador. O que variava entre elas estava embutido como se fosse fixo — o título procurado pela palavra `INTEGRADORA`, o bloco "Filtros da questão" assumido presente, alternativas assumidas obrigatórias.
- **Questão discursiva ponta a ponta.** SOI e HAM trazem duas por prova; a Integradora, nenhuma. O relatório não declara o formato: a discursiva é a que emite `Alternativas:` seguido de `--`, e a resposta esperada vem na resposta comentada. Ela entra no admin como `FORMATO: aberta` + `RESPOSTA_MODELO` — que é o gabarito exibido ao aluno e a referência que a **Aurora** usa para corrigir —, com crivo próprio (crivo 1b) no lugar do cruzamento por `(CORRETA)`, que ali é inaplicável. `PONTOS_CHAVE` e `CRITERIOS` saem vazios de propósito: o relatório não os traz, e destilá-los do texto seria inventar rubrica; ficam listados em `PENDENCIAS.md` como passe manual.
- **`formato: indefinido` é o terceiro valor, e é a razão de a classificação existir.** "Sem alternativa nenhuma" é exatamente o que se vê quando o autômato de rótulos erra e come o campo — sem esse terceiro estado, uma múltipla escolha mutilada entraria no acervo como discursiva, perda silenciosa disfarçada de formato. Só é discursiva quando o campo veio de fato vazio; campo com texto e sem `(alternativa X)` é bloqueio.
- **Enunciado com subitens ganhou corte próprio.** A discursiva termina numa lista de comandos (`a) Caracterize…`, `b) Explique…`, `c) Descreva…`), e o corte por parágrafo levava **só o item `c)`** para `ENUNCIADO`: nada se perdia, mas a questão entrava perguntando um terço do que pergunta. Exige dois itens em sequência alfabética fechando o enunciado — item isolado é lista dentro do caso clínico.
- **Título da prova virou posicional.** Procurar `INTEGRADORA` não achava nada em SOI nem em HAM, e filtrar por caixa alta reprovava `Nl ESPECIFICA SOi 4 04MAIO2023` (caixa mista e erro de digitação no próprio PDF). Agora é o que está solto acima de "RELATÓRIO DE DEVOLUTIVA DE PROVA", juntando as linhas quando o título quebra em duas.
- **Marcador `Nª QUESTÃO` deixou de exigir linha própria.** Em SOI e HAM o `-layout` o põe na mesma linha de outro elemento (`Enunciado:    1ª QUESTÃO`, `Feedback:    8ª QUESTÃO`), e ancorado em `^…$` ele não casava: **11 das 13 questões da SOI 2022.2 desapareciam em silêncio**. O texto que divide a linha é redistribuído — rótulo de abertura (`Enunciado:`, `Unidade de avaliação:`) vai para a questão que começa, rótulo de fechamento (`Feedback:`) fica com a que terminou.
- **Origem em caixa mista sem `[IES]` para confirmar.** `(AFYA Bragança)`, `(FASA Vic)`, `(AFYA Cruzeiro do Sul)` — SOI e HAM não trazem o filtro que confirmava a origem na Integradora, e a regra de caixa alta as rejeitava, deixando a sigla no meio do enunciado. Passa a bastar a primeira palavra ser sigla em caixa alta, o que nenhum caso clínico faz.
- Mais três defeitos de PDF digitalizado, todos da SOI 2023.1: **ordinal corrompido** (`12!! QUESTÃO`, que reprovava a prova inteira por lacuna na numeração), **hash de autenticação espaçado** (`000072. 59001d.`, que passava a limpeza e entrava como conteúdo de campo) e itens de comando em maiúscula.
- **`pdftotext` passou a ser chamado com `-enc UTF-8` explícito.** O build avulso do Git for Windows emite na codepage local, e aí "QUESTÃO" chega como bytes Latin-1 lidos como UTF-8: nenhum rótulo casa e a prova sai vazia **sem erro nenhum**. `pdfimages` virou opcional — sem ele o pipeline segue com aviso e perde só o sinal de raster embutido, em vez de derrubar tudo com `ENOENT`.
- **O relatório de 2022.2 vem em duas colunas** (rótulos empilhados à esquerda, texto todo à direita) e ali `Alternativas:` aparece na altura da segunda linha do enunciado — o autômato transiciona cedo e metade do enunciado vira alternativa. Detectado por indentação (1%–3% das linhas de conteúdo passam da coluna 15 nas provas lineares, 84%–86% nessas) e **bloqueado com essa mensagem**, em vez de importar questão deformada. Prova de 2022.2 entra à mão pelo `/admin/questoes`.
- `verificar-roundtrip.mjs` (compartilhado com o pipeline do TPI) confere a discursiva campo a campo: formato `resposta_aberta_curta`, resposta modelo intacta e ausência de alternativa. `formato` ausente na validação continua significando fechada, então o TPI não muda de comportamento.
- **Julgamento empacotado num parágrafo só deixou de acusar em falso.** A IESC 2025.2 escreve os quatro vereditos seguidos, sem linha em branco (`Incorreto: … Correto: … Incorreta: …`), e o comentário inteiro virava **um** parágrafo: o veredito lido era o do começo do bloco, que julga outra alternativa, e a questão 1 saía com o gabarito acusado de errado. O comentário agora é subdividido nas fronteiras de frase seguidas de veredito — mas **só quando ele próprio abre com um veredito**, porque o formato espelhado da IESC 2025.1 (`<citação da alternativa>. Incorreta: <justificativa>`) se comporta ao contrário: cortar ali junta a justificativa de uma alternativa com a citação da seguinte e desloca tudo em um, o que acusou o gabarito correto da questão 4. Sem o corte esse formato fica em `sem_eco`/`presenca` — ausência de confirmação, que é diferente de acusação. Os dois formatos viraram teste.
- Resultado: **19 provas de calibração, 16 rodando ponta a ponta** com round-trip íntegro — 3 Integradoras (50 questões cada), 5 SOI (15 cada: 13 fechadas + 2 discursivas), 3 HAM (10 cada: 8 + 2) e 5 IESC (10 cada: 8 + 2). As três de 2022.2 bloqueiam com diagnóstico. `testar.mjs`: 64 → 114 verificações.

**Pipeline de importação da prova Integradora**

- Novo pipeline em `scripts/importar-prova-integradora/` + skill `importar-prova-integradora`, para a **Integradora** (N1+N2 por período), que chega como relatório de devolutiva da AFYA: PDF com camada de texto em 100% das páginas, uma seção por questão, resposta certa marcada em linha (`(alternativa C) (CORRETA)`). **Nenhuma etapa envolve IA e o custo em tokens é zero** — enunciado, alternativas, gabarito, explicação, referências e classificação saem por regex do próprio PDF. Separado do `importar-prova-scan`, que existe porque a TPI é digitalizada e precisa de visão.
- **Imagem e tabela são sinalizadas, nunca convertidas em texto.** O relatório é documento de texto: quando a questão original tinha figura, o gerador não a incluiu, então não há recorte a extrair — o entregável é a lista de questões com **um trecho do enunciado para buscar** no `/admin/questoes` e anexar a figura à mão. Tabela tem o bloco de colunas alinhadas substituído por placeholder na posição em que estava, com o conteúdo removido preservado em `PENDENCIAS.md` para remontar a grade. Achatar tabela em prosa produz enunciado sem sentido, e é o que o pipeline evita.
- Detecção de figura exige **dêixis** ("observe a imagem abaixo", "a radiografia a seguir"): é o que separa figura anexa de achado narrado por escrito ("a ultrassonografia revelou imagem hiperecogênica de 8 mm"). `quadro` ficou fora do detector de propósito — em texto médico "quadro clínico"/"quadro febril" é o caso do paciente e dava dezenas de falsos positivos por prova.
- Crivo de gabarito próprio: `(CORRETA)` é metadado da questão e a resposta comentada é prosa de quem escreveu, então são **duas fontes independentes dentro do mesmo PDF**. Cinco níveis de cobertura, com `forte_por_eliminacao` (o comentário chama de incorretas todas as outras) porque a justificativa da correta costuma parafrasear em vez de transcrever — sem essa regra metade da prova ficaria sem confirmação.
- Questões de assertivas (`I, apenas.`, `III e IV.`) ganharam o crivo mais forte do pipeline: o comentário julga cada numeral romano, então dá para montar o conjunto dos corretos e achar a alternativa que o reproduz. Comparar conjunto contra conjunto não depende de similaridade de texto — no pipeline do TPI esse caso virava `cruzamento_inaplicavel` e ficava sem conferência nenhuma.
- Três defeitos reais da prova de calibração viraram reparo ou flag: **rótulo casado sem sensibilidade à caixa** fazia a questão 7 perder as quatro alternativas em silêncio (a linha `referência: 0,4 a 0,9 mg/dL)` do enunciado casava com `Referências:` e pulava o autômato para a bibliografia); **ligadura tipográfica e acento decomposto** quebravam busca no admin (`ﬁsiopatológico` é um codepoint só); e um parágrafo com a **camada de texto embaralhada** (`regiã o`, `vô mitos`, `dnáuseasas`) que não tem reparo mecânico e agora é flag alta. Campo obrigatório vazio no fim da extração passou a ser bloqueio: perda silenciosa é o pior modo de falha.
- Divisão apoio/pergunta em dois cortes, nenhum deles descartando ou reordenando texto: por parágrafo (35 de 50 questões) e por fronteira de frase antes de abertura de comando (14 de 50, porque nessas o caso e a pergunta estão no mesmo parágrafo). Quando nenhum se aplica com segurança o enunciado fica em campo único — `ENUNCIADO_APOIO` é opcional no admin, e corte errado é pior que nenhum corte.
- Reaproveitados do pipeline do TPI, em vez de duplicados: `lib/texto.mjs` (comparação e desdobramento de texto de PDF) e `verificar-roundtrip.mjs`, que roda o `parseBlocos()` de verdade do `admin-importar.component.ts` contra o markdown. Duplicar o round-trip criaria duas versões do único teste que fala com o parser de produção.
- Resultado na Integradora 4 (2025.2): 50 questões extraídas, 50 no markdown, round-trip íntegro. A questão 46 saiu do PDF com a camada de texto embaralhada e foi corrigida à mão em `questoes-revisadas.json` (`regiã o` → região, `dnáuseasas` → de náuseas, `dolo(sa` → dolorosa, `compativelem que` → compatível com, e a referência `Gastroe4.ªerologia` → Gastroenterologia).
- `validar.mjs` passou a aplicar a revisão manual **antes** dos crivos, recalculando o detector de corrupção sobre o texto corrigido. Antes a questão mantinha a flag original e ganhava só um "mas foi revisada" por cima, então uma correção que ainda deixasse texto corrompido passava batido — o loop de revisão era decorativo.

**Segunda prova: Integradora 4 (2025.1)**

- 50 questões, 50 no markdown, round-trip íntegro. A prova exigiu ajuste do parser em cinco pontos, o que é a melhor medida disponível de quanto o formato varia entre edições: prefixo de origem em **caixa mista** (`(AFYA Paraíba)` contra `(FESAR)` — agora confirmado contra o filtro `[IES]` da própria questão em vez de heurística de capitalização), **vocabulário de rótulo** diferente no comentário (`Comentário: Correta.` e `Classificação: incorreta.` contra `Alternativa correta:`), comentário organizado **em seções** (`Resposta correta:` … `Por que as demais estão incorretas:`, que agora valem para os parágrafos seguintes), valor de filtro `[IES]` **duplicado**, e figura de verdade embutida no PDF.
- **Crivo de gabarito deixou de acusar em falso.** A 2025.1 produziu 7 flags altas, e 6 eram falso positivo — o pior defeito possível num crivo de gabarito, porque queima a confiança no relatório inteiro. Três causas distintas, todas corrigidas e cobertas por teste: veredito lido de dentro do texto da própria alternativa (`"A assertiva I é verdadeira e a II é falsa."` sendo acusada de incorreta pelo "falsa" que ela mesma contém); oração concessiva lida como veredito (`"Erro: Embora … estejam corretos, o Albendazol …"` virando "correta" pelo "corretos", quando o veredito é o `Erro:` inicial); e empate de bigramas quando o discriminador é um caractere só (`"Hepatite viral tipo A aguda"` casando com o parágrafo da tipo B, porque a letra é curta demais para virar token). Agora o veredito só é lido **em posição de veredito** — início do parágrafo, rótulo curto anterior, parágrafo seguinte quando o atual é citação pura, ou seção — e empate sem margem não decide nada.
- **Detector de corrupção deixou de acusar `prevê`.** A terminação em `ê` saiu do nível "certo": ao contrário das nasais `ã`/`õ`/`ô`, cuja lista de palavras válidas é fechada, as formas verbais de terceira pessoa (`vê`, `lê`, `crê`, `prevê`, `provê`, `revê`) são classe aberta. `"a rede Alyne, que prevê mais estrutura"` é português correto e estava bloqueando a questão 25.
- **Novo `extrair-imagens.mjs`**: a 2025.2 sustentava que o gerador do relatório sempre descarta a figura, e a 2025.1 desmentiu — a questão 28 traz os dois gráficos de crescimento da OMS embutidos na página 67, e o enunciado depende deles ("Após colocar os dados antropométricos nos gráficos…"). O script extrai o stream JPEG sem recompressão para `saida/imagens/qNNN-N.jpg`, descartando logo e elementos de template por assinatura repetida. `gerar.mjs` agora marca no resumo quais questões têm raster extraível e deixou de apagar `saida/` inteiro (levava as figuras já extraídas junto).
- Divisão apoio/pergunta ficou mais geral e menos dependente de lista de palavras: o corte por **última frase interrogativa** não precisa reconhecer abertura nenhuma, só o `?` no fim. Também foi corrigido um `\b` que caía no meio de palavra e fazia `diante\s+d` nunca casar com "diante do" — o mesmo defeito de classe que já tinha atingido `corret`. Nas duas provas, 49 das 50 questões agora dividem, e a única que não divide é a que tem a pergunta no meio seguida das assertivas, onde dividir exigiria reordenar o texto.
- `testar.mjs`: 51 → 64 verificações. Cada novo teste é um defeito que passou em silêncio uma vez.

**Terceira prova: Integradora 4 (2024.2)**

- 50 questões, 50 no markdown, round-trip íntegro. Mais quatro defeitos de classe nova, o que confirma o padrão: **cada edição exige ajuste do parser**, e vale contar com isso em vez de assumir que a próxima passa limpa.
- **Marca d'água entrando como enunciado.** O PDF foi redistribuído com um stamp (`www.acervo.top/integradora-iv …`) na margem direita da linha `Enunciado:`, e o `-layout` o entregava como primeira linha do enunciado da questão 1 — além de empurrar o `(FACIMPA)` para o meio do texto e quebrar a detecção de origem. Campo de bloco (`enunciado`, `alternativas`, `comentario`, `referencias`) agora ignora conteúdo na mesma linha do rótulo quando separado por vão de 5+ espaços, porque nesse relatório o valor sempre começa na linha seguinte. `Filtros da questão:` fica de fora da regra: lá a chave `[Semanas]` é emitida na linha do rótulo com vão largo e é valor de verdade. Nada é descartado em silêncio — vira aviso da extração.
- **`quadro` + dêixis saiu do detector de tabela.** A dêixis desambigua figura ("observe a radiografia abaixo") mas não desambigua `quadro`: em prosa médica *"Diante do quadro acima, analise as assertivas"* é o caso do paciente, e era o único "achado" de tabela da prova. Sobraram as formas em que a palavra só pode ser grade (`tabela`, `quadro 2`, `quadro comparativo`); tabela de verdade continua sendo pega pelo sinal estrutural de colunas alinhadas, que não depende de como o enunciado a chama.
- **Alternativa degenerada virou bloqueio.** Na questão 21 a alternativa C do PDF é literalmente `x` — erro de digitação da questão original da AFYA, não da extração. Alternativa com 4 caracteres ou menos agora barra a questão, porque `x` não pode entrar no acervo como alternativa. Em troca, o antigo `alternativa_curta` (limiar de 12 caracteres) deixou de existir: resposta de uma palavra é normal em prova médica (`Fimose.`, `Sífilis.`, `Baby blues.`) e gerava 8 avisos inúteis por prova. A resposta comentada revelou a alternativa perdida — discute "Hipospadia (Incorreta)", que não corresponde a nenhuma das outras três —, e a correção foi aplicada em `questoes-revisadas.json` com a evidência registrada.
- **Tabela pode chegar como imagem.** A questão 24 traz a "TABELA 38-1 — Taxas de falha dos contraceptivos" como raster, não como texto: o detector de tabela corretamente não acha nada (não há texto para alinhar) e o caminho de imagem resolve.
- **Imagem em página dividida por duas questões.** Uma questão termina no meio da página em que a seguinte começa, e o `pdfimages` não informa posição vertical, então a página sozinha não diz de quem é a figura — a tabela dos contraceptivos (página 36) era creditada à questão 24, que é dela, **e** à 25, que é sobre fases do parto, e o arquivo era extraído duas vezes. `extrair.mjs` agora detecta a ambiguidade sem ler a imagem e emite sinal explícito; `extrair-imagens.mjs` extrai cada imagem **uma vez** e desempata por OCR, comparando o texto da figura com o de cada candidata e exigindo margem (aqui: `Q24:0.36 Q25:0.04`). Sem `tesseract` o desempate não roda e a imagem sai marcada como ambígua, com nome de página, em vez de ser atribuída no chute.
- Registrado que **a força do cruzamento varia muito entre edições** e depende de como a devolutiva foi escrita: 27 gabaritos confirmados na 2025.2, 19 na 2025.1 e 12 na 2024.2, cujo comentário parafraseia as alternativas em vez de citá-las e às vezes explica o conceito sem dizer "correta"/"incorreta". Não é defeito de extração, é confirmação ausente — e o relatório continua distinguindo as duas coisas em vez de somar tudo como "verificado".
- `testar.mjs`: 64 → 71 verificações.

---

## 2026-07-31 | Docs | sem commit

**Escopo da skill de importação delimitado a TPI**

- A skill `importar-prova-scan` e o README passam a declarar que servem **só para TPI** (Teste de Progresso Institucional), o único tipo de prova do acervo que chega como PDF digitalizado. Treinos Nacionais, Simulados Processuais e Laboratório são autorais e entram direto pelo `/admin/questoes`; prova com camada de texto nas questões não precisa do pipeline (`pdftotext` resolve). A `description` da skill ganhou o "NÃO use para…" explícito, para não ser acionada em conteúdo autoral.
- Limites declarados: o pipeline foi calibrado e testado em **uma** prova (TPI 2025.1, 46 páginas de scan, 120 questões), e os limiares saíram dela — eco no OCR 0.45, cruzamento 0.6/0.34, faixa de zoom 470px. Como os scripts imprimem os números e não só o veredito, muitas flags `sem_eco_no_ocr` de uma vez indicam recalibrar o limiar, não transcrição ruim.
- Documentado o que é genérico e o que é específico do formato do relatório AFYA: a arquitetura de verificação (4 crivos, OCR como testemunha, zoom, round-trip) vale para qualquer prova fotografada, mas a classificação das seções está em três regex de `lib/pdf.mjs` — gabarito espera a tabela `001 (E)`, devolutiva espera `Nª QUESTÃO`/"Resposta comentada:", scan é página com menos de 60 caracteres alfanuméricos. Estrutura diferente faz `extrair.mjs` sair com erro em vez de adivinhar.
- Registrado o custo de rodar **sem devolutiva**: o crivo 3 desaparece (é o que confere se o gabarito aponta para a alternativa certa), o preenchimento automático de `[?]` perde a única fonte confiável, a regra "devolutiva acima da folha" fica sem efeito, e as questões entram sem `EXPLICACAO` nem `REFERENCIA`.
- Bloco de comandos do README atualizado: estava descrevendo o fluxo antigo de dois passes de IA e sem `ocr.mjs`, `zoom-lacunas.mjs` e `limpar.mjs`.

---

## 2026-07-31 | Fix + Tooling | sem commit

**Importação de prova digitalizada: lacunas automáticas, relatório de pendências e limpeza**

Fechamento do pipeline depois de importar a TPI 2025.1 inteira (120 questões) com sucesso.

- **Preenchimento automático de trecho ilegível** (`lib/lacunas.mjs`): o transcritor marca `[?]` onde a foto está ilegível, e revisar isso à mão era o gargalo — 22 questões na TPI. Agora o pipeline resolve casando o padrão da palavra danificada (`avaliaç[?]` → `^avaliac.{0,14}$`) contra a devolutiva, ancorado nas palavras vizinhas *inteiras*. Duas versões foram medidas antes de escolher: âncora de 26 caracteres exatos deu **14% e com resultados errados** (`avaliaç«ão e» especializada`), porque a borda da âncora cai no meio de uma palavra e é ali que o OCR tem ruído; casamento por palavra deu **19% com 7 de 7 corretos**. O OCR foi **descartado como fonte de preenchimento** — acertou 2 de 8, porque o ponto está ilegível na foto e o OCR erra exatamente ali (deu "nbilical" para *umbilical*, "Dk" para *DNA*). Marca isolada entre espaços é rejeitada: sem prefixo nem sufixo não há padrão, e o casamento capturava a própria palavra-âncora ("atividade física física").
- **Resolução por zoom** (`zoom-lacunas.mjs`): a causa raiz do `[?]` é resolução. A página tem ~7,7 MP e a leitura de imagem reduz para ~1,15 MP — 2,6× menos resolução linear, justo onde a letra já era ruim. Recortar faixas de 470px na largura nativa mantém 1,02 MP, então **nenhum pixel é descartado** e o trecho fica legível. 83 faixas para 29 lacunas. Bug corrigido no caminho: questão que atravessa páginas usava o percentual da primeira página nas seguintes, recortando a região de outra questão.
- **Dedução explícita e separada**: em vários casos os caracteres estão **fisicamente fora da foto** (cortados pela borda ou encadernação) e nenhum zoom recupera. O pipeline agora completa a palavra pelo fragmento visível mais contexto, mas marca `lacuna_deduzida` (média) em vez de `lacuna_preenchida` (baixa) — texto deduzido não é texto verificado. Medido contra a revisão manual do usuário: **10 idênticos, 6 diferentes**, e entre as diferenças o automático acertou 2 que passaram na revisão humana (o "I-" de uma enumeração e uma conjunção "e"). Os agentes deixaram 3 lacunas pendentes em vez de chutar (dígito de espaço intercostal coberto pela dobra, onde 2º a 5º são todos plausíveis).
- **Trava contra resolução que mexe fora da lacuna** (`validarResolucao`): confere mecanicamente que cada pedaço do texto original entre marcas reaparece na ordem, e que o crescimento é proporcional ao número de lacunas. Regra de prompt não garante isso.
- **Detecção de tabela/quadro** em `validar.mjs`: tabela transcrita achatada em texto corrido (rótulo "Tabela:/Quadro:/Gráfico:", ou densidade de `|` e ` / ` no apoio) recebe flag `tabela_complexa` e entra no relatório de pendências. O conteúdo está lá, a grade não.
- **Relatório final de trabalho manual** em `gerar.mjs`: termina imprimindo o bloco `INSERIR MANUALMENTE DEPOIS DE IMPORTAR`, questão por questão, com imagem e tabela separadas, gabarito, página do scan, caminho do recorte e um **trecho para busca** no `/admin/questoes`. O trecho vem do começo do texto de apoio, não da pergunta: pergunta de prova é genérica e se repete ("É correto o que se afirma em" aparece em várias), enquanto o começo do caso clínico é praticamente único. A pergunta completa de cada questão também vai no `PENDENCIAS.md`. É a única parte que o pipeline não resolve, então precisa ser dita explicitamente em vez de ficar só no `PENDENCIAS.md`. A skill agora obriga repassar essa lista no fechamento.
- **Limpeza** (`limpar.mjs`): remove o intermediário — páginas do scan, OCR, recortes de zoom e `revisao.html` (que fica com todas as imagens quebradas sem `paginas/`) — liberando 48,6 MB numa prova de 46 páginas, e preserva o que é registro: markdown, validação, gabarito, devolutiva, transcrição e revisão manual. `--raiz` recolhe para o diretório de trabalho os arquivos que escapam para a raiz do projeto (o PDF de entrada e o `questoes-revisadas.json` baixado pelo navegador). `--seco` mostra sem apagar, `--tudo` remove o diretório inteiro.
- `.gitignore`: `/questoes-revisadas*.json` na raiz, que era a única contaminação real da árvore — `.trabalho/` e os PDFs já estavam cobertos.
- `precisa_imagem` passou de alta para média: o texto da questão está verificado como qualquer outro, só a figura não viaja pelo markdown. Bloquear a importação por isso deixava a questão de fora em vez de entrar sem a imagem, e o `PENDENCIAS.md` já garante que não seja esquecida.

---

## 2026-07-31 | Fix + Tooling | sem commit

**Importação de prova digitalizada: correção da resolução de gabarito e redesenho de custo**

Rodar o pipeline de verdade na TPI 2025.1 (46 páginas, 120 questões) expôs um bug de correção e um problema de custo. Os dois estão corrigidos.

- **Bug: a regra "devolutiva acima da folha" trocava gabarito errado** (`lib/gabarito.mjs`). Duas causas, ambas encontradas por dados reais:
  - *Letra tinha prioridade sobre texto.* Na Q93 a devolutiva diz "letra A, por Incontinência urinária de esforço" — mas "de esforço" é a alternativa **B**, a mesma da folha. A letra citada pelo comentarista está errada e o texto está certo. Agora o **texto ganha da letra**: é imune a alternativa transcrita fora de ordem, enquanto a letra depende de uma ordem que quem comentou pode ter errado. Quando os dois discordam, vale o texto e a questão recebe flag alta `devolutiva_inconsistente`.
  - *A janela da afirmação atravessava para os distratores.* Na Q11 a janela de 260 chars capturou "…fertilidade. ALTERNATIVA: Embolização das artérias uterinas. **Incorreta**: …" e trocou o gabarito para uma alternativa explicitamente marcada como incorreta. Agora a janela é recortada no primeiro marcador de distrator (`ALTERNATIVA:`, `Incorreta`, `Errada`, `Distratores`, `Justificativa`, `Comentários:`).
  - Resultado: de 2 trocas espúrias para **zero**. Os dois casos entraram como teste de regressão (43 verificações em `testar.mjs`).
- **Custo: ~80% dos tokens era overhead de subagente, não trabalho.** Medido: ~26k tokens por página, dos quais só ~5k são conteúdo (prompt 2k + imagem 1,5k + JSON 1,2k); o resto é system prompt e schema de ferramentas do agente `general-purpose`, reenviados a cada turno. Dois passes das 46 páginas custaram ~2,4M. Quatro mudanças, sem tocar nos crivos:
  - Novo agent type `transcritor` (`.claude/agents/transcritor.md`) com apenas Read+Write e modelo sonnet — a tese do pipeline é que a garantia vem dos crivos mecânicos, não da esperteza do transcritor.
  - Lotes de 5–6 páginas por agente em vez de uma página por agente: o overhead é pago por agente, então 8 agentes fazem o trabalho de 46.
  - Prompt de transcrição colado inline no despacho, em vez de cada agente ler o arquivo (economiza um turno de contexto cheio por agente).
  - **Segundo passe de IA substituído por OCR** (`ocr.mjs`, tesseract): custa zero e é melhor ciência — dois passes do mesmo modelo erram de forma correlacionada, enquanto um motor OCR clássico erra de forma completamente diferente de um LLM (confunde glifo, não alucina frase plausível). Pré-processa com escala de cinza, autocontraste e upscale das páginas de baixa resolução. Estimativa do redesenho: ~300k contra ~2,4M.
- **Novo crivo 2b em `validar.mjs`**: cobertura contra o OCR da página. Não é diff estrito (foto torta destrói o layout), é eco — cada trecho transcrito tem que aparecer no OCR da mesma página, medido por `similaridadeVocabulario`, que é robusta a ruído de glifo. Pega alucinação e troca de palavra; não pega alternativa fora de ordem. Página com menos de 200 caracteres reconhecidos é descartada como testemunha em vez de contar como verificada.
- **Modo de um passe** (`--um-passe`, ou automático quando `passe2/` está vazio): permite validar e gerar markdown sem pagar o segundo passe, com a falta de consenso graduada pelas outras testemunhas — `sem_segundo_passe_ia` (baixa, devolutiva + OCR confirmam), `sem_consenso_mas_ocr` / `sem_consenso_mas_cruzada` (média, uma testemunha só) e `sem_consenso` (alta, nenhuma). O relatório lista quais páginas ainda precisam de testemunha, para gastar só onde falta.
- Estado da TPI 2025.1: passe 1 completo, 120 questões, numeração sem lacuna; 36 sem nenhum problema além da falta do segundo passe; 20 com trecho ilegível marcado `[?]` (nessas o segundo passe não ajuda — o scan é ilegível ali, só olho humano resolve), 4 precisam de figura, 2 com devolutiva contraditória (Q11, Q93).

---

## 2026-07-30 | Tooling | sem commit

**Pipeline de importação de provas digitalizadas com verificação cruzada**

- Novo pipeline em `scripts/importar-prova-scan/` + skill `importar-prova-scan`, para PDFs de prova que são foto da prova de um aluno — o caso em que pedir a transcrição direto para uma IA no `/admin/importar` produz texto quebrado, alternativas não confiáveis e gabarito errado. A garantia não vem de a IA acertar: vem de cada campo ser conferido contra uma segunda fonte independente do mesmo PDF.
- **Descoberta que muda a abordagem**: esse formato de PDF não é todo imagem. Na TPI 2025.1, 99 das 145 páginas têm camada de texto — páginas 1–46 são scan, 47–48 são a folha de gabarito e 49–145 a devolutiva comentada. Gabarito (120 letras), explicação, distratores e referências saem por regex, com fidelidade absoluta; só enunciado e alternativas passam por IA. `extrair.mjs` classifica as seções e falha com exit 1 se alguma página com texto não se encaixar.
- **Marcação à mão é veneno**: o scan traz as respostas do aluno (setas, círculos, X) e elas erram — na questão 3 o aluno circulou "Leucemia Mieloide Aguda" e o gabarito oficial é "Leucemia Linfoide Aguda". `PROMPT-TRANSCRICAO.md` proíbe transcrever qualquer manuscrito, e `carregarPasse()` rejeita arquivo de transcrição que traga campo de gabarito. O gabarito só existe em `gabarito.json`.
- **Quatro crivos em `validar.mjs`** (tudo determinístico): estrutura (5 alternativas a–e, gabarito aponta para alternativa existente), consenso entre dois passes independentes de transcrição com diff palavra a palavra, cruzamento contra a devolutiva oficial, e integridade (`[?]`, `�`, parênteses desbalanceados, truncamento, palavra colada). O crivo de consenso pega erro que um passe cometeu e o outro não; o de cruzamento pega erro que os dois cometeram igual (falha correlacionada do mesmo modelo) — testado injetando os dois tipos.
- **Cruzamento por bigrama, não por saco de palavras**: alternativas de prova médica diferem por uma palavra, então containment de unigramas dá 1.0 para todas e não distingue nada. Duas métricas com papéis distintos: `similaridade` (bigrama) decide *qual* alternativa a devolutiva descreve; `similaridadeVocabulario` (unigrama em janela deslizante) decide se o texto *existe*, robusta a reescrita, e é a rede contra corrupção de OCR.
- **A força do cruzamento varia e o relatório declara**: nível forte (a devolutiva nomeia a letra), média (transcreve a resposta correta — 32/120 nesta prova) ou presença (só confere que a alternativa existe no texto oficial). Nível presença pega OCR corrompido mas não pega troca de ordem das alternativas, porque só 7 das 120 questões têm seção `Distratores:` separada — no resto a devolutiva comenta todas as alternativas no mesmo bloco. `relatorio-validacao.md` traz a distribuição para não confundir "sem flag" com "verificado a fundo".
- **Regra de negócio — devolutiva acima da folha** (`lib/gabarito.mjs`): entre as duas fontes oficiais do PDF, a devolutiva comentada vale mais que a folha de gabarito seca. Onde discordam, a troca é automática e apenas registrada (flag `gabarito_ajustado_pela_devolutiva`, severidade média — não bloqueia). Três caminhos em ordem de força: `devolutiva_letra` (a devolutiva nomeia a letra; não depende do scan), `devolutiva_texto` (a devolutiva transcreve a resposta certa e vale a alternativa cujo **texto** casa com ela — decidir por texto e não por letra torna a resolução imune a alternativa transcrita fora de ordem) e `folha`. O caminho por texto exige margem sobre a segunda colocada: empate entre alternativas parecidas cai de volta na folha e deixa o crivo 3 sinalizar. `validacao.json` guarda `letra_oficial` (em uso), `letra_folha` e `gabarito_origem`; `relatorio-validacao.md` lista as trocas.
- **Achado no PDF de origem**: a questão 93 se contradiz — a folha de gabarito diz **B** e a devolutiva diz "A resposta correta seria letra A". Pela regra acima, vale **A**.
- **Bug corrigido no parser do `/admin/importar`** (`parseQuestaoBloco()` em `admin-importar.component.ts`): os campos eram detectados por prefixo de linha *case-insensitive* em qualquer posição do bloco, e conteúdo de prova tem linhas assim. Uma legenda `Fonte: Federação Internacional...` no texto de apoio era consumida como o campo `FONTE` e **desaparecia** do enunciado; uma linha `Gabarito: A alternativa correta...` na explicação casava com `/^GABARITO:\s*([A-Ea-e])/i` e **invertia o gabarito** para A. Silencioso nos dois casos — a questão entrava mutilada sem nenhum erro de validação. Duas regras novas desambiguam rótulo de conteúdo: (1) **primeira ocorrência ganha** em campo de valor único, já que o template emite todos antes de `EXPLICACAO`, então repetição depois é conteúdo; (2) dentro de seção de texto livre (`ENUNCIADO`, `ENUNCIADO_APOIO`, `EXPLICACAO`, `RESPOSTA_MODELO`) o rótulo só vale na **forma canônica em maiúsculas** — o template sempre usa maiúscula, prosa de prova não. Cabeçalhos de seção (palavra isolada) seguem tolerantes a caixa. Efeito colateral aceito: markdown com rótulo em minúsculas dentro de texto livre passa a ser lido como conteúdo, o que aparece como erro de validação visível em vez de corrupção silenciosa. 4 casos novos em `admin-importar.parser.spec.ts` (11 no arquivo, 747 na suíte, tudo verde).
- `gerar.mjs` também blinda do lado da geração, defesa em profundidade para markdown consumido por versões antigas do parser: gruda a linha suspeita na anterior (texto preservado, só a quebra de linha muda) e, quando o rótulo cai na primeira linha de um campo — onde não há para onde grudar, já que o parser dá `trim()` antes de testar —, exclui a questão em vez de emiti-la quebrada.
- `verificar-roundtrip.mjs` transpila `admin-importar.component.ts` e roda o `parseBlocos()` de verdade contra o markdown gerado, conferindo campo por campo que nada se perdeu nem mudou. Etapa obrigatória antes de colar no admin.
- `revisao.mjs` gera `revisao.html` auto-contido: scan da página à esquerda posicionado na questão, transcrição editável à direita, flags do validador e o passe 2 para comparar; autossalva em localStorage e baixa `questoes-revisadas.json`. Correções vão nesse arquivo, nunca editando `validacao.json` — `gerar.mjs` mescla campo a campo, então a revisão sobrevive a um novo `validar.mjs`.
- `recortar.mjs` recorta as figuras embutidas (ECG, cardiotocografia) a partir da banda vertical estimada na transcrição; o markdown do admin não carrega imagem, então essas questões entram sem figura e ficam listadas em `PENDENCIAS.md` para anexar em `/admin/questoes`. `testar.mjs` cobre discriminação do cruzamento, costura de questão partida entre páginas e desdobramento do texto do PDF (27 verificações).
- `.trabalho/` e PDFs na raiz entraram no `.gitignore`: contêm material de prova e fotos com dados de aluno.
- `CLAUDE.MD`: removida a regra que proibia reproduzir questões reais da Afya e afirmava conteúdo 100% autoral (regra de negócio mudou). Mantida a proibição de afirmar parceria/vínculo oficial.

---

## 2026-07-30 | Feature | sem commit

**Campanhas de e-mail personalizadas via Resend**

- Migration `20260730120000_campanhas_email_resend.sql`: novas colunas em `profiles` (`email_marketing_optout`, `email_marketing_optout_em`, `email_token` uuid único para o link de descadastro), tabelas `email_campanha` (histórico do disparo) e `email_campanha_destinatario` (log por e-mail, com `resend_id`, UNIQUE `(campanha_id, email)` — base da idempotência e da retomada). RLS: leitura só para admin, escrita só via service role.
- Segmentação definida em SQL na função `email_publico_alvo(segmento)` (grant só para `service_role`), com os segmentos `sem_assinatura_ativa`, `nunca_assinou`, `ex_assinantes` e `todos`. Todos excluem admins, banidos, quem pediu descadastro e contas com e-mail não confirmado. `admin_contar_publico_email` dá a prévia no admin pela mesma função, então a contagem exibida é exatamente o público do disparo.
- Envelope da marca aplicado no envio (`envelopeCampanha` em `_shared/campanha-email.ts`): header em gradiente com a logo branca, card branco de 560px sobre fundo cinza e rodapé com o link de descadastro — o mesmo desenho de `supabase/email-templates/{confirm-signup,reset-password}.html`, em `<table>`/style inline e com fallback VML do gradiente para o Outlook. O campo do admin passa a ser o **conteúdo do card**, não o e-mail inteiro: não há como quebrar o layout editando o corpo, e mudar o visual de todas as campanhas é mexer numa função. O rodapé do envelope já traz `{{link_descadastro}}`, então `garantirRodapeDescadastro` fica como invariante (nunca tem o que anexar).
- Prévia do e-mail na própria tela: modo `previa` da edge function renderiza pelo mesmo `montarEmail()` do disparo (tokens substituídos, rodapé de descadastro anexado) e devolve o HTML, sem tocar no Resend nem na base — funciona antes do domínio estar verificado e sem `RESEND_API_KEY`. O frontend não remonta nada, então o preview não divirge do envio; o corpo aparece num `<iframe sandbox>` (sem `allow-scripts`/`allow-same-origin`) com largura alternável entre 640 px e 375 px, atualizando ~0,7s depois da última tecla.
- Nova edge function `enviar-campanha-email` (admin-only) com três modos de envio: `teste` (uma cópia para o próprio admin, sem registrar campanha), `enviar` (materializa a lista, cria a campanha e dispara em lotes de 100 pelo `/emails/batch` do Resend, com 600ms entre lotes e retry em 429/5xx) e `retomar` (reenvia só o que ficou `pendente`). A function encerra sozinha aos ~100s marcando a campanha como `parcial`, em vez de ser derrubada no meio de um lote.
- Personalização por template: `{{primeiro_nome}}`, `{{nome}}`, `{{email}}` e `{{link_descadastro}}`. Valores vindos do banco são escapados no corpo HTML (e não no assunto). Helpers puros em `_shared/campanha-email.ts` com testes em `_shared/campanha-email.test.ts`.
- Opt-out: header `List-Unsubscribe` em todo envio (sem `List-Unsubscribe-Post`: declarar o um-clique da RFC 8058 exigiria uma URL que processa POST, e a nossa é uma página do SPA — um POST devolve 200 sem gravar, o provedor avisaria a pessoa que ela saiu e ela receberia a campanha seguinte), página pública de descadastro, nova RPC pública `descadastrar_email_marketing(token)` e nova rota pública `/descadastrar` (`DescadastrarComponent`). O opt-out é reconferido no envio, então quem se descadastra antes da retomada não recebe.
- Nova tela `/admin/campanhas` (`AdminCampanhasComponent`, menu Comunicação): editor de assunto/HTML, seletor de público com contagem ao vivo, envio de teste, confirmação explícita antes do disparo e histórico com status e botão "Retomar".
- Modal "Destinatários" no histórico (migration `20260730200000`): lista por destinatário (e-mail, nome, status, quando, erro do Resend) com filtros por status e paginação de 200. Vem da RPC `admin_listar_destinatarios_campanha` (`SECURITY DEFINER`, `is_admin()` dentro), porque as tabelas não têm grant para `authenticated`. Ordena problema primeiro (falhou → pendente → cancelado → enviado), devolve o `total` do filtro via `count(*) OVER ()` para paginar sem segunda consulta, e a lista é descartada ao fechar o modal.
- "Retomar" passou a reprocessar os destinatários `falhou`, não só os `pendente`: sem isso, estourar a cota do Resend marcava as linhas como `falhou` e elas nunca eram tentadas de novo. `enviado` continua imune (é a garantia de não duplicar entrega). Junto, o status da campanha passou a ser derivado dos **totais do log** e não dos contadores da rodada — antes, retomar uma campanha em que nada saiu fechava ela como `enviada` com zero enviados, apagava o erro, preenchia `concluida_em` e bloqueava retomadas futuras. Novas regras: sobrou pendente → `parcial`; só falhas → `falhou`; parte entregue e parte falhou → `parcial`. E `email_campanha.erro` agora guarda a resposta literal do Resend (antes ficava `null` quando tudo falhava, deixando o admin sem motivo no histórico).
- Migration `20260730180000_campanhas_email_grants.sql`: `GRANT SELECT, INSERT, UPDATE` em `email_campanha` e `email_campanha_destinatario` para `service_role`, e `REVOKE ALL` das mesmas tabelas para `anon`/`authenticated` — em produção o default privileges ainda concede `arwdDxtm`, então as tabelas nasceriam com escrita para o cliente, seguradas só pela RLS. O admin lê pelas RPCs `SECURITY DEFINER`, então tirar o SELECT direto não afeta a tela. A migration original esqueceu, e como o `ALTER DEFAULT PRIVILEGES` do schema `public` deste projeto não dá mais DML por padrão (sobrou só `Dxtm`), o disparo morria em `permission denied for table email_campanha` e a tela mostrava "falha ao registrar a campanha" — com o agravante de o **Enviar teste funcionar**, porque ele não toca nessas tabelas. Sem `DELETE`: a function nunca apaga histórico. Nada para `authenticated`, que lê pelas RPCs `SECURITY DEFINER`.
- Secrets novos das edge functions: `RESEND_API_KEY` e `RESEND_FROM` (reusa `APP_URL` para montar o link de descadastro). `EMAIL_ASSETS_URL` é opcional e só faz sentido em desenvolvimento: define o host da logo do envelope, porque o proxy de imagem do Gmail/Outlook não alcança o `localhost` da `APP_URL` e a logo chegaria quebrada — enquanto o link de descadastro precisa continuar local para ser clicável.

---

## 2026-07-23 | Fix | sem commit

**Filtro de matéria em Treinos Nacionais respeita o período da matéria**

- O filtro "Matéria" (`ProvasAfyaComponent`) passava só `disciplina_id`. Como uma matéria pertence a um único período, o filtro agora também amarra o período: envia o período da(s) matéria(s) selecionada(s) (interseção com o filtro de período manual, quando houver). Assim, uma prova com `disciplina_id` de período divergente do seu `periodo` (dado inconsistente) deixa de vazar — ex: filtrar "4º período" e aparecer prova do 1º.
- Causa-raiz no admin (`AdminProvasComponent`): trocar o período da prova não limpava a matéria já selecionada, salvando `disciplina_id` de outro período. Novo `onPeriodoFormChange` zera a matéria quando ela não pertence ao novo período.
- Migration `20260723120000_limpar_disciplina_id_periodo_divergente.sql`: zera `prova.disciplina_id` nas provas cujo vínculo aponta para disciplina de período diferente do `prova.periodo`, limpando os dados já inconsistentes.

---

## 2026-07-22 | Feature | sem commit

**Recurso e anulação de questões**

- Migration `20260722150000_questao_recurso_e_anulacao.sql`: novas colunas `questao.recurso_texto` (texto do recurso da faculdade), `questao.anulada` (anulação global do admin) e `tentativa_resposta.anulada_usuario` (anulação individual do aluno). Grant de `SELECT (recurso_texto, anulada)` para `authenticated` e índice parcial em `anulada`.
- Nova RPC `anular_questao_usuario(tentativa, questao, anular)`: aluno anula/desanula a questão numa tentativa ativa. Bloqueia (server-side) questões com recurso cadastrado ou já anuladas pelo admin — só questões "limpas" podem ser anuladas pelo aluno.
- Métricas passam a excluir questões anuladas (admin ou aluno) pelo predicado `(questao.anulada OR tentativa_resposta.anulada_usuario)`, redefinindo `finalizar_tentativa`, `consolidar_pontos_tentativa` (nota/`total_pontuaveis`), `montar_resultado_tentativa` (distribuição por tema + expõe `recurso_texto`/`anulada`/`anulada_usuario`), `get_historico_kpis` e `get_desempenho_por_tema`. `iniciar_tentativa`, `retomar_tentativa`, `get_revisao_prova` e `gerar_simulado_personalizado` passam a devolver `recurso_texto`/`anulada` nas questões. Notas já consolidadas não são recalculadas retroativamente.
- Novo componente compartilhado `QuestaoRecursoComponent` (com story e testes): faixa no topo da questão que mostra o banner de anulação (admin/aluno), o botão "Ver recurso" (texto expansível) e o botão discreto de "Anular questão" / "Desfazer". Integrado ao `QuestaoCardComponent` (novos inputs `anuladaUsuario`/`podeAnular`/`anulandoQuestao` e output `toggleAnular`), portanto aparece em execução, revisão e preview do admin. Ícones da lucide (`Scale`, `Ban`, `Info`, `FileText`, `Undo2`).
- Execução do simulado (`TentativaExecComponent`): botão de anular por questão (só nas sem recurso e não anuladas pelo admin), estado otimista com rollback, e questões anuladas deixam de ser contadas como "sem resposta" no aviso de finalização. `TentativaService.anularQuestao`.
- Revisão (`ProvaVisualizarComponent`) e resultado (`ResultadoSummaryComponent`) exibem a anulação em modo leitura; o resumo do resultado sinaliza quantas questões anuladas ficaram fora da nota.
- Admin de Questões: seção "Recurso e anulação" no criar/editar (textarea + checkbox de anular), badges "anulada"/"recurso" na listagem, e linhas + bloco de texto do recurso na visualização.

---

## 2026-07-22 | Feature | sem commit

**Filtro por matéria (hierárquico por período) em Treinos Nacionais**

- `UiMultiselectComponent`/`SelectOption` ganham suporte a agrupamento: campo opcional `group` nas opções — itens consecutivos com o mesmo `group` ficam sob um cabeçalho comum no dropdown (novo `.ui-select__group-label`). Retrocompatível: sem `group`, o comportamento é o mesmo de antes (lista plana). Nova story `ComGrupos`.
- Novo filtro "Matéria" em Treinos Nacionais (`ProvasAfyaComponent`), ao lado de Subtipo/Período: lista as disciplinas ativas agrupadas por período ("1º período", "2º período", ...) via `ProvaService.listarDisciplinas()` (novo método + model `Disciplina`). Seleção filtra `prova.disciplina_id` (`ListarProvasParams.disciplinaIds`) direto na query.

---

## 2026-07-22 | Feature | sem commit

**Backfill do vínculo prova → matéria: período 2**

- Migration `20260722140000_prova_disciplina_id_backfill_periodo2.sql`: agora que as matérias do período 2 (HAM II, IESC II, MCM II, SOI II) foram cadastradas, as 32 provas não-integradoras do período foram vinculadas à matéria correspondente por correspondência de nome, mesmo critério do período 1. As 5 integradoras do período seguem sem vínculo.

---

## 2026-07-22 | Feature | sem commit

**Vínculo prova → matéria (disciplina) + backfill do período 1**

- Nova coluna `prova.disciplina_id` (FK para `disciplina`, `ON DELETE SET NULL`, índice) — migration `20260722120000_prova_disciplina_id.sql`. Opcional: provas sem matéria única (ex.: integradoras) ficam com `disciplina_id = NULL`.
- Admin de Provas ganha select "Matéria" no formulário de detalhes (opções filtradas pelo período selecionado) e nova coluna "Matéria" na listagem. `admin_criar_prova_com_questoes` passa a gravar `disciplina_id` da prova.
- Backfill (produção): 38 provas do período 1 vinculadas à matéria correspondente por correspondência de nome (`N1/N2 <SIGLA> <ano.sem>` → sigla da disciplina), excluindo as 7 integradoras do período (ficam sem vínculo, como esperado). Períodos 2+ ainda não têm matérias cadastradas — backfill fica pendente até lá.

---

## 2026-07-20 | Feature | sem commit

**Resumos APG (materiais): scroll na lista, botão de voltar e filtro por nome**

- Tela de categoria de materiais (`MaterialCategoriaComponent`, ex. `/dashboard/materiais/resumos-apg`): a lista de arquivos ganha scroll próprio (`max-h-[70vh] overflow-y-auto`, `sticky top-4` no desktop) — antes a lista crescia sem limite e rolava a página inteira, deixando o visualizador do PDF fora de vista com muitos arquivos.
- Novo botão "Voltar aos materiais" no topo (navega para `/dashboard/materiais`) — antes só havia o breadcrumb como retorno.
- Novo campo de busca por nome (filtro client-side case-insensitive sobre `titulo` via `computed` `arquivosFiltrados`), com ícone de lupa, contador refletindo o filtro e estado vazio ("Nenhum arquivo encontrado."). Sem `FormsModule` — evento `(input)` + signal `termoBusca`.
- E2E: `materiais.spec.ts` (projeto `mocked`) cobre lista/contador, overflow da lista, retorno pelo botão e filtro (incluindo estado vazio).

---

## 2026-07-17 | Tweak | sem commit

**Alternativa E opcional nas questões fechadas**

- No cadastro/edição de questões (admin), múltipla escolha passa a exigir apenas A–D; a E é opcional. Validação em `salvar()` troca o antigo "mínimo 2 alternativas" por "A, B, C, D obrigatórias" (V/F segue com mínimo 2). Alternativa em branco (sem texto nem imagem) continua sendo descartada no save.
- Como as alternativas são linhas da tabela `alternativa` e o `QuestaoCardComponent` itera só as gravadas, uma E vazia nunca é persistida e o aluno vê apenas A–D — sem mudança de schema/RPC. Hint e placeholder do formulário atualizados para sinalizar a E como opcional.

---

## 2026-07-17 | Feature | 1b3f633

**Plano Essencial (tier barato: só treinos nacionais) + pricing 2 tiers com toggle mensal/semestral**

- Novos planos `essencial-mensal` (R$29,90) e `essencial-semestral` (R$119,40 à vista, "R$19,90/mês"); planos atuais renomeados para "Avançado Mensal/Semestral". Coluna `plano.tier` + funções `assinatura_tier()`/`tem_acesso_avancado()` (cortesia/admin contam como avançado). Migrations `20260717140000/141000/142000` + reparo `20260717125900` (`notificar_nova_assinatura` só existia em prod).
- Gates server-side: RLS de flashcards/materiais (e storage) exige tier avançado; RPCs de simulado personalizado/impressão bloqueiam essencial (`tier_upgrade_required`, P0015); `iniciar_tentativa` bloqueia provas não nacionais. Edge functions/Mercado Pago sem mudanças (preço lido do banco).
- Página `/planos` e landing redesenhadas: 2 cards (Essencial | Avançado "Recomendado") × toggle mensal/semestral (semestral default, novo `UiSegmentedToggleComponent` com story), JSON-LD e FAQ atualizados.
- Testes: 680 unit verdes, e2e `tier-essencial.spec.ts` (+ fixtures de plano com tier), 160 testes deno inalterados. Review aplicada (fix do cache de tier pós-checkout).

Detalhes da integração frontend↔backend:

- `Plano`/`AssinaturaPlano` ganham `tier` (`'essencial' | 'avancado'`); `PlanosComponent` passa a carregar os 4 planos reais via `listarPlanos()` (mock local removido).
- `SubscriptionService.tierAtivoServidor()`: RPC `assinatura_tier()` com o mesmo cache/dedup/TTL (5 min) de `temAssinaturaAtivaServidor()`, invalidado nos mesmos pontos (`invalidarAcesso()`); computed `tier` (uso de UI, ex. sidebar) deriva da assinatura já carregada — decisões de acesso continuam sempre no servidor.
- Novo guard `tierAvancadoGuard` (+ `lazyTierAvancadoGuard`): bloqueia Materiais, Flashcards, "Montar simulado" e a impressão do simulado montado para tier essencial, redirecionando a `/planos`. A impressão de prova por id fica fora do guard estático (nacional é liberada ao essencial) — a checagem condicional acontece na RPC (`get_simulado_impressao`, P0015).
- Sidebar (`DashboardComponent`) esconde Materiais/Flashcards para essencial (tier buscado sob demanda no init do dashboard, sem round-trip serial no boot); enquanto desconhecido, mostra o menu completo. Card "Montar simulado" na home de provas ganha variante bloqueada (esmaecida, cadeado, CTA "Fazer upgrade") em vez de sumir.
- P0015 (`tier_upgrade_required`) tratado nos pontos que podem recebê-lo — `iniciar_tentativa`, `gerar_simulado_personalizado`, `gerar_simulado_impressao`, `get_simulado_impressao` — com toast/upsell + redirect a `/planos` (novo util `tier-error.util.ts`).
- `MinhaAssinaturaComponent`: texto fixo "mensal libera 1 mês / semestral 6 meses" generalizado para o período real do plano contratado (`periodoAcessoTexto()`).

---

## 2026-07-12 | Fix | sem commit

**Flashcards: correções de segurança e UX da revisão de código**

- Migration `20260712150000_flashcards_fixes_revisao.sql`:
  - `flashcards_toggle_like` agora exige usuário não banido e assinatura ativa (P0009/P0011) — antes furava ban e paywall via chamada direta ao RPC.
  - URLs de imagem de card validadas server-side (novo helper `flashcards_imagem_url_valida`, erro P0014): host Supabase + pasta própria (`user/{uid}/`) para usuários — bloqueia imagem externa (tracking pixel/conteúdo sem moderação).
  - Decks oficiais ganham estado de rascunho: policy de SELECT passa a exigir `publico=true` também para oficiais; admin publica via checkbox "Publicado" no editor (coluna na tabela). Seed atualizado (`publico=true` nos oficiais).
  - Novo RPC atômico `flashcards_admin_salvar_deck_oficial` (create/update numa transação) substitui o fluxo update+delete+insert do frontend que podia deixar o deck oficial vazio em falha parcial.
- Editor de deck (aluno): card com imagem mas sem frente/verso preenchidos não é mais descartado em silêncio — o save bloqueia apontando o card incompleto.
- Execução: a sessão só finaliza quando TODOS os cards foram respondidos (pular com "Próximo" não encerra mais com resumo parcial; ao responder, avança para o próximo card sem resposta); tela de erro não fica mais "presa" ao navegar para outro deck após uma falha de carregamento.
- Feed: falha ao trocar a ordenação não deixa mais o signal `feedOrdenacao` inconsistente com a lista carregada (rollback); removido signal morto `_feedOffset`.
- Limpeza de imagens órfãs no storage: ao salvar/excluir deck (aluno e admin), os services comparam as URLs de imagem antes/depois e removem do bucket as que deixaram de ser referenciadas (Storage API, best-effort — novo util `storage-imagens.util.ts`, também reutilizado pelo `image-upload`). Trigger SQL foi descartado: o Supabase bloqueia DELETE direto em `storage.objects` (deixaria o blob órfão no S3).

---

## 2026-07-10 | Tweak | sem commit

**Flashcards: deck-cards com altura padronizada**

- Os cards de deck (sugestões, abas Oficiais/Meus/Comunidade) agora têm a mesma altura independentemente do conteúdo: título em 1 linha e descrição em até 2 linhas, truncados com reticências; espaço da descrição/autor sempre reservado; rodapé alinhado à base. Decks oficiais mostram "deck oficial · há X" quando o autor é exibido.

---

## 2026-07-10 | Tweak | 6a3ab68

**Flashcards: conclusão com sugestões, like no próprio deck e fixes**

- Tela de conclusão: emoji substituído por ícone da biblioteca (PartyPopper/lucide) em círculo com gradiente da marca; nova seção "Continue estudando" sugere até 3 outros decks (oficiais + comunidade, excluindo o atual) com navegação direta — a rota de estudo agora observa o `paramMap` e reinicia a sessão ao trocar de deck.
- Curtir o próprio deck: migration `20260712100000_flashcards_curtir_proprio_deck.sql` recria `flashcards_toggle_like` sem o bloqueio de dono (antigo P0013); botão de curtir também na aba "Meus decks" (decks públicos) ao lado de "ver curtidas"; `listarMeusDecks` resolve `curtido_por_mim` via embed de `flashcard_deck_likes`; smoke test atualizado.
- Fix: no carrossel do editor, a imagem enviada num card "vazava" para o card recém-criado — o `app-image-upload` agora descarta o estado local quando o pai troca a `currentUrl` (componente reutilizado entre cards), com spec de regressão.

---

## 2026-07-10 | Tweak | sem commit

**Flashcards: refinos de UX na execução e no editor + fix do modal de curtidas**

- Execução: botão "Voltar", contadores ao vivo de acertos × erros (com animação de pop, sem persistência), barra de progresso, card muito maior centralizado no espaço disponível e visual lúdico — frente com gradiente da marca (azul→roxo), verso em teal→azul, selos "Pergunta"/"Resposta", texto escala conforme o tamanho do conteúdo, animações de entrada/flip.
- Editor: cards em carrossel (um por vez, com navegação e contador "Card X de Y"), checkbox "Tornar este deck público" com o texto na mesma linha, ações por ícone com tooltip (trocar posição, remover), botão de adicionar vira ícone "+" à esquerda e Salvar/Cancelar alinhados à direita.
- Fix: modal "Quem curtiu" ficava preso em "Carregando…" — a carga inicial lia o input `deckId` no construtor, antes de ele estar disponível (NG0950); movida para `ngOnInit`, com spec de regressão.

---

## 2026-07-10 | Feature | 767238c

**Módulo de Flashcards**

- Novo módulo em `/dashboard/flashcards`: decks oficiais (admin), decks da comunidade (públicos, com likes e feed ordenável por recentes/mais curtidos) e decks próprios do aluno (editor com cards frente/verso e imagens opcionais).
- Execução do deck com flip de card, marcação de acerto/erro e percentual final.
- Backend: migration `20260711120000_flashcards.sql` — tabelas `flashcard_decks`, `flashcard_cards`, `flashcard_deck_likes`; escrita de usuário só via RPCs `SECURITY DEFINER` (`flashcards_criar_deck/atualizar_deck/excluir_deck/toggle_like`, `flashcards_feed`, `flashcards_listar_likes_deck`, `admin_get_flashcards_stats`); limites (200 cards/deck, 50 decks/usuário) e filtro de linguagem; bucket `flashcard-imagens` (2 MB).
- Admin: `/admin/flashcards` com stats e CRUD de decks oficiais.
- Testes: smoke test SQL (`supabase/tests/flashcards_smoke_test.sql`), specs unitários dos componentes/serviço e E2E Playwright (`flashcards.spec.ts`).

---

## 2026-07-09 | Fix | sem commit

**Criação atômica de provas no admin**

- A nova prova, as questões importadas e os vínculos com questões existentes permanecem em rascunho até a confirmação final em `Salvar prova`.
- Nova RPC `admin_criar_prova_com_questoes` persiste toda a criação em uma única transação; uma falha não deixa provas, questões, alternativas, temas ou vínculos parciais no banco.
- O fluxo agora mostra uma etapa de revisão antes da gravação definitiva.

---

## 2026-07-09 | Feature | d0a112b

**Checkout embutido (Mercado Pago Payment Brick + Checkout API) — go-live F7**

- O pagamento agora acontece dentro da plataforma (`/checkout/:plano` e `/checkout/status/:intencaoId`), substituindo o redirect ao Mercado Pago para compras novas: cartão em até 6x (semestral), assinatura mensal via preapproval com card token, Pix (QR + copia-e-cola, 30min) e boleto, com 3DS embutido e mensagens específicas por recusa.
- Backend: migration aditiva `pagamento_intencao` + colunas em `pagamento` (aplicada no prod como `20260710000113`); edges novas `mp-processar-pagamento`, `mp-processar-assinatura`, `mp-consultar-pagamento`; `mp-webhook` e `mp-gerenciar-assinatura` atualizados (F6/F6-b: acesso provisório do mensal, regras de `paused`, "uma assinatura viva só" — cancela preapproval órfão ao conceder acesso único, ação `trocar_cartao`).
- Fluxo legado (redirect) permanece deployado durante a janela de observação; rollback = reverter só o frontend. Detalhes e ADR-030 em `docs/architecture.md`; histórico completo em `docs/HANDOFF-CHECKOUT-EMBUTIDO.md`.

---

## 2026-07-09 | Fix | sem commit

**Impersonação: voltar para a conta de admin sem deslogar**

- Fix: ao entrar como um usuário pela tela de admin e clicar em "voltar" no banner de impersonação, o admin era completamente deslogado do app (a sessão só era encerrada e caía no login), porque nenhum token do admin era guardado. Agora os tokens da sessão do admin são mantidos **apenas em memória** durante a impersonação (nunca em storage, que é exfiltrável por XSS) e `voltarParaAdmin` restaura essa sessão via `setSession`, retornando direto para `/admin/usuarios`.
- Se os tokens não estiverem em memória (ex.: reload da página durante a impersonação) ou a sessão do admin tiver expirado, mantém-se o comportamento seguro anterior: encerra a sessão e envia para o login.

---

## 2026-07-08 | Feature | 9609153

**Admin: métricas individuais por usuário**

- Nova tela `/admin/usuarios/:id/metricas` (também acessível por `/admin/usuarios/metricas` e pelo botão "Ver métricas" na listagem de usuários): busca de usuário por nome/e-mail e visão completa das métricas dele com filtro de período (7/30/90 dias ou intervalo personalizado).
- Métricas exibidas: tentativas (total, finalizadas, em andamento, acertos, nota média, tempo de estudo, distribuição por modo e formato de prova), gamificação (XP no período, XP total, nível, streak atual/recorde, freezes), atividade diária (gráficos de tentativas/dia e XP/dia) e último login.
- Assinatura em detalhe: status, plano e periodicidade (mensal/anual), valor, próxima cobrança/acesso até quando, cortesia e flag "renovação cancelada" (cancelou mas segue na carência), além do histórico completo de assinaturas e dos pagamentos do período.
- Backend: RPC única `admin_get_metricas_usuario(p_user_id, p_desde, p_ate)` `SECURITY DEFINER` com checagem `is_admin()` e `REVOKE` de `PUBLIC`/`anon` — nenhuma policy nova foi aberta nas tabelas sensíveis; período das séries limitado a 366 dias; novo índice `tentativa (user_id, iniciada_em)`. Migration em `supabase/migrations/20260708120000_admin_metricas_usuario.sql`.
- Novos componentes shared (com Storybook e specs): `AdminUserSearchComponent` (autocomplete de usuário, extraído de admin-notificações, que passou a reutilizá-lo), `PeriodoFilterComponent` e `SerieDiariaChartComponent`.

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 7) — transversais: XP, desafio diário, impressão e docs**

- Migration `20260707160000_abertas_transversais.sql`:
  - `conceder_xp_tentativa`: XP base migra de acertos×10 para pontos/10 via coalesce canônico (tentativas antigas idênticas; verificado 83 XP = 18 base + 50 nota + 15 tempo em tentativa mista).
  - `get_desafio_diario`: discursivas excluídas do sorteio (D14 — fluxo síncrono não combina com latência/custo de IA).
  - `get_simulado_impressao`: emite `resposta_modelo`/`pontos_chave` apenas quando o gabarito está liberado; `gerar_simulado_impressao` (montado, sem gabarito) emite sempre NULL.
- Frontend:
  - XP só é concedido após a nota consolidar: `finalizar()` pula o XP quando há `correcoes_pendentes` e a tela de resultado concede após `consolidarCorrecoes` (RPC idempotente).
  - Impressão: discursivas ganham linhas para resposta manuscrita; com gabarito, imprime a resposta padrão (inline e na seção Gabarito, no lugar da letra); alternativas preservadas de conversões não são impressas.
  - `database.types.ts` regenerado do schema local (novas colunas, tabela `resposta_correcao` e RPCs).
- Docs: seção "Questões Abertas (Discursivas) com Correção por IA" em `business-rules.md`, ADR-029 em `architecture.md` (correção plugável + nota por pontos sem backfill) e adendo no `security-audit-2026-06-24.md` (novas colunas secretas + aviso de regressão de grants).
- Anotações, comentários e favoritos: agnósticos de formato — sem mudança (confirmado).
- Verificação final: `db reset` completo aplica todas as migrations; 58 testes Deno e 501 specs frontend passando.

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 6) — import markdown/IA e conversão fechada→aberta**

- Import de questões (mesma sessão/fluxo, lotes mistos): parser aceita por bloco `FORMATO: aberta`, `RESPOSTA_MODELO` (seção multilinha), `PONTOS_CHAVE` (lista `- item`) e `CRITERIOS:`. Matriz de validação: aberta ⇒ RESPOSTA_MODELO obrigatória e ALTERNATIVAS/GABARITO proibidos; fechada ⇒ vice-versa; `FORMATO` desconhecido é erro.
- `montarPromptQuestoes()` ensina a IA externa os dois formatos (fechada e aberta) e quando usar cada um.
- Preview de import renderiza discursivas (badge "Discursiva", resposta modelo, pontos-chave, critérios); importação grava os campos abertos com `origem_geracao: ia_assistida`.
- Admin > Questões (edição): botão "Converter para discursiva" — muda o formato, pré-preenche a resposta modelo com a alternativa correta + explicação e sugere stub de pontos-chave; as alternativas são mantidas no banco (conversão reversível — D12).
- 7 novos specs do parser (501 no total passando): aberta completa, fechada intacta, lote misto e a matriz de validação.

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 5) — revisão, histórico e métricas por pontos**

- Migration `20260707150000_abertas_revisao_e_metricas.sql`:
  - `get_revisao_tentativa` passa a delegar ao helper `montar_resultado_tentativa` (Fase 3): a revisão devolve também as `respostas` com a correção da IA embutida e as questões incluem `resposta_modelo`/`pontos_chave` — mesma classe de exposição pós-finalização de `explicacao`.
  - `get_revisao_prova` inclui o gabarito aberto nas questões (ambos os ramos: aluno com tentativa e admin).
  - `get_historico_kpis` e `get_desempenho_por_tema` migram das somas binárias para a expressão canônica `coalesce(tr.pontos, correta::int*100)`: aproveitamento geral pondera pontos/`total_pontuaveis` (tentativas antigas seguem por acertos, sem backfill); tema mais fraco/desempenho por tema usam média de pontos, incluem abertas corrigidas e excluem `sem_ia` naturalmente (o filtro `alternativa_id IS NOT NULL` foi substituído); "acertos" por tema = respostas com ≥ 70.
  - Smoke test local: revisão com correção embutida, KPI misto (100+40)/2 = 70.
- Frontend:
  - `ProvaService.getQuestoesRevisao` devolve `{ questoes, respostas }`; `prova-visualizar` hidrata as respostas direto da RPC (funciona por URL direta, não só vindo do resultado) e renderiza discursivas: resposta do aluno (somente leitura), feedback da correção, resposta padrão e anotações; filtro de erros inclui abertas com pontos < 70.
  - `questao-card` em modo revisão/gabarito mostra a resposta discursiva como cartão somente leitura (sem textarea editável).
  - Histórico/labels: já usavam "aproveitamento" — sem mudança.

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 4) — simulado com discursivas e resultado bloqueante**

- Migration `20260707140000_abertas_simulado_personalizado.sql`: `gerar_simulado_personalizado` ganha `p_formato_questao` (`fechadas` default | `discursivas` | `misto`). O default `fechadas` blinda simulados existentes de sortearem discursivas recém-cadastradas; o payload agora emite o gabarito aberto mascarado em modo simulado (mesmo padrão de `iniciar_tentativa`). Assinatura antiga removida (evita overload ambíguo no PostgREST). Smoke test no stack local: filtro por formato, default e mascaramento simulado/estudo.
- Montar simulado: nova seção "Formato das questões" (Objetivas / Discursivas / Misto).
- Execução (simulado): confirmação de finalização alerta discursivas escritas mas não enviadas (não serão corrigidas).
- Tela de resultado bloqueante: com correções de IA pendentes, mostra progresso ("Corrigindo suas respostas discursivas… 2/3"), re-dispara a edge function para correções paradas (pendente/erro), faz poll de `get_status_correcoes` a cada 3s e consolida a nota ao terminar; timeout de 90s força `sem_ia` com banner explicando a exclusão da nota.
- `resultado-summary` por pontos: card de acertos vira "Aproveitamento (≥70)" quando há discursivas (inclui abertas com pontos ≥ 70 e denominador `total_pontuaveis`); contagem de erradas inclui discursivas com pontos < 70.

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 3) — RPCs core + modo estudo de ponta a ponta**

- Migration `20260707130000_abertas_rpcs_resposta_e_nota_pontos.sql`:
  - `tentativa` ganha `pontos` e `total_pontuaveis` (NULL em dados antigos — leituras usam coalesce, sem backfill).
  - Novas RPCs: `salvar_resposta_texto` (rascunho, sobrevive a F5), `enviar_resposta_aberta` (trava a edição + cria `resposta_correcao` pendente), `consolidar_correcoes_tentativa` (fecha a nota quando as correções resolvem; `p_forcar_sem_ia` para o timeout da UI) e `get_status_correcoes` (polling).
  - `finalizar_tentativa` v2: corrige só as objetivas, deixa `nota` NULL enquanto houver correção de IA pendente e retorna `correcoes_pendentes`; tentativa só-MC consolida inline (comportamento idêntico ao anterior). Nota = soma de pontos / `total_pontuaveis` (questões `sem_ia` saem do denominador).
  - `iniciar_tentativa`/`retomar_tentativa` emitem o gabarito aberto (`resposta_modelo`/`pontos_chave`/`criterios_correcao`) mascarado em `modo='simulado'` — mesmo mecanismo do `alternativa.correta`.
  - Helpers internos sem EXECUTE para clientes: `consolidar_pontos_tentativa` (idempotente; stats de abertas com threshold 70) e `montar_resultado_tentativa` (respostas incluem a `correcao`).
  - Smoke test completo no stack local: mascaramento, rascunho, envio, re-envio rejeitado, nota mista (100+80)/2=90, `sem_ia` reduz denominador, só-MC inline.
- Frontend:
  - Novos models (`correcao.ts`) e campos em `Tentativa`/`TentativaResposta`/`ResultadoTentativa`; novos métodos no `TentativaService` (`salvarRespostaTexto`, `enviarRespostaAberta`, `getStatusCorrecoes`, `consolidarCorrecoes`, `listarCorrecoes`) e novo `CorrecaoIaService` (invoke da edge function).
  - Novos shared components com stories: `resposta-aberta-input` (textarea com contador 3000, autosave com debounce, envio com confirmação, estados rascunho/enviando/enviada), `correcao-feedback` (nota 0–100 com thresholds 70/50, checklist atendidos/faltantes, erros, estados corrigindo/erro/sem_ia) e `resposta-padrao` (card da resposta modelo + pontos-chave).
  - `questao-card` ramifica por `questao.formato`: bloco discursivo no lugar das alternativas.
  - `tentativa-exec`: rascunho com autosave, envio definitivo, correção aguardada inline no estudo (feedback + resposta padrão) e fire-and-forget no simulado; contagem de respondidas e grade incluem abertas enviadas; estado restaurado após F5 (rascunho, envio e correções).
- Testes: 24 novos specs (494 no total passando) — métodos do service e os dois componentes interativos.

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 2) — edge function de correção por IA**

- Nova edge function `corrigir-resposta-aberta` (padrão `index.ts` fino + `handler.ts` com DI): corrige UMA resposta aberta por chamada (fan-out no cliente). Valida JWT/ownership, exige resposta enviada (`enviada_em`), faz claim idempotente em `resposta_correcao` (`pendente`/`erro` → `corrigindo`), 2 retries com backoff para 429/5xx/JSON inválido, persiste resultado (`corrigida` + `tentativa_resposta.pontos`) ou `erro`; sem env de IA → `sem_ia` (app segue funcionando sem IA).
- Novos módulos compartilhados: `grading-provider.ts` (interface `GradingProvider` + tipos + clamp 0–100), `grading-openai-compat.ts` (chat completions JSON — OpenRouter/OpenAI/Gemini por config, temperature 0, timeout 60s, prompt PT com delimitação anti-injection da resposta do aluno) e `grading-fake.ts` (determinístico por cobertura de pontos-chave, para dev/e2e).
- `Deps` ganha `gradingProvider()` (seleção por env `AI_GRADING_PROVIDER`/`_BASE_URL`/`_MODEL`/`_API_KEY`) e `sleep()`; cap diário por usuário via `AI_GRADING_DAILY_LIMIT` (default 200) contado em `resposta_correcao` do dia.
- 15 novos testes Deno (58 no total passando): sucesso, retry de JSON inválido, 5xx esgota retries → `erro`, 4xx sem retry, claim duplo → 202, re-claim de `erro`, idempotência de `corrigida`, ownership → 404, rascunho → 409, cap diário → 429, `sem_ia`, provider fake.
- Env vars documentadas em `supabase/functions/.env.local.example`; execução apenas local via `functions serve` (sem deploy/secrets remotos nesta fase).

---

## 2026-07-07 | Feature | sem commit

**Questões abertas (Fase 1) — schema de correção por IA + cadastro de discursivas no admin**

Primeira fase do plano `docs/plano-questoes-abertas-ia.md` (questões discursivas com correção por IA).

- Migration `20260707120000_abertas_schema_correcao_e_grants.sql`:
  - `questao` ganha `resposta_modelo`, `pontos_chave` (jsonb array) e `criterios_correcao` — colunas de gabarito aberto, SECRETAS (sem SELECT grant para `authenticated`; nascem ocultas pelo modelo de grants por coluna da `20260624125610`; escrita admin segue pelo grant de tabela).
  - `tentativa_resposta` ganha `enviada_em` (lock de envio definitivo, NULL = rascunho) e `pontos` (0–100, NULL = não pontuável).
  - Nova tabela `resposta_correcao` (1:1 com `tentativa_resposta`): estado/resultado/auditoria da correção por IA (status, pontos, feedback, pontos atendidos/faltantes, provider, tokens, retries). RLS de SELECT para o dono da tentativa; escrita exclusiva de service-role/SECURITY DEFINER; índice parcial para pendências.
  - `admin_get_questao` não precisou mudar (usa `to_jsonb`, já devolve os campos novos ao admin).
- Admin > Questões: novo formato **Discursiva** no formulário — textarea de resposta modelo (obrigatória), editor de lista de pontos-chave e critérios de correção; seção de alternativas oculta para discursivas. Ao editar uma discursiva as alternativas existentes são preservadas no banco (conversão fechada→aberta reversível — D12 do plano).
- Verificado no banco local: `authenticated` recebe `permission denied` ao ler `resposta_modelo` e continua lendo colunas públicas; INSERT/UPDATE das colunas novas funcionam.

---

## 2026-06-29 | Fix + Feature | sem commit

**Métricas financeiras: receita completa e acesso de cortesia**

- Fix (líquido das mensais): o endpoint `authorized_payment` do Mercado Pago não retorna o valor líquido, então as cobranças recorrentes ficavam com `liquido_centavos` nulo e sumiam de todas as métricas de "Líquido" (só o semestral aparecia). O `mp-webhook` passa a buscar o líquido e o método no pagamento real subjacente (`ap.payment.id`); a RPC `admin_get_financeiro` usa o bruto como fallback quando o líquido é desconhecido.
- Fix (pagamentos por fora): assinaturas pagas fora do MP e ativadas manualmente não geravam registro em `pagamento`, ficando fora da receita. Nova RPC `admin_ativar_assinatura_manual` (registra assinatura + pagamento `manual`) e backfill das assinaturas pagas por fora.
- Feature (acesso de cortesia): coluna `assinatura.cortesia` marca acessos liberados de graça. Cortesias concedem acesso normalmente, mas ficam fora de receita, MRR, previsão e "assinaturas ativas (pagantes)", aparecendo num indicador próprio ("Acessos cortesia"). RPCs `admin_liberar_acesso_gratuito` e `admin_revogar_acesso_gratuito`.
- Admin de usuários: botão "Liberar acesso gratuito" (com duração em meses) e "Revogar cortesia" por usuário; o chip de assinatura distingue "Cortesia". Migration em `supabase/migrations/20260629120000_financeiro_liquido_e_pagamento_manual.sql`.

---

## 2026-06-27 | Melhoria | sem commit

**Viewer de PDF: tela cheia, zoom e correção de upload**

- Viewer de PDF agora tem barra de controles com zoom (−/%/+, 50%–300%) e botão de tela cheia. O zoom varia a largura do iframe (visualizador nativo reflui a página nítida), sem recarregar o arquivo; reseta para 100% ao trocar de PDF.
- Tela cheia via Fullscreen API, com saída por `Esc` e sincronização do estado/ícone.
- Fix: `PdfUploadComponent` descartava o caminho de sessão apenas no reset visual, mas mantinha a referência interna — o upload seguinte apagava do storage o arquivo recém-salvo. Corrigido para limpar a referência quando o `currentPath` é zerado.

---

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
