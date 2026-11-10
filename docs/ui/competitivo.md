# Competitivo — revisão de UI

Rodada de 10/11/2026. Escopo: `/dashboard/competitivo`, com resumo pessoal, desafio diário e rankings Global/Semana. Implementação nos componentes Angular existentes, sem novas dependências, mudanças de RPC ou migrations.

## Skills aplicadas

| Skill | Aplicação |
| --- | --- |
| `emil-design-eng` | Hierarquia, foco visível, controles de pelo menos 44px, propriedades explícitas nas transições e feedback acessível. |
| `revenue-centric-design` (global) | **Removing information creates room for direction** e **A good dashboard informs at a glance**, de `references/dashboards-and-data-viz.md`: resumo compacto, próxima ação clara e posição pessoal contextualizada. Não há afirmação de melhora de retenção sem medição. |
| `break-ui` | Fixtures no limite plausível do contrato, comparativo fora do produto, 320/390/1280px e ampliação de texto a 200%. O pedido inclui implementar as correções. |
| `e2e-testing` | Page Object, rede interceptada, seleção/confirmar, erros, recuperação, anonimato e teclado. |

A interface preserva as coroas e o manto do pódio. Não há animação de entrada de participantes, contagem de XP ou reordenação; seleção e troca de abas são imediatas. Hover exige ponteiro fino e movimento reduzido desativa transições. Skills para Expo/Swift, novas bibliotecas ou geração de imagens não correspondem a este fluxo.

## Antes e depois

| Antes | Depois | Por quê |
| --- | --- | --- |
| Cabeçalho em bloco e métricas altas empilhadas no celular | Título compacto e resumo em linhas; três colunas onde há espaço | Trazer a questão para mais perto do início. Cada indicador reúne ícone, rótulo/contexto e valor na mesma linha também no desktop, sem reservar uma segunda linha vazia. |
| Desafio e ranking sempre empilhados | Dois painéis a partir de 1180px; ordem de leitura mantida no celular | Aproveitar a largura disponível. |
| Tocar na alternativa registrava imediatamente | Radios nativos, letra em círculo no padrão do simulado, seleção alterável e Confirmar resposta | Evitar envio acidental; envio bloqueia nova seleção e duplicação. |
| Resultado apenas abaixo das alternativas | Resultado junto do enunciado, XP recebido e rótulos na correção | Separar sua resposta da alternativa correta, sem depender da cor. |
| Posição pessoal carregada mas não exibida | Posição e total do período selecionado | Dar significado ao ranking para quem está fora dos primeiros lugares. |
| Abas pequenas e sem semântica de seleção | Tablist de 44px, uma parada de Tab, setas/Home/End e painel associado | Navegação previsível por teclado. |
| Nomes cortados; avatar quebrado sem recuperação | Nome completo com quebra e inicial por grafema como fallback | Preservar identificação e caracteres compostos. |
| Falhas de XP, ranking e desafio viravam zero/vazio/indisponível | Mensagens persistentes e nova tentativa por área | Distinguir ausência de dados de falha de rede. |
| Resposta salva + falha de recarga deixava o desafio reenviável | Estado confirmado localmente a partir da RPC; Atualizar correção | Preservar o registro e recuperar o gabarito sem reenviar. |
| Privacidade citada apenas na descrição, oculta no celular | Estado de visibilidade e link para Perfil no rodapé do ranking | Tornar o controle de anonimato encontrável. |

## Dados e regras preservadas

- Ranking por XP de **atividade**, não por percentual de acerto. XP Global e Semana vêm dos campos do servidor; datas usam `currentWeekRange()`.
- `get_ranking_*` continua limitado a dez posições superiores e eventual linha pessoal, com separador nas lacunas. Não há necessidade de renderizar mil posições nem de inventar paginação.
- `user_id` nulo permanece nulo. Não se cria link para a pessoa nem se busca informação adicional de perfis privados. A própria linha usa `is_me`.
- A seleção de uma alternativa não dispara escrita. Confirmar chama a mesma RPC de resposta; XP e resultado são os retornados pelo servidor. Depois do sucesso, o resumo usa os novos stats retornados e o ranking/posição são recarregados.
- Gabarito e explicação completa só aparecem com a resposta recarregada. Se a gravação foi confirmada mas a recarga falhou, o resultado retornado pode ser mostrado para a alternativa enviada, com Atualizar correção. Se `ja_respondeu=true` e a recarga falha, não se atribui a alternativa tentada à resposta anterior.
- Imagens são opcionais e mantêm resolução de URL protegida. Zoom é um botão separado da seleção, disponível também na revisão; não há filtragem de questões por imagem.
- Questão indisponível, zero participantes e erro são estados distintos, todos com orientação para continuar.

