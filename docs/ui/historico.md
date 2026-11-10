# Histórico — revisão de UI

Escopo: `/dashboard/historico`, com navegação para o resultado de uma tentativa e para a montagem de um treino recomendado. Implementado em 09/11/2026. As telas internas de resultado e revisão mantêm sua estrutura.

## Skills selecionadas

| Skill instalada | Uso nesta rodada | Aplicação |
| --- | --- | --- |
| `emil-design-eng` (`~/.claude/skills`) | Principal para UI | Contexto visível no mobile, títulos completos, alvos de 44px, foco visível, hover só com ponteiro e feedback de pressão com movimento reduzido respeitado. |
| `revenue-centric-design` (`~/.agents/skills`) | Hierarquia e próximo passo | Princípios de dashboards: indicador principal no início, significado junto dos números e ação perto do diagnóstico. Recomendação de treino junto do resumo. |
| `break-ui` (`~/.claude/skills`) | Verificação com dados extremos | Fixtures demo/pior caso/vazio/um item/erro/falha parcial, comparáveis numa galeria local. As correções já estavam autorizadas pelo pedido de implementação. |
| `find-skills` | Inventário das skills | O conjunto já instalado cobre o trabalho; nenhuma instalação adicional. |

`prototype` pode ajudar quando for necessário comparar direções visuais antes de escolher uma. `find-animation-opportunities` e `review-animations` fazem sentido para interações específicas em rodadas futuras. Nesta tela a prioridade é leitura: os gráficos atualizam imediatamente; não há animação de entrada em cascata. Skills de Swift, Expo e mobile nativo não se aplicam ao frontend Angular.

## Diagnóstico e decisões

| Antes | Depois | Por quê |
| --- | --- | --- |
| Sublabel dos KPIs oculta no celular; o tema de menor acerto não tinha nome visível no resumo | Contexto visível em todos os indicadores, com quebra em nomes extensos | Percentual sozinho não identifica o assunto a revisar |
| Quatro indicadores com a mesma competição por atenção | Acerto geral com fundo azul preenchido; demais indicadores com cores semânticas nos valores e ícones | Recuperar a leitura por cores, mantendo a geometria e a posição dos ícones aprovadas |
| Recomendação depois dos gráficos | Próximo foco junto da visão geral | Encurtar o caminho até o treino |
| Botões pequenos e escopo dos filtros implícito | Campos nativos com rótulos e altura mínima de 44px; escopo explícito | Os filtros afetam evolução e tentativas; KPIs e temas continuam acumulados |
| Tabela exigia rolagem horizontal no celular | Lista responsiva com título completo, data absoluta, modo, nota, acertos e link real para resultado | A informação principal cabe sem deslocamento horizontal e permite navegação por teclado |
| Primeiro uso repetido em dois painéis | Estado vazio único | Um próximo passo claro |
| Falha nas tentativas podia aparecer como histórico vazio nos indicadores | Resumo preservado e erro específico na lista | Diferenciar indisponibilidade de ausência de dados |
| Favorito falhava silenciosamente e mantinha cache antigo | Reversão com alerta; bloqueio durante envio; invalidação do cache após sucesso | Confirmar a gravação e preservar a escolha em revisitas |
| Retry recarregava a página, podendo ler o erro do cache | Retry limpa cache e busca novamente sem navegação | Recuperação no mesmo contexto |
| Barras com nomes de temas truncados | Nomes com quebra; cinco temas iniciais e botão para expandir os restantes | Legibilidade sem um painel de rolagem que corte a última linha |

A variação de nota compara **a primeira e a última nota do recorte**. Não representa tendência estatística, comparação de dificuldade ou previsão de desempenho. Com uma nota, a UI explica que há um único ponto. Nota nula em tentativa finalizada aparece como “Sem nota”.

A hipótese inicial de erro no filtro por tipo foi descartada ao conferir o modelo atual: `prova.formato` contém nacional/processual/laboratório. Não houve alteração nesse mapeamento ou nas APIs.

## Superfície de dados e extremos

