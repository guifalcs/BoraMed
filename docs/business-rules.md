
# Regras de Negócio — BoraMed

## Materiais de Estudo

### Entidades

* **MaterialCategoria** — card do mural. Identificada por `slug` único. Contém título, descrição, ícone (nome Lucide), gradiente CSS e ordem de exibição.
* **MaterialTopico** — agrupamento opcional dentro de uma categoria (criado no schema, UI futura). FK nullable em `material_arquivo`.
* **MaterialArquivo** — um PDF armazenado no bucket privado `materiais`. Vinculado obrigatoriamente a uma categoria, opcionalmente a um tópico.

### Acesso e autenticação

* Categorias, tópicos e arquivos só são visíveis para **assinantes ativos** (`tem_assinatura_ativa() = true`). Admins têm acesso irrestrito (incluindo registros `ativo = false`).
* Alunos sem assinatura ativa são barrados pelo `lazySubscriptionGuard` antes de chegar à rota `/dashboard/materiais`.
* A visualização de PDF é feita via **signed URL temporária** (TTL 3600s), gerada on-demand ao clicar no arquivo. A URL expira; não há link permanente.

### Conteúdo

* Todos os materiais são **100% autorais**, produzidos pelo time do BoraMed. Nenhum material reproduz, transcreve ou adapta conteúdo oficial de instituições (Afya ou outras).
* Materiais no formato APG (Aprendizagem em Pequenos Grupos) seguem a lógica pedagógica do método, mas são independentes e não pertencem à Afya. Qualquer referência ao formato APG deve ser acompanhada de disclaimer de independência ("plataforma independente, sem vínculo com a Afya").
* Administradores fazem upload via painel `/admin/materiais`. O arquivo é armazenado no path `{slug-da-categoria}/{uuid}.pdf` dentro do bucket `materiais`.

### Regras de integridade

* `storage_path` é único por arquivo — não pode haver dois registros apontando para o mesmo caminho.
* Ao deletar um `material_arquivo`, o arquivo correspondente deve ser removido do bucket storage junto com o registro.
* Ao deletar uma `material_categoria`, todos os `material_arquivo` vinculados são removidos em cascata (ON DELETE CASCADE). O admin deve ser alertado antes de confirmar.
* `mime_type` de `material_arquivo` deve ser sempre `application/pdf` (enforced por CHECK constraint).

## Entidades Principais

### Questão

* Tipos: `nacional` | `processual` | `laboratorio`
* Período: 1 a 12 (semestres do curso médico; foco inicial em alunos da rede Afya)
* Questões de laboratório SEMPRE têm `imagem_url`
* Questões fechadas de múltipla escolha têm as alternativas A a D obrigatórias e a E opcional (1 correta). A alternativa E só é gravada e exibida ao aluno quando tem texto ou imagem — em branco, ela não entra na questão e o aluno vê apenas A a D. Verdadeiro/falso usa V e F.
* Questões são autorais, criadas pelo time a partir dos temas, objetivos pedagógicos e formato das avaliações observadas. Não copiar enunciados, alternativas, imagens, gabaritos ou materiais oficiais de instituições.
* Na importação administrativa por IA, `DISCIPLINA` e `TEMA` são opcionais, mas quando informados devem corresponder exatamente a registros cadastrados. O prompt deve incluir as disciplinas e temas existentes para evitar classificação inventada pela IA.
* Questões importadas com `TEMA` válido devem ser vinculadas em `questao_tema`; sem tema, continuam válidas para provas, mas não entram em filtros de simulado por tema.
* Questões vinculadas a tentativas, desafios diários ou provas não devem ser deletadas diretamente; usar arquivamento/status quando for preciso remover da experiência do aluno.
* A visualização administrativa de questão deve reutilizar a mesma renderização do aluno e exibir abaixo um panorama com status, classificação, vínculos, gabarito, revisão e métricas.

#### Formatação do texto (enunciado, apoio e explicação)

`enunciado`, `enunciado_apoio` e `explicacao` são renderizados como **Markdown**. O acervo segue um padrão único de formatação, aplicado em massa pela migration `20260818120000_normalizar_formatacao_questoes` e obrigatório para todo conteúdo novo:

