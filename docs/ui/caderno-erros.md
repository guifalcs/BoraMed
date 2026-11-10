# Caderno de Erros — revisão de UI

Rodada de 09/11/2026. Escopo: `/dashboard/caderno-de-erros` e `/dashboard/caderno-de-erros/refazer/:questaoId`.

## Skills escolhidas

| Skill instalada | Papel nesta rodada | Critério de uso |
| --- | --- | --- |
| `emil-design-eng` (`~/.claude/skills`) | Hierarquia, polimento, feedback de toque, acessibilidade e comparação antes/depois | Principal para revisar e implementar a UI existente. |
| `revenue-centric-design` (`~/.agents/skills`) | Próximo passo claro, indicadores com contexto e estados vazios acionáveis | Aplicados os princípios **Removing information creates room for direction**, **Never ship a blank dashboard** e **Small-steps effect**. A revisão de uma questão é o menor passo útil. Não foi feita promessa de aumento de retenção sem medir. |
| `break-ui` (`~/.claude/skills`) | Dados plausíveis difíceis, nomes longos, contagens, zero/uma questão, falhas, celular e texto ampliado | Problemas identificados e corrigidos dentro da autorização do pedido. Fixtures ficam só nos testes. O seletor de cenários fica na galeria local de comparação, fora do app. |
| `find-animation-opportunities` (`~/.claude/skills`) | Filtrar oportunidades de movimento | Usada na avaliação: feedback de toque e orientação dos accordions; rejeitadas animações decorativas dos dados e da navegação. A implementação segue `emil-design-eng` e os tokens existentes. |
| `e2e-testing` (skill local do projeto) | Validação do fluxo com Playwright e Page Object | Mocks nas fronteiras da API, cenários independentes e checagem de falhas. |

`apple-design` é pertinente a uma rodada de gestos, sheets e movimento físico, mas esta tela precisa principalmente de leitura e ação previsíveis. `prototype` fica para uma exploração solicitada de alternativas de layout; a skill exige invocação explícita. `pick-ui-library` também exige invocação explícita e não é necessário adicionar bibliotecas aqui. `animate-expo` e `write-swift` não correspondem ao stack Angular. `improve-animations`/`review-animations` servem para uma auditoria específica de movimento, não são o ponto de partida para este problema.

Referências locais: `~/.agents/skills/revenue-centric-design/references/dashboards-and-data-viz.md` e `onboarding-and-activation.md`. A versão global contém referências que não estão na cópia de `.agents/skills/revenue-centric-design` do projeto.

## Antes e depois

| Antes | Depois | Por quê |
| --- | --- | --- |
| Quatro KPIs igualmente chamativos; nomes de tema truncados em tamanho grande | Resumo compacto com as cores originais (vermelho, verde e azul), números tabulares em pt-BR e nomes com quebra de linha | Separar o contexto da ação e permitir identificar temas extensos. |
| Simulado era a ação principal; refazer uma questão dependia de achar o ícone na lista | **Começar revisão** abre a fila de pendentes da página atual; simulado em painel secundário expansível | Reduzir o esforço para iniciar uma revisão. |
| “Mostrar dominadas” substituía a lista, sugerindo uma opção aditiva | Seletor explícito **Pendentes / Dominadas**, com `aria-pressed` | Tornar o estado inequívoco. Limpar filtros preserva o status selecionado. |
| Enunciado em uma linha e ações de cerca de 28px; no celular sobravam poucos caracteres | Prévia de duas linhas, Refazer com texto e ações de no mínimo 44px | Reconhecer a questão e facilitar toque. O texto completo permanece no refazer e na descrição acessível do link. |
| “Errou de novo” em vermelho | “Precisa de mais uma revisão” em âmbar | Informar a necessidade de prática sem reforço punitivo. |
| Sem posição na fila; card sempre “Questão 1” | Posição real, barra de progresso e feedback após responder | Dar orientação e fechamento a cada questão. Acesso direto usa “Questão avulsa”, sem inventar progresso. |
| RPC retornava explicação, mas o componente não a repassava ao card | Explicação retornada é aplicada junto ao gabarito após responder | Corrigir o ciclo de aprendizado; nada é revelado antes da resposta. |
| Gerador prometia usar todos os filtros, embora não receba busca e múltiplos tipos | Geração bloqueada com busca ou mais de um tipo selecionado, com instrução de ajuste | Descrever corretamente o contrato atual da RPC, sem alterar banco ou sorteio. |
| Atualização otimista de domínio podia reinserir uma questão num filtro diferente em caso de falha | Botão informa processamento, persiste primeiro, confirma por toast e recarrega a lista atual | Preservar consistência e permitir recuperação de falhas. |
| Respostas lentas de filtros anteriores podiam sobrescrever a lista atual | Identificador de requisição descarta resultados antigos; revisão indisponível durante busca/carregamento | Evitar abrir uma fila desatualizada. |

