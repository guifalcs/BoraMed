# Minhas notas — revisão de UI

Rodada de 09/11/2026. Escopo: o fluxo do aluno em `/dashboard/notas`, incluindo teoria, prática, nota única, ausência de período, período indisponível e recuperação de erros.

## Skills escolhidas

| Skill | Aplicação |
| --- | --- |
| `emil-design-eng` (`~/.claude/skills`) | Hierarquia visual, campos para toque, feedback, foco, movimento reduzido e revisão antes/depois. |
| `revenue-centric-design` (`~/.agents/skills`) | Princípios **Removing information creates room for direction**, **A good dashboard informs at a glance** e **Friction kills conversion**: nomear o contexto, explicar a meta e facilitar o lançamento. Referências: `dashboards-and-data-viz.md` e `checkout-and-forms.md`. A cópia global contém essas referências; a cópia antiga do projeto não. |
| `break-ui` (`~/.claude/skills`) | Nomes extensos plausíveis, notas zero e decimais, ausência de notas, dimensão única, falhas, 320/390/1280px e texto a 200%. O pedido já autoriza implementar os ajustes; os cenários ficam nos testes e na galeria local. |
| `e2e-testing` (`.claude/skills`) | Page Object e Playwright, com interceptação das fronteiras de rede e cenários independentes. |

`find-animation-opportunities` foi consultada como filtro: esta tela precisa de feedback de interação, não de contagem animada nem de entrada em cascata. A implementação usa a orientação de `emil-design-eng` e os tokens do app. `apple-design` é mais pertinente a gestos e superfícies móveis. `prototype` e `pick-ui-library` exigem invocação explícita; não são necessários para polir os componentes Angular existentes. `animate-expo` e `write-swift` não correspondem ao stack. Não foi necessário instalar dependências.

## Antes e depois

| Antes | Depois | Por quê |
| --- | --- | --- |
| Siglas; o nome completo do eixo estava apenas no `title` | Nome completo do eixo selecionado, período/semestre e contagem de avaliações lançadas | Identificar o conteúdo também no celular. |
| Pílula escura para a aba ativa | Seleção em azul com sublinhado; indicadores de status preservados e descrição acessível por aba | Alinhar ao sistema visual e tornar a seleção explícita. |
| Traço do mínimo sem legenda visível | Barra com “Mínimo: N” | Explicar a referência sem abrir as regras. |
| Status principalmente pela cor da dica | Rótulos “Sem notas”, “No caminho”, “Atenção”, “Exame especial”, “Abaixo da meta” e “Meta atingida” | Permitir leitura sem depender de cor. |
| Zero aparecia mesmo sem nota | Travessão quando não há lançamento; zero continua sendo nota válida | Distinguir ausência de dado de desempenho. |
| Campos pequenos e salvamento implícito | Inputs de pelo menos 44px, teclado decimal, “Salva ao sair do campo”, “Salvando…” e “Alterações salvas” | Facilitar o toque e explicar a persistência. |
| Partes com pouca separação visual | Cabeçalhos Avaliação/Sua nota, agrupamento e peso total de cada avaliação dividida | Tornar a composição legível. |
| Abas sem navegação por setas/associação ao painel | Setas, Home/End, uma parada de tabulação entre abas, painel associado e foco visível | Completar o uso por teclado. |
| Erro visual sem vínculo explícito ao input | `aria-invalid` e `aria-describedby` ligam o erro ao campo | Tornar a validação acessível. |
| Aviso de foco apenas rolava a página | Também leva o foco à dimensão; respeita movimento reduzido | Orientar leitores de tela e teclado. |
| Limpeza podia começar com gravação pendente | Limpeza indisponível durante gravação; ao apagar, campos ficam bloqueados e a tela informa processamento | Evitar ações de escrita concorrentes contraditórias. |

O fluxo continua centrado em um eixo por vez. Regras seguem recolhidas; não foram adicionados KPIs globais, simuladores ou painéis de próximos passos. Os campos maiores e as legendas aumentam a altura, em troca de orientação e área de toque. No desktop, os cartões alinham pelo topo sem alongar o menor para igualar a prática.

## Dados difíceis e limites