* **Parágrafo separado por linha em branco.** Quebra de linha simples é ignorada pelo Markdown e cola os blocos; sempre `\n\n`.
* **Máximo de ~4–5 linhas por parágrafo** (~420 caracteres). Textos maiores são cortados em fim de frase, nunca no meio.
* **Tópico é lista Markdown de verdade** (`- item`), com linha em branco antes do primeiro e depois do último item. Marcador `•`, travessão ou hífen no meio da frase não vira tópico na tela — vira texto corrido.
* **Enumerações separadas por ponto-e-vírgula** e blocos de dados de exame (`Rótulo: valor. Rótulo: valor.`) viram lista.
* **Rótulos de seção** (`Mecanismo cobrado:`, `Exame físico:`, `Exames laboratoriais:`, `Justificativa:`, `Distratores:`, `Referências bibliográficas:`) abrem parágrafo próprio.
* **A imagem é renderizada ANTES do enunciado.** O texto nunca deve dizer que a imagem está "abaixo" ou "a seguir" — sempre "acima". Enunciados vindos de PDF costumam trazer o sentido invertido.
* Itens em numeral romano (`I.`, `II.`, …) e assertivas ficam cada um em seu parágrafo; a normalização em tempo de exibição continua em `formatarEnunciado` (`shared/utils/`), que é complementar e idempotente.

### Recurso e Anulação de Questões

Três conceitos independentes, todos configurados no admin no criar/editar questão:

* **Recurso (`questao.recurso_texto`):** texto livre com o recurso da faculdade (anulação/modificação da questão). É apenas informativo: sempre que a questão aparece (execução, revisão, admin), o aluno vê um botão para ler o texto. Cadastrar recurso **não** anula a questão por si só.
* **Anulação global (`questao.anulada`):** marcação do admin. A questão continua **visível e respondível** (o aluno pode responder e ver o gabarito para estudar), mas **não conta em nenhuma métrica** daqui pra frente — nota, acertos, `taxa_acerto`/`vezes_respondida` da questão e distribuição por tema. Notas de tentativas já finalizadas e consolidadas **não** são recalculadas retroativamente; a exclusão vale para novas consolidações e para as agregações por tema/histórico (que leem o estado atual da questão).
* **Anulação pelo aluno (`tentativa_resposta.anulada_usuario`):** durante uma tentativa ativa (simulado ou estudo), o aluno pode anular uma questão por conta própria num botão discreto e bem indicativo, para que ela **não conte nas métricas daquela tentativa**. Reversível até a finalização.

Regras de combinação:

* **Só questões sem recurso cadastrado e não anuladas pelo admin podem ser anuladas pelo aluno.** Havendo recurso, o botão de anular não aparece — o aluno apenas visualiza o texto.
* Quando a questão está anulada pelo admin **e** tem recurso, a faixa exibida indica a anulação e permite ler o recurso (o "porquê").
* A validação de quem pode anular é server-side na RPC `anular_questao_usuario` (bloqueia questões com recurso ou já anuladas pelo admin).
* Exclusão das métricas segue o predicado canônico `(questao.anulada OR tentativa_resposta.anulada_usuario)`, aplicado em `finalizar_tentativa`, `consolidar_pontos_tentativa`, `montar_resultado_tentativa` (distribuição por tema), `get_historico_kpis` e `get_desempenho_por_tema`.
* A tela de resultado sinaliza quantas questões foram anuladas e ficaram fora da nota.

### Simulado

* Gerado sob demanda pelo aluno
* Configuração: tipo de prova opcional + tema(s) + quantidade
* Quantidades disponíveis: 5, 10, 15, 20, 30
* Ordem das questões: sempre aleatória
* Provas regulares usam `prova_questao` como fonte canônica de vínculo e ordem das questões.
* A ordem sorteada deve ser persistida em `tentativa_resposta.ordem_na_tentativa` para que a revisão mantenha a mesma sequência da tentativa
* A retomada de qualquer tentativa deve remontar as questões a partir de `tentativa_resposta`, pois simulados personalizados não têm questões vinculadas diretamente à prova sintética
* Se existir tentativa com status `em_andamento` ou `pausada`, a home e a área de simulados devem priorizar um CTA de continuidade para levar o aluno direto de volta à execução
* Ao trocar o formato na montagem de simulado, a lista de temas deve entrar em estado de carregamento e bloquear ações sobre temas até a nova contagem ser retornada
* A montagem de simulado deve permitir a opção sem tipo de prova, sorteando questões ativas dos formatos disponíveis para montagem: processual e laboratório
* Provas prontas exibidas ao aluno devem listar apenas treinos nacionais; processuais e laboratório ficam restritos ao fluxo de montagem personalizada.
* Ao montar simulado, o sorteio deve priorizar questões ainda não entregues ao usuário dentro dos filtros escolhidos; questões já vistas só entram aleatoriamente quando as inéditas acabam.
* O histórico de questões já entregues ao usuário é derivado de `tentativa_resposta` vinculada às tentativas do próprio usuário, excluindo modo `visualizar`.
* **Questões equivalentes (aberta × fechada):** questões gêmeas — mesma questão em formatos diferentes (fechada convertida em discursiva) — compartilham `questao.grupo_equivalencia_id`. O aluno **nunca** recebe as duas variantes no mesmo simulado (dedup: uma por grupo). O rodízio/priorização de inéditas trata o grupo como **uma única questão lógica** (`coalesce(grupo_equivalencia_id, id)`): fez a fechada ⇒ a discursiva gêmea também conta como "já vista", e vice-versa. A priorização segue soft (o pool nunca seca).
* **Revisão de conversão (admin):** questões convertidas em massa carregam `questao.revisao_conversao='pendente'` — flag discreta, invisível ao aluno e sem efeito no sorteio. Serve só para curadoria: a aba de questões do admin mostra contador/quick-filter "a revisar" e badge por linha; o sócio confere e marca como `'revisada'`.
* Uma vez iniciado, o tempo corre
* Pode ser pausado e retomado (estado salvo no banco)
* Não pode ser refeito com as mesmas questões na mesma ordem