Ajuste após revisão visual: foram recuperadas as cores dos cards anteriores na faixa superior, no valor e no ícone com fundo suave. O formato compacto e a quebra de linha da nova UI foram mantidos. Após novo feedback, os quatro valores passaram a ter a mesma tipografia (24px no celular, 28px a partir de 640px, peso 750), rótulos e colunas de mesma largura no desktop. Os cards foram compactados novamente: removida a altura mínima dos rótulos, padding vertical reduzido para 12px no celular e 14px a partir de 640px, e distância entre rótulo e valor reduzida para 6px. Assim, a altura acompanha o conteúdo sem reservar linhas vazias. Foi removida a diferenciação que deixava os dois últimos valores menores e os cards desequilibrados. Variantes seguem os mesmos estados anteriores: pendências em vermelho (verde quando zeradas), dominadas em verde quando há progresso, foco sugerido em vermelho quando disponível e tipo em azul.

## Casos extremos e decisões

Mapeamento dos dados renderizados; os limites abaixo descrevem o contrato TypeScript, não impõem novas validações no banco.

| Campo | Origem | Tipo / limite no contrato | Casos exercitados |
| --- | --- | --- | --- |
| Enunciado | `QuestaoErroItem.enunciado` | string, sem limite declarado | Texto clínico longo, palavra médica extensa, prévia e detalhe. |
| Tema, disciplina e agrupamento | `temaPrincipal`, `temaOrigem` | string sem limite; origem enumerada | Dois temas extensos, `SOI` curto, fallback por tipo e por disciplina. |
| Contagens e páginas | resumo + `totalCount` + grupos | number; API lista até 100 por página | 0, 1, 9 e 1.284; singular/plural e paginação. |
| Tipo e status | `tipoQuestao`, `status`, `ultimaRedoCorreta` | enums; último resultado pode ser null | Nacional/processual/laboratório, pendente/dominada, sem revisão/acerto/erro. |
| Data relativa | `erroEm` | string ISO; backend pode produzir vazio | Datas recentes nas capturas; guard para data inválida e futura no componente. |
| Revisão de origem | `provaId`, `tentativaId` | string ou null | Com ambos presentes e sem os dois; ação omitida quando não há destino. |
| Questão e gabarito | questão + resposta da RPC | enunciado/alternativas; explicação opcional | Gabarito oculto inicialmente, revelação após resposta, erro de envio e nova tentativa. |
| Coleções e rede | lista, resumo e requisições | lista paginada / estados assíncronos | Vazio, uma questão, grupos variados, falha de lista e falhas de escrita. |

| Gravidade anterior | Campo / valor plausível | Falha | Correção |
| --- | --- | --- | --- |
| Quebrado | Barra de geração em 390px | Quantidades e botão ultrapassavam o cartão; o shell podia esconder o excesso | Painel expansível com quebra de linha e controles que cabem no celular. |
| Ruim | Prévia clínica de mais de 150 caracteres | Quase todo o enunciado cedia espaço para badges, data e ícones | Metadados acima, duas linhas de prévia e ações em linha própria no celular. |
| Frágil | “Distúrbios hidroeletrolíticos e do equilíbrio acidobásico na doença renal crônica” | Nome grande era cortado no indicador; título do grupo também truncava | Wrap de nomes, `min-width: 0` e `overflow-wrap: anywhere`. |
| Frágil | Total 1.284 | Número cru e pouca indicação do volume da lista | Formatação pt-BR, contagem e indicação de página. |

