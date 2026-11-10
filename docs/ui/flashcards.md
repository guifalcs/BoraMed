# Flashcards — revisão de UI

Rodada de 10/11/2026. Escopo: biblioteca `/dashboard/flashcards`, criação/edição, estudo, conclusão e modal de curtidas. Frontend Angular existente; sem dependências ou migrations novas.

## Skills e direção

| Skill | Aplicação |
| --- | --- |
| `emil-design-eng` | Hierarquia, controles de toque, feedback, foco e parcimônia no movimento. |
| `revenue-centric-design` (versão global) | **Removing information creates room for direction**, **A good dashboard informs at a glance** e **Friction kills conversion**: tornar a próxima ação evidente, contextualizar os números e reduzir esforço no editor. Referências: `dashboards-and-data-viz.md`, `checkout-and-forms.md` e `onboarding-and-activation.md`. |
| `break-ui` | Casos plausíveis com nomes longos, ausência de dados, um card, 200 cards, 1.284 curtidas, falhas de rede/imagem e texto ampliado. O pedido inclui implementar os ajustes; as fixtures e controles de comparação ficam fora do app. |
| `e2e-testing` | Page Objects, dados isolados e interceptação da API; validação do comportamento por teclado e das operações de escrita. |

`find-animation-opportunities` orienta o filtro de movimento: virar é uma mudança espacial útil, mas contadores, dicas pulsando e entrada de cada card desviam a atenção em uma tarefa repetida. `apple-design` não é a principal ferramenta deste fluxo, que não tem gestos ou sheets próprios. `prototype` e `pick-ui-library` exigem invocação explícita e não são necessários para corrigir os componentes existentes. Expo e Swift não correspondem ao stack. Não há promessa de ganho de retenção sem medição com alunos.

## Antes e depois

| Antes | Depois | Por quê |
| --- | --- | --- |
| Criar deck aparecia só em Meus decks | Ação visível no cabeçalho da biblioteca | Facilitar encontrar a criação. |
| Título do deck truncado em uma linha | Título completo, origem/privacidade, contagem e Estudar | Reconhecer o conteúdo antes de abrir. Descrição continua sendo uma prévia de duas linhas. |
| Card inteiro era `div role=button` contendo outros botões | Botão nativo de estudar separado de curtir, editar e excluir | Evitar abrir o estudo ao curtir com Enter e usar comportamento nativo de teclado. |
| Abas pequenas, sem semântica de seleção | Abas de pelo menos 44px com setas, Home/End e associação ao painel | Tornar a navegação previsível. |
| Erro da lista virava toast e estado vazio | Mensagem persistente no conteúdo e Tentar novamente | Distinguir falha de ausência de decks. |
| Anterior, Errei, Acertei e Próximo disputavam uma linha | Revelar/avaliar em uma linha, navegação em outra | O Próximo ficava parcialmente fora da tela em 390px; os controles agora cabem. |
| Zoom era um botão dentro do botão de virar | Controles irmãos, face oculta com `aria-hidden` | Corrigir estrutura interativa e leitura acessível. |
| Virada de 550ms, entrada a cada card, dica pulsante e ícone de conclusão em loop | Virada curta, sem entrada ou contadores animados; feedback de toque e suporte a movimento reduzido | Priorizar leitura e velocidade em uma tarefa frequente. |
| Navegar parecia avanço de estudo | Progresso conta explicitamente cards avaliados, separado da posição atual | Pular um card não o marca como respondido. |
| Embaralhar apagava respostas imediatamente | Confirmação se já há respostas | Evitar perda da rodada por toque acidental. |
| Reforço reduzia a coleção e Refazer repetia só os erros | Coleção original preservada para Refazer deck completo | Fazer a ação corresponder ao rótulo. |
| Resultado com “1 acertos / 1 erros” e repetição como ação principal | Singular/plural corretos e Revisar N cards em destaque | Apontar o próximo passo útil. |
| Frente e verso sem labels associados; imagens sempre abertas | Labels associados, ajuda curta, contadores e imagens opcionais recolhidas | Reduzir o esforço para começar com texto. |
| Privacidade pouco explicada | Privado/Público com consequência explícita | Informar quem pode acessar o deck. |
| Controles pequenos, adição apenas pelo ícone + | Controles de 44px e Adicionar card por texto | Facilitar o toque e a descoberta. |
| Saída descartava edições; falha de carga deixava formulário vazio | Confirmação ao sair, inclusive por links internos; erro de carga com retry | Preservar o trabalho e evitar sobrescrever um deck após falha. |
| Salvar permitia editar/navegar durante envio de imagem | Gravação bloqueia o formulário; upload bloqueia salvar e trocar de card | Manter o conteúdo enviado consistente com o card selecionado. |
| Uploader mostrava 5 MB para um bucket de 2 MB | Editor configura limite de 2 MB e recusa excedente antes do envio | Alinhar a orientação ao contrato existente do módulo. O limite padrão do componente compartilhado continua configurável, com 5 MB como default. |
| Modal de curtidas sem contenção/restauração de foco | Dialog nativo, ciclo de Tab, Escape, foco restaurado e retry | Completar a interação por teclado. |

O resultado continua sendo **autoavaliação local à rodada**, explicitamente informado na interface. Não foi acrescentada repetição espaçada, agendamento, estatística persistente ou histórico fictício. Os decks Oficiais são preparados pela equipe BoraMed; o rótulo não indica vínculo com instituição de ensino.