### Resultado

* Calculado ao finalizar o simulado
* Nota: % de acertos
* Exibe gabarito com alternativa correta destacada
* Histórico visível apenas para o próprio aluno
* Histórico deve deixar explícito quando ainda não há tentativas concluídas, quando filtros zeram os resultados e quando houve falha de carregamento
* Quando houver distribuição por tema, o sistema sugere um próximo treino focado no tema de menor aproveitamento
* Quando múltiplos temas tiverem o mesmo menor aproveitamento, o resultado deve comunicar o conjunto de temas críticos sem eleger arbitrariamente um único pior tema
* Treinos recomendados abrem a montagem de simulado com o tema pré-selecionado e modo estudo quando o objetivo for revisão
* Ao finalizar uma tentativa, a tela de resultado deve oferecer próximos passos objetivos, incluindo a revisão dos erros e o refazer em modo estudo
* Na linha final de ações do resultado, o botão secundário de impressão com gabarito fica à esquerda e o CTA primário `Revisar e anotar` fica à direita
* Anotações de revisão pertencem sempre ao par `tentativa_id + questao_id` do próprio usuário. A mesma questão em outra tentativa não deve exibir nem herdar a anotação anterior.
* Anotações ficam disponíveis apenas na revisão de tentativas finalizadas. A execução cronometrada do simulado não deve exibir editor de anotação para não competir com resposta, timer e navegação.
* Uma anotação só pode ser criada para questão que realmente exista em `tentativa_resposta` daquela tentativa. A validação deve ser server-side e protegida por RLS/RPC.

### Impressão de simulados (levar consigo)

* O aluno pode imprimir / salvar em PDF qualquer simulado — pronto (Afya/autoral) ou montado — por uma tela dedicada (`/imprimir/simulado/:provaId`), fora do layout do dashboard.
* A impressão usa o recurso nativo do navegador (`window.print()` + `@media print`); não há geração de PDF no servidor nem dependência externa.
* **Integridade do gabarito:** o gabarito e as explicações só entram no material impresso quando o aluno **já finalizou** aquela prova (ou é admin). Antes disso, imprime-se apenas o enunciado e as alternativas — preserva a mesma regra de segurança da revisão (`get_revisao_prova`) e protege ranking/gamificação. A RPC `get_simulado_impressao` aplica essa decisão server-side (`correta`/`explicacao` retornam nulos quando não liberado).
* **Montado para impressão:** ao escolher "Apenas imprimir" na montagem, o sistema sorteia as questões via `gerar_simulado_impressao` **sem criar prova nem tentativa** (histórico permanece limpo). O conjunto não é resolvível no app nem persiste além da sessão do navegador.
* O sorteio do montado para impressão segue a mesma priorização de questões inéditas da geração normal.
* Seções opcionais antes de imprimir: espaço de marcação na questão, cartão-resposta (folha de bolhas), gabarito ao final e explicações no gabarito (estas duas só quando o gabarito está liberado), além de mostrar/ocultar imagens e tamanho da fonte.
* Em midia de impressao, controles e sidebar de configuracao nao podem reservar espaco na folha; o conteudo impresso deve zerar offsets responsivos e ocupar toda a area imprimivel tambem em iPad/Safari.

