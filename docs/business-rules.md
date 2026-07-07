
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
* Questões têm exatamente 5 alternativas, 1 correta
* Questões são autorais, criadas pelo time a partir dos temas, objetivos pedagógicos e formato das avaliações observadas. Não copiar enunciados, alternativas, imagens, gabaritos ou materiais oficiais de instituições.
* Na importação administrativa por IA, `DISCIPLINA` e `TEMA` são opcionais, mas quando informados devem corresponder exatamente a registros cadastrados. O prompt deve incluir as disciplinas e temas existentes para evitar classificação inventada pela IA.
* Questões importadas com `TEMA` válido devem ser vinculadas em `questao_tema`; sem tema, continuam válidas para provas, mas não entram em filtros de simulado por tema.
* Questões vinculadas a tentativas, desafios diários ou provas não devem ser deletadas diretamente; usar arquivamento/status quando for preciso remover da experiência do aluno.
* A visualização administrativa de questão deve reutilizar a mesma renderização do aluno e exibir abaixo um panorama com status, classificação, vínculos, gabarito, revisão e métricas.

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
* Alterações de papel (`aluno`/`admin`) devem passar pela RPC `alterar_papel_usuario`, nunca por `UPDATE` direto em `profiles` no cliente.
* Apenas administradores podem alterar papéis, e um administrador não pode revogar o próprio acesso.
* Suspensões de usuários devem passar pelas RPCs `admin_banir_usuario` e `admin_desbanir_usuario`, nunca por `UPDATE` direto em `profiles` no cliente.
* Um usuário suspenso permanece autenticado apenas para acessar a página fixa `/conta-suspensa` e o suporte. As demais rotas privadas devem redirecionar para a página de suspensão.
* Tabelas de estudo, gamificação, notificações, avisos e administração devem ter policy restritiva que bloqueia perfis suspensos. Tabelas e RPCs de suporte permanecem acessíveis para abertura e acompanhamento de solicitações.
* Administradores suspensos não contam como `admin` ou `super_admin` em funções de autorização. Nenhum administrador pode suspender a própria conta, e `super_admin` não pode ser suspenso.
* Telas de aluno acessadas por impersonação devem usar o usuário autenticado efetivo como escopo; consultas de histórico/tentativas devem filtrar `user_id` explicitamente e gravações em `tentativa_resposta` devem passar por RPC que valida o dono da tentativa.
* Buckets públicos de imagens podem expor arquivos por URL pública, mas não devem permitir listagem ampla de objetos pelo cliente.

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

## Público-Alvo

* **Primário** : alunos de medicina do 1º período em instituições da rede Afya
* **Secundário** : demais períodos de medicina da rede Afya
* **Expansão** : outras instituições de ensino médico após validação do MVP

## Diferencial Competitivo

* Foco em formatos de avaliação pouco atendidos por bancos genéricos (processuais, laboratório e multiestações)
* Personalização granular: aluno monta o simulado exatamente com o que precisa estudar
* Competição por consistência de estudo e XP, sem confronto direto por acurácia

## Monetização

* **Modelo**: paywall total. Todo o conteúdo (`/dashboard/*`) exige assinatura
  ativa (`assinatura.status = 'authorized'`). Sem assinatura, o aluno só acessa
  `/planos`, `/assinatura/retorno` e telas públicas. Admins/super_admins não
  passam pelo paywall.
* **Gateway**: Mercado Pago, assinaturas recorrentes (`preapproval`) no modelo
  **com plano associado**, checkout por **redirecionamento** (init_point do
  plano). O BoraMed não manuseia dados de cartão (PCI fica no Mercado Pago).
* **Planos**: definidos na tabela `plano` (mensal e anual no MVP). Preço,
  frequência e o `mp_preapproval_plan_id`/`mp_init_point` correspondente ficam
  por linha. Preços iniciais provisórios (mensal R$29,90 / anual R$288,00),
  ajustáveis sem deploy.
* **Estados da assinatura** (espelham o Mercado Pago): `pending` →
  `authorized` (ativa) → `paused`/`cancelled`. Fonte da verdade: webhook do MP.
* **Retry de cobrança** (regra do MP): após 3 parcelas recusadas a assinatura é
  cancelada automaticamente.
* **Vínculo aluno↔assinatura**: `external_reference` = `profiles.id` anexado ao
  init_point; fallback de reconciliação por `payer_email` no webhook.

## Conteúdo por Período

### 1º Período — fonte: Arthur Barata (a preencher)

Temas cobrados em avaliações processuais e de laboratório do 1º semestre.
Arthur deve fornecer lista de temas por tipo de prova (N1, P1, N2, P2).

### 2º–12º Períodos

A mapear com colegas do Arthur após validação do MVP.