## Casos extremos e decisões

| Campo | Origem/limite existente | Casos exercitados / decisão |
| --- | --- | --- |
| Título e descrição | `FlashcardDeck`/`FeedDeck`; título 3–120 caracteres, descrição até 500 | Nomes médicos extensos; título quebra linha, descrição é prévia de duas linhas. Ausência de descrição não reserva altura vazia. |
| Autor e datas | Feed; nome string, data ISO | Autor extenso e “Jo”; nome quebra linha, data é metadado secundário. Capturas têm data fixa. |
| Contagens | `cards_count`, `likes_count` | 0, 1, 3, 200 cards e 1.284 curtidas; números em pt-BR e singular/plural. |
| Frente/verso | Texto até 2.000 caracteres ou imagem; pelo menos um conteúdo por lado | Texto extenso, imagens opcionais e quebra de linha. Com o card focado, setas, Page Up/Down e Home/End permitem ler o conteúdo até o fim. Um card incompleto é focado antes de salvar; cards inteiramente vazios seguem omitidos do payload. |
| Coleções | Até 200 cards/deck e 50 decks próprios/usuário; feed em páginas de 20 | Biblioteca vazia, um item, vários decks e editor com 200 cards. O editor renderiza apenas um par de campos por vez. |
| Imagens | Bucket público `flashcard-imagens`, 2 MB | Imagem real do projeto, zoom e erro de imagem; excedente de tamanho bloqueado antes do storage. Os controles do editor impedem trocar o card durante upload. |
| Assíncrono | Listagem, feed, leitura e RPCs de escrita | Retry, rollback de curtida, falha ao salvar com conteúdo preservado e gravação pendente. Resposta atrasada de leitura não substitui outro deck. |
| Estado de estudo | Mapa local por id de card | Navegação sem resposta, rodada com erros, reforço e restauração completa. Sem escrita de resultados no banco. |

Larguras: 320, 390 e 1280px; texto a 200%. Nomes necessários à identificação quebram linha. As abas têm rolagem própria quando necessário. A grade de avaliação pode passar a uma coluna com texto ampliado. Não há benchmark do máximo teórico de decks oficiais nem suporte declarado a RTL/tema escuro. Validação visual em Chromium; não equivale a teste em Safari/iPhone físico.

## Movimento

Virada: 220ms em `var(--ease-out)`, apenas `transform`, sem bounce. Ação por teclado e preferência de movimento reduzido evitam a animação da virada. `bm-press` usa o token existente de 160ms nas ações de toque. Não há animação de entrada por card, contagem, largura do progresso, dica em loop ou ícone de conclusão pulando. A superfície de leitura não se move em hover; hover do zoom é restrito a ponteiro com hover.

## Evidências e reprodução

Galeria independente: `frontend/tests/screenshots/out/flashcards/comparacao.html`. Alterna mobile/desktop e 13 etapas/estados: oficiais, comunidade, meus decks, novo deck, edição, pergunta, resposta, imagem, conclusão, nomes longos, vazio, um item e erro. Contém imagens incorporadas e links de download. As montagens `comparacao-oficiais-mobile.png`, `comparacao-resposta-mobile.png` e `comparacao-editor-mobile.png` facilitam compartilhar o comparativo; há equivalentes para desktop.

Capturas em 390×844 e 1280×900, DPR 2, com a mesma fixture e data. Bottom nav, sino flutuante e suporte são ocultados apenas nas capturas para não cobrir o conteúdo. O antes foi registrado antes de editar os componentes; a versão de referência é `ba31dbb`. A saída é ignorada pelo Git; fixture, harness e gerador são versionados. Para reproduzir o antes, copiar os arquivos de captura/fixture para um checkout dessa versão e usar `SHOT_DIR=antes`.

```bash
cd frontend
E2E_BASE_URL=http://localhost:4216 npx playwright test flashcards-ui.spec.ts flashcards.spec.ts --project=mocked
SHOT_BASE_URL=http://localhost:4216 SHOT_DIR=depois npx playwright test --config=tests/screenshots/flashcards.config.ts
SHOT_BASE_URL=http://localhost:4216 SHOT_DIR=depois SHOT_VP=desktop npx playwright test --config=tests/screenshots/flashcards.config.ts
node tests/screenshots/build-flashcards.mjs
npx ng test --watch=false
npx ng build --configuration=production
```

`SHOT_BASE_URL` e `E2E_BASE_URL` acima apontam para um servidor já iniciado com `ng serve --configuration=e2e --port=4216`. Sem `SHOT_BASE_URL`, o harness de capturas inicia o servidor padrão em 4210. Nesta rodada foi usado servidor dedicado em 4216, para não interferir em outras revisões do app.

Validação: suíte completa com 1.001 testes unitários aprovada; 29 E2E aprovados sem retries, incluindo os três testes anteriores do módulo; build de produção aprovado, com 18 rotas pré-renderizadas; galeria aberta no Chromium, com troca de dispositivo/cenário e modo de comparação sem erros JavaScript. A captura cobre 13 estados em duas larguras. Houve falha transitória no download de fontes durante a validação; o build passou na nova execução e o servidor E2E foi reiniciado para servir o bundle atualizado.

Próximas oportunidades para avaliar com uso real: busca de decks com contrato server-side adequado; rascunhos recuperáveis do editor; retomada de sessão e eventual repetição espaçada, que exigem definir persistência e regras pedagógicas. Esses itens não foram implementados nesta rodada.