### Gamificação Competitiva

* XP é concedido somente após tentativa finalizada e nunca no modo `visualizar`
* Cada tentativa concede XP uma única vez por chave idempotente `tentativa:{tentativa_id}`
* XP de tentativas tem cap diário de 500 XP por usuário
* Streak v2 considera dias de atividade com tentativa ou desafio diário
* Streak atual permanece válido se o último dia ativo foi hoje ou ontem
* Streak Freeze é consumido automaticamente quando há exatamente 1 dia perdido e o aluno tem protetor disponível
* Um protetor é ganho a cada 7 dias consecutivos completos, com máximo de 2 armazenados
* Conquistas MVP: primeira tentativa, streak 3, streak 7, volume 10 e precisão 70
* Conquistas desbloqueadas são registradas uma única vez por usuário
* Ranking futuro deve medir atividade por XP, nunca percentual de acerto
* Dados competitivos públicos exigem opt-out visível para o aluno em Perfil
* Alunos com opt-out continuam acumulando XP e conquistas, mas devem aparecer como anônimos em rankings
* Ranking competitivo MVP tem recortes Global (`xp_total`) e Semana (`xp_semana_atual`)
* Ranking não expõe e-mail; usa nome completo quando público ou `Anônimo` quando privado
* Desafio diário deve renderizar `imagem_url` e `imagem_legenda` quando a questão possuir imagem, incluindo questões de laboratório.
* Desafio diário deve exibir explicação pedagógica após a resposta quando a questão possuir `explicacao`
* Desafio diário não deve depender de `questao.dificuldade`, pois a classificação de dificuldade foi removida do schema de questões.

### Comentários Públicos por Questão

* Comentários são públicos e atrelados ao `questao_id`, compartilhados entre todos os alunos que viram aquela questão em qualquer tentativa.
* A seção de comentários é exibida como accordion recolhido por padrão. O estado (expandido/colapsado) é persistido em `localStorage` por questão (`bm_coment_exp_<questaoId>`).
* O modo foco durante a execução de simulado oculta a seção de comentários por completo.
* **Identidade do autor:** segue `profiles.competir_publico`. Usuários com opt-out aparecem como "Anônimo" sem avatar e sem `user_id` exposto. O próprio autor sempre vê seus comentários como "is_me", independentemente do opt-out.
* **Replies:** suportado apenas um nível (comentário raiz + respostas diretas). Respostas não podem receber sub-respostas.
* **Votos:** like (1) ou dislike (-1) por usuário. Repetir o mesmo voto remove-o (toggle). O contador é denormalizado em `likes`/`dislikes` e recalculado por trigger.
* **Ordenação:** padrão "Mais relevantes" (`likes - dislikes DESC, criado_em DESC`). Usuário pode trocar para "Mais recentes" ou "Mais antigos".
* **Moderação:** blocklist de termos pt-BR validada server-side no RPC de criação e edição (extensão `unaccent` para normalização). Conteúdo recusado retorna code `P0010`; o frontend exibe mensagem amigável. Além disso, qualquer aluno pode denunciar um comentário; as denúncias ficam na tabela `questao_comentario_denuncia` para revisão administrativa futura.
* **Exclusão:** soft delete (status='removido') quando o comentário tem respostas ativas (preserva a thread); hard delete quando é folha sem respostas.
* **Conteúdo:** texto puro, sem markdown. Exibido com `white-space: pre-wrap`.
* **Comprimento:** mínimo 1, máximo 2000 caracteres.
* Tela de moderação admin para revisar denúncias é um TODO futuro (tabela `questao_comentario_denuncia` já captura os dados).

## Fluxos Principais

### Onboarding de Novos Usuários

* O onboarding aparece apenas para usuários autenticados que ainda não concluíram nem pularam o fluxo ativo.
* O estado é privado por aluno e persistido por `flow_key` + `flow_version`.
* O usuário pode pular o onboarding a qualquer momento.
* Onboarding não concede XP, conquista, streak ou qualquer recompensa competitiva.
* Falha ao carregar ou salvar onboarding não bloqueia o dashboard.
* O CTA final do fluxo inicial direciona o aluno para o inicio do modulo de simulados, onde ele escolhe o tipo de treino.

### Gerar Simulado Processual ou Laboratório

1. Aluno seleciona tipo (processual ou laboratório)
2. Seleciona período
3. Seleciona tema(s)
4. Define quantidade de questões
5. Sistema sorteia questões do banco respeitando filtros
6. Aluno responde na ordem apresentada
7. Ao finalizar: exibe resultado com gabarito

