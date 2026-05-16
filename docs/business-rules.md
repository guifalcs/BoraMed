
# Regras de Negócio — BoraMed

## Entidades Principais

### Questão

* Tipos: `nacional` | `processual` | `laboratorio`
* Período: 1 a 12 (semestres do curso médico; foco inicial em alunos da rede Afya)
* Questões de laboratório SEMPRE têm `imagem_url`
* Questões têm exatamente 5 alternativas, 1 correta
* Questões são autorais, criadas pelo time a partir dos temas, objetivos pedagógicos e formato das avaliações observadas. Não copiar enunciados, alternativas, imagens, gabaritos ou materiais oficiais de instituições.

### Simulado

* Gerado sob demanda pelo aluno
* Configuração: tipo de questão + tema(s) + quantidade
* Quantidades disponíveis: 5, 10, 15, 20, 30
* Ordem das questões: sempre aleatória
* A ordem sorteada deve ser persistida em `tentativa_resposta.ordem_na_tentativa` para que a revisão mantenha a mesma sequência da tentativa
* Se existir tentativa com status `em_andamento` ou `pausada`, a home e a área de simulados devem priorizar um CTA de continuidade para levar o aluno direto de volta à execução
* Uma vez iniciado, o tempo corre
* Pode ser pausado e retomado (estado salvo no banco)
* Não pode ser refeito com as mesmas questões na mesma ordem

### Resultado

* Calculado ao finalizar o simulado
* Nota: % de acertos
* Exibe gabarito com alternativa correta destacada
* Histórico visível apenas para o próprio aluno
* Quando houver distribuição por tema, o sistema sugere um próximo treino focado no tema de menor aproveitamento
* Treinos recomendados abrem a montagem de simulado com o tema pré-selecionado e modo estudo quando o objetivo for revisão

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