## Auditoria com dados extremos

| Campo | Contrato / caso exercitado | Comportamento |
| --- | --- | --- |
| `nome_display` | Texto sem limite de UI; nome extenso, acentos, emoji composto, Anônimo repetido | Quebra de linha; texto completo. Inicial por `Intl.Segmenter`. |
| `avatar_url` | URL opcional ou 404 | Imagem circular fixa; falha troca por inicial. |
| XP / posição / nível | Números do servidor; XP próximo de 2.147.483.647 | `pt-BR`, algarismos tabulares e valor integral. Layout se reorganiza pelo espaço em `rem`; nunca usa reticências no número. |
| Sequência / protetores | 0, 1, 7 e 365 dias; 0/1 protetor | Singular/plural explícito e contexto visível. |
| Questão / disciplina | Texto longo, apoio opcional, Markdown, figura e legenda opcionais | Quebra sem corte; mesma questão pode existir sem imagem. |
| Alternativas | Texto, imagem opcional, selecionada, correta e incorreta | Rótulos associados e zoom independente. Correção usa texto e ícone. |
| Coleção | 0, 1 e 11 linhas (10 superiores + própria posição) | Estado vazio com ação; lista sem área de rolagem interna. |
| Rede | Falha total, por período, no envio e na recarga após sucesso | Retry local, escolha preservada ou envio bloqueado conforme confirmação da RPC. |

Os cortes de números com texto ampliado foram corrigidos com container queries: métricas e XP usam a linha completa quando necessário. Em espaços extremos, o sufixo XP pode ocupar outra linha; o número permanece inteiro. Os indicadores reduzem o espaçamento lateral e mantêm fonte legível, e as abas ganham espaço lateral. Em duas colunas, o terceiro indicador usa a linha completa, sem uma célula vazia. Nomes que antes eram truncados agora quebram linha. A varredura cobre 98 larguras entre 280 e 3.840px, nos limites dos breakpoints e entre eles, com texto normal e a 200%. Inclui ausência de rolagem horizontal na página, cortes dentro dos painéis, dados normais/extremos e sete estados adicionais em larguras críticas. São 546 combinações de estado/largura/texto. Interação por toque e rotação é exercitada em 320×568, 390×844 e 768×1024, preservando a seleção ao girar. Teclado e preferência por movimento reduzido também estão cobertos. O produto atual usa tema claro e português; não foram adicionados tema escuro ou RTL nesta rodada.

## Evidências e reprodução

Galeria: `frontend/tests/screenshots/out/competitivo/comparacao.html`. Compara nove estados em celular e desktop, com imagens incorporadas e download das capturas. Controles alternam dispositivo, estado e apenas o depois. Há montagens de resumo, resposta e erros: `comparacao-demo-mobile.png`, `comparacao-answered-mobile.png`, `comparacao-error-mobile.png`, e equivalentes desktop.

```bash
cd frontend
NG_BUILD_MAX_WORKERS=2 npx ng serve --configuration=e2e --port=4218
E2E_BASE_URL=http://localhost:4218 npx playwright test competitivo-ui.spec.ts --project=mocked --workers=1
SHOT_BASE_URL=http://localhost:4218 SHOT_DIR=depois npx playwright test --config=tests/screenshots/competitivo.config.ts
SHOT_BASE_URL=http://localhost:4218 SHOT_DIR=depois SHOT_VP=desktop npx playwright test --config=tests/screenshots/competitivo.config.ts
node tests/screenshots/build-competitivo.mjs
```

As capturas do antes usam o componente do commit `aeb0bae`, com a mesma fixture. Para reproduzi-las, servir essa revisão em checkout separado, mantendo as fixtures e o script de captura atuais; executar com `SHOT_DIR=antes`. Os testes não usam credenciais nem dados reais de alunos. As capturas ocultam somente navegação inferior, botão flutuante de notificações e suporte para mostrar o conteúdo completo; o E2E mantém esses controles.

## Validação da rodada

- Build de produção aprovado, com 18 rotas estáticas geradas.
- Suíte unitária completa: 80 arquivos e 1.001 testes aprovados.
- 32 testes Playwright do fluxo, incluindo varredura de 546 combinações responsivas, estados de erro/vazio/imagem/resultado, texto a 200%, toque e rotação. O CI também executa `competitivo-ui.spec.ts`.
- 36 capturas reais: nove estados × dois dispositivos × antes/depois.
- Galeria independente validada com troca de estado/dispositivo, imagens decodificadas e opção de mostrar apenas o depois.