### Treinos Nacionais no Modelo Afya

1. Aluno navega pela lista de simulados autorais disponíveis
2. Filtra por período e ano
3. Abre o simulado e responde
4. Ao finalizar: exibe resultado com gabarito

### Hist?rico e an?lise de desempenho

* O hist?rico do aluno deve permitir recortes por per?odo de tempo e por formato de treino.
* Os formatos filtr?veis no hist?rico acompanham os formatos pedag?gicos ativos: nacional, processual e laborat?rio.
* Simulados personalizados devem continuar aparecendo no hist?rico com o formato da prova gerada, preservando navega??o para resultado e revis?o.

### Suporte

* O aluno pode abrir chamados e acompanhar o hist?rico de mensagens pelo widget de suporte.
* Chamados resolvidos bloqueiam novas respostas at? serem reabertos.
* Chamados resolvidos s? podem ser reabertos por administradores pelo painel do admin; o aluno n?o tem essa op??o (se ainda precisar de ajuda, deve abrir um novo chamado).
* Ao reabrir, o status volta para `aberto` e uma mensagem de auditoria fica registrada no hist?rico do chamado.
* Quando a equipe reabre um chamado, o aluno recebe uma notifica??o informativa.

## Calend?rio de Refer?ncia (Foco Inicial Afya)

Uso interno como refer?ncia de produto. N?o apresentar como calend?rio oficial, parceria ou representa??o da Afya.

* **N1** (processual): semana 4?5 do semestre
* **P1** (laboratório): semana 6
* **N2** (processual): semana 10–11
* **P2** (laboratório): semana 12
* **Prova Nacional** : semana 14–15

## Regras de Acesso

* Plataforma fechada: apenas alunos cadastrados
* Cadastro: manual por ora
* Dados de desempenho: privados por aluno
* Admin: Arthur e Guilherme têm acesso total
* Na criação administrativa de provas, os detalhes, as questões importadas e as questões existentes selecionadas ficam somente no rascunho do navegador até a confirmação final em **Salvar prova**. A gravação é transacional: se qualquer validação ou inserção falhar, nenhuma prova, questão, alternativa, tema ou vínculo é persistido.
* Alterações de papel (`aluno`/`admin`) devem passar pela RPC `alterar_papel_usuario`, nunca por `UPDATE` direto em `profiles` no cliente.
* Apenas administradores podem alterar papéis, e um administrador não pode revogar o próprio acesso.
* Suspensões de usuários devem passar pelas RPCs `admin_banir_usuario` e `admin_desbanir_usuario`, nunca por `UPDATE` direto em `profiles` no cliente.
* Um usuário suspenso permanece autenticado apenas para acessar a página fixa `/conta-suspensa` e o suporte. As demais rotas privadas devem redirecionar para a página de suspensão.
* Tabelas de estudo, gamificação, notificações, avisos e administração devem ter policy restritiva que bloqueia perfis suspensos. Tabelas e RPCs de suporte permanecem acessíveis para abertura e acompanhamento de solicitações.
* Administradores suspensos não contam como `admin` ou `super_admin` em funções de autorização. Nenhum administrador pode suspender a própria conta, e `super_admin` não pode ser suspenso.
* Telas de aluno acessadas por impersonação devem usar o usuário autenticado efetivo como escopo; consultas de histórico/tentativas devem filtrar `user_id` explicitamente e gravações em `tentativa_resposta` devem passar por RPC que valida o dono da tentativa.
* Buckets públicos de imagens podem expor arquivos por URL pública, mas não devem permitir listagem ampla de objetos pelo cliente.
* Métricas individuais de um usuário (tentativas, XP, atividade, assinatura, pagamentos) são visíveis apenas para administradores, exclusivamente via RPC `admin_get_metricas_usuario` (SECURITY DEFINER, exige `is_admin()`); nenhuma policy de SELECT cross-user é aberta nas tabelas `assinatura`, `pagamento` ou `gamificacao_evento` para o cliente.

## Integridade de Dados