Decisões aplicadas: nomes de tema quebram linha; enunciados são prévias de duas linhas, com detalhe completo na revisão; paginação existente de 100 itens é mantida. Não foi introduzida virtualização. A barra de progresso corresponde à posição percorrida na fila da página, não a uma métrica global de domínio nem ao número de acertos. Não há suporte a RTL ou tema escuro neste fluxo; esses modos não foram declarados como validados.

O que já estava adequado foi preservado: agrupamento colapsado por padrão, busca server-side, ordenação por seção e volume, correção server-side, máscara do gabarito e sorteio via RPC. Questões de laboratório sem imagem continuam incluídas.

## Movimento

| Local | Propósito / frequência | Aplicação |
| --- | --- | --- |
| Botões e links de ação | Feedback, uso frequente | `bm-press` existente: escala 0.97, 160ms, `var(--ease-out)` = `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Chevron dos painéis | Indicar estado | Rotação -90° → 0°, 160ms na mesma curva. A abertura do conteúdo é imediata. |

Rejeitados: contagem animada dos KPIs (dados para leitura), entrada em cascata da lista (repetição e atraso sem ganho), transição entre questões (navegação frequente), confete após cada acerto (frequência incompatível). Movimento reduzido remove transformações de toque e transições do chevron; foco por teclado é imediato. Nenhuma dependência nova.

## Evidências e reprodução

A galeria gerada fica em `frontend/tests/screenshots/out/caderno-erros/comparacao.html`. É um HTML independente com imagens incorporadas: permite alternar mobile/desktop, demo/pior caso/vazio/uma questão/falha e lista/refazer/resposta. `comparacao-mobile.png` permite compartilhar uma montagem simples. A saída é ignorada pelo Git; fixtures, harness e gerador são versionados.

```bash
cd frontend
npx playwright test caderno-erros.spec.ts --project=mocked
SHOT_DIR=depois npx playwright test --config=tests/screenshots/playwright.screenshots.config.ts caderno-erros.shots.spec.ts
SHOT_DIR=depois SHOT_VP=desktop npx playwright test --config=tests/screenshots/playwright.screenshots.config.ts caderno-erros.shots.spec.ts
node tests/screenshots/build-caderno-erros.mjs
npm run build
```

Para gerar o **antes**, executar o mesmo harness e fixture contra uma cópia do código anterior às mudanças, usando `SHOT_DIR=antes`; não rotular capturas do código novo como “antes”. Nesta rodada foi usado `git archive HEAD frontend` antes de qualquer commit, em pasta temporária, com servidor dedicado em 4211. Foram copiados apenas os arquivos de teste novos para essa pasta. As duas versões usam a mesma data (09/11/2026), sessão de teste, conteúdo e viewports (390×844 e 1280×900, DPR 2). Chrome fixo secundário e suporte são ocultados nas capturas para não flutuarem sobre o conteúdo; o shell não foi alterado no app.

Validação: build de produção; testes E2E com rede interceptada para resposta correta/incorreta, recuperação de falhas, seleção de status, filtros da geração, singular/vazio, 320/390/768/1024/1280px, texto a 200% e movimento reduzido. Capturas complementam os testes de interação. Não foi feita medição com alunos nem teste em iPhone físico; aprovação no Chromium não comprova comportamento em Safari real.

## Aprovação

Layout aprovado pelo usuário após os ajustes de cor, tipografia e compactação. A versão aprovada passou novamente pelos testes em 320, 390, 768, 1024 e 1280px, com nomes longos, texto a 200% e movimento reduzido, verificando rolagem horizontal e recorte interno dos cards no Chromium.

## Próximas oportunidades para avaliar com uso real

- Preservar filtros e grupos abertos ao voltar da revisão, se os alunos retomarem frequentemente a mesma lista.
- Resumo de fim de sessão com questões revistas e próximos temas; depende de definir o que constitui uma sessão, pois a fila atual é por página.
- Atalho de revisão do tema sugerido, condicionado à disponibilidade de temas no acervo; muitos itens nacionais usam fallback por disciplina/tipo.

Esses pontos não integram esta implementação.
