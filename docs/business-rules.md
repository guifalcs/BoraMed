
# Regras de Negócio — BoraMed

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
* Desafio diário deve exibir explicação pedagógica após a resposta quando a questão possuir `explicacao`
* Desafio diário não deve depender de `questao.dificuldade`, pois a classificação de dificuldade foi removida do schema de questões.

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

### Historico e analise de desempenho

* O historico do aluno deve permitir recortes por periodo de tempo e por formato de treino.
* Os formatos filtraveis no historico acompanham os formatos pedagogicos ativos: nacional, processual e laboratorio.
* Simulados personalizados devem continuar aparecendo no historico com o formato da prova gerada, preservando navegacao para resultado e revisao.

### Suporte

* O aluno pode abrir chamados e acompanhar o historico de mensagens pelo widget de suporte.
* Chamados resolvidos bloqueiam novas respostas ate serem reabertos.
* Chamados resolvidos podem ser reabertos pelo dono do ticket ou por administradores.
* Ao reabrir, o status volta para `aberto` e uma mensagem de auditoria fica registrada no historico do chamado.
* Quando a equipe reabre um chamado, o aluno recebe uma notificacao informativa.

## Calendário de Referência (Foco Inicial Afya)

Uso interno como referência de produto. Não apresentar como calendário oficial, parceria ou representação da Afya.

* **N1** (processual): semana 4–5 do semestre
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
* Telas de aluno acessadas por impersonação devem usar o usuário autenticado efetivo como escopo; consultas de histórico/tentativas devem filtrar `user_id` explicitamente e gravações em `tentativa_resposta` devem passar por RPC que valida o dono da tentativa.
* Buckets públicos de imagens podem expor arquivos por URL pública, mas não devem permitir listagem ampla de objetos pelo cliente.

## Integridade de Dados

* Toda entidade acadêmica (prova, questão, disciplina, tema) pode ser deletada pelo admin; a regra é preservar o histórico do aluno, nunca bloquear a exclusão.
* Deleções administrativas passam pelas RPCs `admin_deletar_prova`, `admin_deletar_questao`, `admin_deletar_disciplina` e `admin_deletar_tema` (SECURITY DEFINER, exigem `is_admin()`), nunca por `DELETE` direto no cliente.
* Prova: delete físico. Antes do delete, um trigger grava `tentativa.prova_snapshot` (nome/tipo/origem/formato) e o FK `tentativa.prova_id` vira `NULL`. O histórico, o resultado e a retomada de tentativas em andamento continuam funcionando; o app exibe o nome do snapshot com selo "prova removida".
* Questão: delete físico quando nunca foi usada por aluno; soft delete (`status='deletada'` + `apto_desafio_diario=false`) quando há respostas de tentativa ou desafio diário — a revisão dos alunos permanece intacta e a questão sai do banco, das provas e dos sorteios.
* Disciplina: delete físico; questões e temas vinculados ficam sem disciplina (`SET NULL`).
* Tema: delete físico; subtemas sobem para o pai do tema removido e as questões apenas perdem a marcação (`questao_tema` em cascade).

## Público-Alvo

* **Primário** : alunos de medicina do 1º período em instituições da rede Afya
* **Secundário** : demais períodos de medicina da rede Afya
* **Expansão** : outras instituições de ensino médico após validação do MVP

## Diferencial Competitivo

* Foco em formatos de avaliação pouco atendidos por bancos genéricos (processuais, laboratório e multiestações)
* Personalização granular: aluno monta o simulado exatamente com o que precisa estudar
* Competição por consistência de estudo e XP, sem confronto direto por acurácia

## Monetização (planejada)

* Freemium: treinos nacionais gratuitos, processuais e laboratório pagos
* Preço alvo: R$19–39/mês ou R$99–199/semestre
* Definição final pendente

## Conteúdo por Período

### 1º Período — fonte: Arthur Barata (a preencher)

Temas cobrados em avaliações processuais e de laboratório do 1º semestre.
Arthur deve fornecer lista de temas por tipo de prova (N1, P1, N2, P2).

### 2º–12º Períodos

A mapear com colegas do Arthur após validação do MVP.