* Toda entidade acadêmica (prova, questão, disciplina, tema) pode ser deletada pelo admin; a regra é preservar o histórico do aluno, nunca bloquear a exclusão.
* Deleções administrativas passam pelas RPCs `admin_deletar_prova`, `admin_deletar_questao`, `admin_deletar_disciplina` e `admin_deletar_tema` (SECURITY DEFINER, exigem `is_admin()`), nunca por `DELETE` direto no cliente.
* Prova: delete físico. Antes do delete, um trigger grava `tentativa.prova_snapshot` (nome/tipo/origem/formato) e o FK `tentativa.prova_id` vira `NULL`. O histórico, o resultado e a retomada de tentativas em andamento continuam funcionando; o app exibe o nome do snapshot com selo "prova removida".
* Questão: delete físico quando nunca foi usada por aluno; soft delete (`status='deletada'` + `apto_desafio_diario=false`) quando há respostas de tentativa ou desafio diário — a revisão dos alunos permanece intacta e a questão sai do banco, das provas e dos sorteios.
* Disciplina: delete físico; questões e temas vinculados ficam sem disciplina (`SET NULL`).
* Tema: delete físico; subtemas sobem para o pai do tema removido e as questões apenas perdem a marcação (`questao_tema` em cascade).

## Questões Abertas (Discursivas) com Correção por IA

* `questao.formato = 'resposta_aberta_curta'` identifica discursivas. O gabarito aberto vive em 3 colunas SECRETAS (`resposta_modelo`, `pontos_chave`, `criterios_correcao`) — sem SELECT grant para `authenticated`; leitura só via RPC (mascarado como NULL em `modo='simulado'`, igual a `alternativa.correta`).
* Resposta do aluno: rascunho editável via `salvar_resposta_texto` (sobrevive a F5); envio DEFINITIVO via `enviar_resposta_aberta` (trava a edição, marca `enviada_em` e cria `resposta_correcao` pendente). Limite de 3.000 caracteres.
* Correção por IA: edge function `corrigir-resposta-aberta`, uma resposta por chamada, claim idempotente, 2 retries; provider por env (`AI_GRADING_PROVIDER`: `openai-compat` para OpenRouter/OpenAI/Gemini, ou `fake` determinístico). Cap diário por usuário (`AI_GRADING_DAILY_LIMIT`, default 200).
* **A IA é motor adicional, não dependência**: sem IA configurada/disponível, a correção vira `sem_ia`, a questão sai do denominador da nota e a resposta padrão continua visível ao aluno.
* Nota por pontos: cada questão vale 0–100 (`tentativa_resposta.pontos`; MC = `correta`×100). Expressão canônica das agregações: `coalesce(tr.pontos, (tr.correta)::int*100)`. Nota da tentativa = soma de pontos / `total_pontuaveis` (= total − `sem_ia`). Não respondida = 0 no denominador. Dados antigos ficam corretos por coalesce, sem backfill.
* Simulado: a tela de resultado bloqueia até as correções resolverem (poll 3s + re-disparo), com timeout de 90s que força `sem_ia`. Estudo: correção síncrona inline com feedback + resposta padrão.
* Threshold de "acerto" para stats/erradas/temas: pontos ≥ 70 (mesmo limiar visual do app). XP: base = pontos/10 (tentativas antigas: acertos×10), concedido só após a nota consolidar.
* Desafio diário não sorteia discursivas (fluxo síncrono não combina com latência/custo de IA).
* Conversão fechada→aberta é reversível: as alternativas ficam preservadas no banco e são ignoradas pelo formato.
* Simulado personalizado: formato das questões é escolha do aluno (`fechadas` default | `discursivas` | `misto`).

## Flashcards

