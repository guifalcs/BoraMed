
# Regras de Negócio — Projeto Med

## Entidades Principais

### Questão

* Tipos: `nacional` | `processual` | `laboratorio`
* Período: 1 a 12 (semestres do curso médico Afya)
* Questões de laboratório SEMPRE têm `imagem_url`
* Questões têm exatamente 5 alternativas, 1 correta
* Questões processuais e de laboratório são elaboradas por professores Afya — conteúdo coletado e reescrito pelos sócios (não cópia literal das provas originais)

### Simulado

* Gerado sob demanda pelo aluno
* Configuração: tipo de questão + tema(s) + quantidade
* Quantidades disponíveis: 5, 10, 15, 20, 30
* Ordem das questões: sempre aleatória
* Uma vez iniciado, o tempo corre
* Pode ser pausado e retomado (estado salvo no banco)
* Não pode ser refeito com as mesmas questões na mesma ordem

### Resultado

* Calculado ao finalizar o simulado
* Nota: % de acertos
* Exibe gabarito com alternativa correta destacada
* Histórico visível apenas para o próprio aluno

## Fluxos Principais

### Gerar Simulado Processual ou Laboratório

1. Aluno seleciona tipo (processual ou laboratório)
2. Seleciona período
3. Seleciona tema(s)
4. Define quantidade de questões
5. Sistema sorteia questões do banco respeitando filtros
6. Aluno responde na ordem apresentada
7. Ao finalizar: exibe resultado com gabarito

### Provas Nacionais

1. Aluno navega pela lista de provas disponíveis
2. Filtra por período e ano
3. Abre a prova e responde
4. Ao finalizar: exibe resultado com gabarito

## Calendário de Provas Afya (todos os campi)

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

* **Primário** : alunos do 1º período Afya
* **Secundário** : demais períodos da rede Afya (mesmo calendário)
* Todas as unidades Afya do Brasil seguem o mesmo calendário e tipos de prova

## Diferencial Competitivo

* Especificidade Afya: provas processuais e de laboratório não existem em bancos genéricos (QConcursos, Medway, etc.)
* Personalização granular: aluno monta o simulado exatamente com o que precisa estudar
* Não competir em volume bruto de questões — competir em relevância

## Monetização (planejada)

* Freemium: Provas Nacionais gratuitas, Processuais e Laboratório pagos
* Preço alvo: R$19–39/mês ou R$99–199/semestre
* Definição final pendente

## Conteúdo por Período

### 1º Período — fonte: Arthur Barata (a preencher)

Temas das provas processuais e de laboratório do 1º semestre Afya.
Arthur deve fornecer lista de temas por tipo de prova (N1, P1, N2, P2).

### 2º–12º Períodos

A mapear com colegas do Arthur após validação do MVP.