| Campo | Origem | Limite / opcionalidade | Tratamento |
| --- | --- | --- | --- |
| Nome da prova | `TentativaHistoricoItem.prova_nome`, catálogo ou snapshot | `text` no schema; sem limite explícito no contrato | Nome médico extenso, quebra de linha e link completo |
| Tema | `DesempenhoTema.tema_nome` / KPI | `text`; prioridade pode estar ausente | Nome extenso, zero temas, ordenação por aproveitamento |
| Nota / taxa | Tentativa, KPIs e temas | Número percentual; nota pode ser nula | 0%, 100%, ausência e formatação pt-BR |
| Concluídos / questões / acertos | KPIs, temas, tentativa | Inteiros; zero e um válidos | 1.284 concluídos no pior caso; singular nos contadores de resultado |
| Data | `finalizada_em` / `ultima_nota_data` | ISO ou null | Data absoluta na lista; contexto temporal no resumo |
| Tipo / modo | `tipo_prova`, `modo` | Categoria / enum | Três formatos e dois modos na fixture |
| Prova removida | Snapshot e relação ausente | Relação pode ser nula | Identificação explícita e resultado ainda acessível |
| Favorito | Boolean e RPC existente | Atualização pode falhar | Estado acessível, envio bloqueado e rollback com alerta |
| Lista | Serviço de histórico | Últimas **50** tentativas, 10 por página | Paginação, busca, ordenação e aviso do limite quando o total é maior |
| Carregamento / erro | Resultados independentes das três consultas | Falha total ou parcial | Skeleton e mensagens próprias; retry sem reload |

Não foram alterados banco, RLS, sorteio, correção ou cálculo oficial dos indicadores. O limite existente de 50 tentativas permanece: filtros não consultam registros mais antigos. Consultar todo o acervo exige uma evolução da paginação no servidor e fica como oportunidade futura.

## Evidência e reprodução

Fixtures e testes:

- `frontend/tests/e2e/fixtures/historico.fixture.ts`
- `frontend/tests/e2e/historico.spec.ts`
- `frontend/tests/screenshots/historico.shots.spec.ts`
- `frontend/tests/screenshots/build-historico.mjs`

Com o dev server em 4210 (ou `SHOT_BASE_URL` / `E2E_BASE_URL` apontando para uma cópia isolada), executar em `frontend/`:

```bash
npx playwright test historico.spec.ts --project=mocked --output=tmp/historico-results/e2e
SHOT_DIR=depois npx playwright test --config tests/screenshots/historico.config.ts
SHOT_DIR=depois SHOT_VP=desktop npx playwright test --config tests/screenshots/historico.config.ts
node tests/screenshots/build-historico.mjs
```

O `antes` usa os componentes do histórico e o gráfico da revisão `2be327e`, anteriores à alteração, com a mesma fixture e relógio de 09/11/2026. As capturas são do app, não de uma reconstrução em HTML. A galeria é um HTML independente com as imagens embutidas, seleção mobile/desktop e seis estados de dados. O seletor existe apenas no artefato de revisão. A barra fixa inferior e o suporte são ocultados nas capturas de página inteira para não atravessarem o conteúdo.

Artefatos locais, ignorados pelo Git: `frontend/tests/screenshots/out/historico/comparacao.html`, `comparacao-mobile.png` e `comparacao-desktop.png`. Os scripts e fixtures permanecem versionáveis.

Oportunidades seguintes: preservar filtros no retorno do resultado; paginação no servidor para histórico completo; revisar a hierarquia interna do resultado e o caminho de revisão dos erros. Nenhum ganho de retenção ou aprendizado foi medido nesta rodada.

## Verificação concluída

- Build de produção `ng build`: passou, sem avisos de budget.
- Playwright do fluxo: 11 testes passaram, incluindo navegação por teclado até o resultado e retorno, filtros, paginação, ordenação, favoritos com falha e persistência, primeiro uso e recuperação de erro parcial.
- Gráfico: os três testes unitários existentes passaram.
- Layout: 320, 390, 768 e 1440px com nomes extensos e fonte raiz ampliada de 16 para 20px; ações visíveis e sem overflow interno nos elementos verificados.
- Comparação: 24 capturas reais (antes/depois × mobile/desktop × seis estados), com relógio controlado e mesmos dados.
- Inspeção visual: demo desktop/mobile, pior caso e falha parcial; galeria validada no navegador.

Os testes de fluxo usam rede simulada. Não houve validação em aparelho físico nesta rodada. O seletor de dados de revisão fica no HTML local, fora do app.

## Ajuste de cores — 10/11/2026

A pedido do usuário, as cores originais dos indicadores voltaram aos números e ícones, preservando o novo formato, espaçamento e posição dos ícones. O acerto geral recupera o fundo azul institucional preenchido, com valor e ícone brancos e textos auxiliares claros. Os demais cards ficam com fundo branco, sem faixa superior ou fundo adicional no ícone. A última nota segue os limites anteriores (verde ≥70%, âmbar ≥50%, vermelho abaixo de 50%); simulados concluídos ficam verdes quando há conclusões; prioridade de revisão fica vermelha quando há tema. Ausência de dados usa azul. Capturas e galeria atualizadas.