* Três origens de deck: **oficiais** (criados pelo admin, `user_id IS NULL` + `oficial=true`), **da comunidade** (decks de usuários com `publico=true`) e **meus decks** (privados ou públicos do próprio usuário).
* Escrita de usuário SOMENTE via RPCs `SECURITY DEFINER` (`flashcards_criar_deck`, `flashcards_atualizar_deck`, `flashcards_excluir_deck`, `flashcards_toggle_like`); admin cria/atualiza deck oficial via RPC atômico `flashcards_admin_salvar_deck_oficial` (exclusão direta por policy). Leitura exige assinatura ativa (exceto decks próprios).
* Deck oficial tem estado de **rascunho**: só fica visível para alunos quando `publico=true` (admin publica explicitamente no editor). Vale para decks e cards (policy de SELECT exige `publico`).
* Limites: título 3–120 chars, descrição ≤ 500, frente/verso do card 1–2.000 chars, 1–200 cards por deck, 50 decks por usuário. Título/descrição passam por filtro de linguagem inapropriada.
* Likes: só em decks públicos não-oficiais; o dono PODE curtir o próprio deck (comunidade e "Meus decks"); exige usuário não banido e assinatura ativa (admin dispensa assinatura); contagem denormalizada (`likes_count`) recalculada por trigger; UI atualiza de forma otimista no feed.
* Feed da comunidade (`flashcards_feed`): ordenação por recentes ou mais curtidos, paginado (limite ≤ 100).
* Imagens de cards no bucket `flashcard-imagens` (público, 2 MB, webp/png/jpeg). URLs de imagem são validadas server-side (P0014): precisam apontar para o bucket em host Supabase e, para usuários, para a própria pasta `user/{uid}/` — imagem externa é rejeitada.
* Limpeza de imagens órfãs: ao salvar/excluir deck, o frontend compara as URLs antes/depois e remove do bucket (Storage API, best-effort) as imagens que deixaram de ser referenciadas — o Supabase bloqueia DELETE direto em `storage.objects`, então a limpeza é client-side via as policies de DELETE do bucket (dono da pasta/admin). Falha na limpeza não bloqueia a operação principal (órfão eventual é aceitável).
* Execução do deck: flip frente/verso, aluno marca acerto/erro por card, acompanha contadores de acertos × erros durante a sessão e vê percentual ao final (contagem só em memória — sem persistência de resultado por card no MVP). A tela de conclusão sugere até 3 outros decks (oficiais + comunidade) para continuar estudando.

## Público-Alvo

* **Primário** : alunos de medicina do 1º período em instituições da rede Afya
* **Secundário** : demais períodos de medicina da rede Afya
* **Expansão** : outras instituições de ensino médico após validação do MVP

## Diferencial Competitivo

* Foco em formatos de avaliação pouco atendidos por bancos genéricos (processuais, laboratório e multiestações)
* Personalização granular: aluno monta o simulado exatamente com o que precisa estudar
* Competição por consistência de estudo e XP, sem confronto direto por acurácia

## Monetização

* **Modelo**: freemium com três níveis de acesso. `/dashboard/*` é acessível a
  qualquer autenticado; o que muda é o que cada nível pode fazer lá dentro.
  Admins/super_admins têm acesso de `avancado`.

### Níveis de acesso

A fonte da verdade é `public.nivel_acesso(uid)`, função TOTAL que devolve
`gratuito | essencial | avancado` (nunca NULL). `assinatura_tier()` é derivada
dela e mantém o contrato antigo (NULL para quem não paga).

| Recurso | Gratuito | Essencial | Avançado |
|---|---|---|---|
| Treinos nacionais (`prova.formato = 'nacional'`) | até 3 tentativas | sem limite | sem limite |
| Provas processual / laboratório / integradora | não | não | sim |
| Montar simulado personalizado | não | não | sim |
| Impressão em PDF | não | sim | sim |
| Materiais de estudo | não | não | sim |
| Flashcards | não | não | sim |
| Histórico e revisão das próprias tentativas | sim | sim | sim |
| Desafio diário | sim | sim | sim |
| Competitivo / ranking | sim | sim | sim |
| Correção da Aurora (discursivas) | sim, dentro das 3 tentativas | sim | sim |

* **Teto do plano gratuito**: `limite_tentativas_gratuitas()` (hoje 3),
  **vitalício**, não por período. `tentativas_gratuitas_restantes()` conta TODO
  o histórico de `tentativa` do usuário (exceto `modo = 'visualizar'`), então
  não existe coluna de contador nem backfill: quem usou a plataforma como
  assinante e depois churnou chega em 0 tentativas gratuitas.
* **O que debita**: `iniciar_tentativa` com `modo <> 'visualizar'`. Sem estorno,
  mesmo se o aluno abandonar a prova. `retomar_tentativa` é outra RPC e nunca
  debita de novo.
* **Onde o gate vive**: dentro das RPCs `SECURITY DEFINER` (a escrita direta em
  `tentativa` já é revogada de `authenticated`), mais o RLS de
  `questao`/`alternativa` (`tem_assinatura_ativa()`) e de
  materiais/flashcards (`tem_acesso_avancado()`). Os guards Angular são
  conveniência de navegação, não a fronteira de segurança.
* **Erros**: `P0015 tier_upgrade_required` (recurso de plano superior),
  `P0016 free_limit_reached` (teto do gratuito esgotado), `P0009
  subscription_required` (gate binário legado nas RPCs de simulado
  personalizado e impressão). Os três abrem paywall na UI.