| Valor renderizado | Origem e limite | Cenários |
| --- | --- | --- |
| Título do regulamento | `NotasRegulamento.titulo`, opcional; banco limita a 120 caracteres | Ausente e título extenso; período/semestre permanecem identificados. |
| Período/semestre | Perfil/regulamento; período 1–12, semestre validado no backend | 2º período, 9º indisponível, perfil sem período. |
| Nome e sigla do eixo | `NotasEixo`; banco limita nome a 120 e sigla a 20 caracteres | Cinco eixos reais; nome completo extenso e dimensão única. |
| Avaliações e partes | `NotasItem`/`NotasSubitem`; nomes até 120 caracteres; até 30 itens e 12 partes por item | APG, multiestações, laboratórios e memorial; nomes extensos com quebra de linha. |
| Nota/peso/meta | Pesos positivos até 100 por item; nota entre zero e peso, até duas casas decimais | 0, 16,5, 17,5, pesos 2,5, máximo excedido e exclusão por campo vazio. |
| Status e mensagem | Cálculo existente por dimensão, incluindo meta e exame | Sem notas, progresso, atenção e teoria com meta atingida sem aprovar a prática. |
| Coleções e rede | Árvore de um regulamento e lançamentos por folha | Nenhum lançamento, duas dimensões, dimensão única, falhas de leitura/escrita/exclusão e gravação pendente. |

Limites conferidos nas migrations existentes, sem alterações no banco. Os testes usam a composição real do 2º período com identificadores fictícios. O cenário de nomes extensos inclui uma nota zero, para não confundir zero com ausência.

| Fragilidade anterior | Exemplo plausível | Tratamento |
| --- | --- | --- |
| Nome do eixo indisponível sem hover | “Sistemas Orgânicos Integrados…” em um celular | Nome completo no conteúdo, com quebra de linha. |
| Campo e nome competem por largura | “Participação e desenvolvimento do raciocínio clínico na primeira parcial”, texto a 200% | `min-width: 0`, quebra de linha e campo que pode passar para a linha seguinte. |
| Dependência da cor e do traço do mínimo | Nota zero, barra vazia e teoria em atenção | Status escrito, ausência explícita e legenda da meta. |

Preservado: cálculo conservador das metas, pesos, ausência de compensação entre teoria e prática, validação de intervalo, salvamento otimista com restauração após falha, confirmação destrutiva e posicionamento independente. Não há benchmark para o máximo teórico de itens, nem validação em Safari/iPhone físico; a execução visual é em Chromium. Tema escuro e RTL não foram declarados como suportados neste fluxo.

## Movimento

`bm-press` nas abas e ações principais, com o token de 160ms existente. Chevron das regras com 160ms em `var(--ease-out)`. Dados e barra da nota atualizam imediatamente, sem animação de números ou largura. Movimento reduzido remove deslocamentos; o salto do aviso ao cartão usa rolagem instantânea. Skeleton respeita a preferência.

## Evidências e reprodução

- Galeria independente: `frontend/tests/screenshots/out/notas/comparacao.html`, com imagens incorporadas, seletor de dispositivo e nove estados.
- Montagens completas: `comparacao-mobile.png` e `comparacao-desktop.png`, no mesmo diretório.
- Capturas: 390×844 e 1280×900, DPR 2. Nas capturas são ocultados apenas bottom nav, sino flutuante e suporte, para não cobrir o conteúdo. O shell do app não foi alterado.
- O **antes** foi registrado antes de editar os seis arquivos dos componentes. O **depois** usa os mesmos dados por cenário. Os arquivos gerados são ignorados pelo Git; fixture, harness e gerador são versionados.

```bash
cd frontend
npx playwright test notas-ui.spec.ts --project=mocked
SHOT_DIR=depois npx playwright test --config=tests/screenshots/notas.config.ts
SHOT_DIR=depois SHOT_VP=desktop npx playwright test --config=tests/screenshots/notas.config.ts
node tests/screenshots/build-notas.mjs
npx ng build --configuration=production
npx vitest run --dir src core/utils/notas-calculo.util.spec.ts --globals --maxWorkers=1
```

Para gerar o antes, usar a versão anterior dos componentes e `SHOT_DIR=antes`. `SHOT_BASE_URL=http://localhost:PORTA` aponta as capturas para um servidor já iniciado em outra cópia; `E2E_BASE_URL` faz o mesmo para os testes. Nesta rodada, uma cópia de `git archive HEAD frontend` recebeu apenas os componentes novos e foi servida em 4212, pois Histórico estava em edição concorrente no servidor compartilhado. As alterações finais permanecem na árvore principal.

Validação final no projeto principal em 10/11/2026: build de produção aprovado (18 rotas pré-renderizadas), 17 testes Playwright aprovados sem retries e 20 testes existentes de cálculo aprovados. A galeria também foi aberta no Chromium: alternância de dispositivo/cenário e modo de comparação funcionaram sem erros JavaScript. O setup dos testes aguarda a hidratação antes de navegar e aceita o nome de perfil provisório do SSR.

Não foram feitas medições com alunos ou afirmações de aumento de retenção. Próximas oportunidades dependem do uso real: checar se o contexto e a orientação de salvamento reduzem dúvidas e se a primeira avaliação pendente na ordem do regulamento é interpretada como sugestão, sem assumir uma data de prova.