* **Segmentação de comunicação**: avisos (`avisos.segmento`) e notificações
  in-app (`admin_enviar_notificacao(p_segmento)`) filtram por nível
  (`todos | pagantes | gratuitos | essencial | avancado`), para conteúdo de
  assinante não chegar em quem não paga. O broadcast alcança apenas
  `papel = 'aluno'` não banido com e-mail confirmado.
* **Gateway**: Mercado Pago com **checkout embutido** na plataforma (Payment
  Brick + Checkout API, ver ADR-029). O aluno paga sem sair do BoraMed; os
  dados de cartão são digitados em campos seguros (iframes) do Mercado Pago —
  o BoraMed segue fora do escopo PCI.
* **Pagamento único (mensal e semestral)**: ambos os planos são à vista, sem
  renovação automática — cartão (parcelas conforme o plano: mensal só 1x,
  semestral em até 6x), Pix (expira em 30min) ou boleto (3 dias) via edge
  `mp-processar-pagamento` → `POST /v1/payments`. O acesso é concedido por
  `frequency` meses (`proxima_cobranca = now + N meses`). Preço sempre do
  banco (nunca do cliente), idempotência por `attempt_id`/`X-Idempotency-Key`,
  rate limit de 5 tentativas/15min por usuário, bloqueio 409 com acesso ativo.
  Cada tentativa vira uma linha em `pagamento_intencao` (o frontend acompanha
  por polling; RLS "select own").
* **Recorrente (LEGADO)**: o mensal foi assinatura recorrente até 07/2026
  (preapproval via `mp-processar-assinatura`; a edge segue deployada mas
  rejeita planos com `recorrente=false`). Assinantes antigos com preapproval
  vivo continuam cobrados e geridos normalmente (cancelar/pausar/reativar/
  trocar cartão via `mp-gerenciar-assinatura`), no valor contratado à época. A
  UI identifica esses casos pelo `assinatura.mp_preapproval_id`, não pelo
  `plano.recorrente`.
* **Planos**: definidos na tabela `plano`, com `tier` (`essencial`/`avancado`),
  preço e frequência por linha, ajustáveis sem deploy — ou seja, o preço muda
  por `UPDATE` direto em produção, sem passar por migration. Catálogo em
  2026-08-02 (**confirmar em produção antes de usar estes números** — é dado,
  não schema, e já mudou pelo menos uma vez sem deixar rastro em migration):

  | slug | tier | preço | período |
  |---|---|---|---|
  | `essencial-mensal` | essencial | R$ 23,90 | 1 mês |
  | `essencial-semestral` | essencial | R$ 83,40 | 6 meses |
  | `mensal` | avancado | R$ 69,90 | 1 mês |
  | `semestral` | avancado | R$ 299,40 | 6 meses |

  O plano gratuito NÃO tem linha em `plano`: é a ausência de assinatura ativa.
  As colunas `mp_preapproval_plan_id`/`mp_init_point` são legadas (redirect) e
  não são usadas em compras novas.

  > A landing (`(marketing)/landing/landing.component.ts`) ainda repete esses
  > preços em constantes, com `TODO(integração)` para passar a ler
  > `listarPlanos()`. Ao mexer em preço, alterar os dois lugares até o TODO ser
  > resolvido — e checar produção primeiro: preço muda por `UPDATE`, sem
  > migration, então o histórico de commits não é fonte confiável do valor
  > atual.
* **Estados da assinatura** (espelham o Mercado Pago): `pending` →
  `authorized` (ativa) → `paused`/`cancelled`. **Fonte da verdade: webhook do
  MP** (a resposta síncrona do checkout apenas antecipa o mesmo sync,
  idempotente). Reconciliação ativa via `mp-consultar-pagamento` ("Já paguei",
  webhook atrasado, pós-3DS).
* **Retry de cobrança** (regra do MP): após 3 parcelas recusadas a assinatura é
  cancelada automaticamente.
* **Vínculo aluno↔assinatura**: `external_reference` = `profiles.id` nos
  payments e preapprovals novos; fallbacks legados do webhook (payer_email,
  linha de assinatura existente) preservados para assinantes antigos.
* **Assinantes legados (pré-checkout embutido)**: continuam nos preapprovals
  criados via redirect, cobrados e geridos normalmente — não há migração.

## Conteúdo por Período

### 1º Período — fonte: Arthur Barata (a preencher)

Temas cobrados em avaliações processuais e de laboratório do 1º semestre.
Arthur deve fornecer lista de temas por tipo de prova (N1, P1, N2, P2).

### 2º–12º Períodos

A mapear com colegas do Arthur após validação do MVP.
