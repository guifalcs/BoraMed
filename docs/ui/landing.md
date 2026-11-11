# Landing: rolagem, profundidade e o pico

Escopo: `frontend/src/app/(marketing)/landing/`. Implementado em 11/11/2026 com o método da skill `scroll-craft` (pacote `scrollcraft.zip`, revisão `0b81622`): brief, gramática, curva de sensação, um pico, um movimento-assinatura, piso de gosto e verificação por rolagem. Conteúdo, preços, FAQ, SEO e checkout não mudaram.

## Brief

**Autoral, sob delegação criativa explícita.** O pedido foi "melhorar a landing com o que a skill tiver de melhor em design, cores e principalmente animações"; não houve entrevista. As decisões abaixo são do autor da mudança, apoiadas no que a página e os docs já diziam.

| Tópico | Decisão | Base |
| --- | --- | --- |
| Clima | Preciso, calmo, de produto; prova de verdade, sem ilustração | `docs/design-system.md` (Landing) e direção Apple/iOS do app |
| Jornada | Reconhecer o problema → usar grátis → testar → entender o ciclo → Aurora → modos → quem fez → planos → dúvidas → agir | Ordem que a página já tinha, com o ciclo antes da Aurora |
| Energia | Calma na leitura; um único trecho intenso (o ciclo) | Página de conversão, público sob pressão de prova |
| Sensação e momento | "Vi a prova virar o meu diagnóstico" | Promessa do H1 |
| O que só este site faz | As 20 respostas de um treino viram, na rolagem, as barras por tema e o ponto da curva de evolução | Tese do produto: cada simulado vira o próximo treino |
| Distância do minimal | Fica perto: cores da marca, uma seção navy | Marca existente |
| Mundo contínuo ou cenas | Cenas distintas | É uma página de produto com âncoras |
| Assets | Só o que já existia: prévias em HTML com conteúdo do acervo, lâmina e foto do fundador. Nada gerado | Regra "mostrar o produto, não ilustrá-lo" |

Quem é: estudante de medicina da rede Afya, em boa parte no iPhone. O que deve acreditar ao fim: "o BoraMed me mostra onde perco pontos antes da prova". Ação única: **Começar grátis**.

Frase de contar para alguém: *é o site em que você vai rolando e vê uma prova de 20 questões ser respondida, corrigida e virar o seu diagnóstico por tema.*

## Gramática

**Demonstração guiada** (gramática nova, não uma das oito da skill). Cada seção é uma superfície do produto num estado, operável pelo visitante ou pela rolagem; a ordem segue o ciclo de uso; a barra de navegação é convencional porque a página precisa de âncoras e CTA; o fechamento devolve ao visitante o que ele fez na demo.

Proibições: vídeo ou fotografia de fundo (`scrub`), atos presos de texto cruzando, trilho lateral (`pan`), mais de um ato preso, número que não exista no produto, superfície que não use conteúdo do acervo ou exemplo rotulado, ilustração decorativa.

Por que não as oito: *filmic*, *continuous world* e *cutlist* pedem footage e um mundo que a marca não tem; *editorial* e *poster* tirariam as prévias operáveis, que são o argumento; *gallery* não tem tese; *split stage* só cobriria um trecho; *live surface* é a mais próxima, mas proíbe barra, título e CTA, e a página é de conversão com planos e FAQ.

## Curva de sensação e pico

| # | Seção | Sensação | O que causa |
| --- | --- | --- | --- |
| 1 | Hero | Reconhecimento | A alternativa é marcada, o grifo passa em "antes da prova." e o diagnóstico sobe sobre a questão |
| 2 | Fatos | Segurança | Quatro fatos verificáveis; os números sobem ao aparecer |
| 3 | Gabaritos | Utilidade | O gabarito se preenche; painel e card em planos diferentes |
| 4 | Demo | Desafio | Três questões reais, respondíveis. Seção parada de propósito: é o silêncio antes do pico |
| 5 | Como funciona | **Clareza (pico)** | A página escurece e fica presa; as 20 células viram barras e depois o ponto do gráfico |
| 6 | Aurora | Encanto | O gradiente da marca abre em círculo sobre o navy; a correção se escreve |
| 7 | Quatro formas | Amplitude | Quatro pedaços do produto entram em sequência |
| 8 | Quem fez | Confiança | Foto real, história curta, duas falas |
| 9 | Planos | Cálculo | Informação, sem enfeite |
| 10 | Dúvidas | Tranquilidade | Informação, sem enfeite |
| 11 | Fechamento | Resolução | O mini-diagnóstico da demo reaparece; a frase muda se o visitante respondeu |

O pico é a seção 5: é o único ato preso (3,6 viewports), a maior mudança visual da página e a única seção navy além do fechamento.

## Partitura

| Seção | Dispositivo | Por quê |
| --- | --- | --- |
| Hero | Planos (`parallax`) + ponteiro | Profundidade por diferença de movimento, sem prender a rolagem logo na chegada |
| Fatos | Contador de entrada | Só números reais: 5.000+, 8º, 100 |
| Gabaritos | Entrada + planos | Painel mais lento que o card |
| Demo | Fluxo | É uma ferramenta; não se anima |
| Como funciona | `pin` + movimento-assinatura | O argumento precisa de tempo e de um quadro parado |
| Aurora | `reveal` em íris | Mudança de estado: do navy para a cor da marca |
| Quatro formas, Quem fez | Entrada escalonada | Seções comuns, bem feitas |
| Planos, Dúvidas | Entrada curta | Parte administrativa, comprimida |
| Fechamento | Fluxo com estado do visitante | Termina num quadro parado, com conteúdo |

Famílias: planos, contador, íris, ato preso, entrada, ponteiro. Planos e Dúvidas ficam juntas no mesmo dispositivo por serem as duas seções administrativas.

**Movimento-assinatura: as respostas viram diagnóstico.** São sempre as mesmas 20 células. No cartão-resposta elas são marcadas e corrigidas; depois voam para as barras por tema, em que cada célula é um segmento (verdes na frente, vermelhas no fim); por último convergem no ponto final da curva de evolução, que se desenha. O exemplo fecha as contas: 14 de 20, Anatomia 3 de 7, Cardiovascular 5 de 6, Farmacologia 6 de 7, 6 questões no Caderno de Erros. A hero usa os mesmos percentuais.

Registro de impressão digital (primeira linha do projeto, nada a comparar):

| Gramática | Navegação | Hero | Sequência | Fechamento | Assinatura |
| --- | --- | --- | --- | --- | --- |
| Demonstração guiada | Barra fixa com âncoras e CTA | Cena em planos, sem prender | 11 seções, 1 ato preso, 14 viewports no desktop | Mini-diagnóstico do visitante ao lado do CTA | Células da prova viram barras e ponto do gráfico |

## Como foi construído

- **Runtime** (`landing-scroll.service.ts`): o contrato `data-sc-*` da skill reescrito para Angular. O motor original é um script global sem desmontagem e esconde conteúdo por CSS incondicional; a landing é rota de SPA com SSR, então o runtime monta depois do primeiro render, roda fora da zona, mede de novo quando a altura da página muda e devolve tudo no destroy. Só o que está abaixo da dobra recebe o estado escondido, aplicado pelo próprio runtime: sem JS a página fica completa.
- **Pico** (`landing-ciclo.component.*`): uma função `render(p)` desenha a cena para qualquer ponto da história. Preso, `p` vem da rolagem; solto, vem do clique nas abas.
- **Fechamento**: `LandingDemoResult` leva o andamento da demo até o fim da página.
- **Hero**: o destaque do H1 deixou de ser texto em degradê e passou a ser texto no azul da marca com grifo de marca-texto.

### Movimento reduzido e telas baixas

Com "reduzir movimento" o runtime não monta: nada fica preso, nada entra animado, a hero chega pronta e "Como funciona" funciona por abas com troca imediata. O mesmo modo de abas vale para viewport com menos de 620px de altura, em que a cena não caberia presa.

Para revisar o movimento numa máquina que reporta "reduzir movimento" (o caso do ambiente de dev): `http://localhost:4200/?motion=full`. Só existe em modo de desenvolvimento.

## Evidência e reprodução

```bash
cd frontend
ng serve
node tests/screenshots/landing-rolagem.mjs
```

Saída local, ignorada pelo Git: `frontend/tests/screenshots/out/landing/` com `landing-desktop.webm`, `landing-celular.webm`, seis quadros do pico por dispositivo e, em `antes/`, a página inteira antes da mudança.

Verificado em 11/11/2026:

- Harness da skill (`shoot.mjs`, Chrome instalado) em 1440×900 e 390×844: atos `flow > flow > pin > flow`, sem rolagem morta, sem erro de console, sem requisição falha. No modo de movimento reduzido o harness não se aplica (espera um runtime que, por decisão, não monta); esse modo foi conferido à parte.
- Ato preso cabendo na tela em 390×664, 375×629, 360×640, 820×1180, 1280×620, 1440×900 e 1920×1080; em 360×560 cai para abas. Sem rolagem horizontal em nenhum.
- Demo respondida muda o fechamento ("Seu diagnóstico já começou.", 2 de 3, tema a revisar). Abas presas rolam até a etapa. Âncoras do menu. Sair para `/login` e voltar remonta sem resíduo.
- Build de produção com prerender, 1.004 testes unitários e os dois testes E2E da seção de planos.

Leitura a frio das folhas de contato contra a curva: bateu, com três correções no caminho. A faixa de fatos mostrava um bloco cinza enquanto esperava (o fundo da lista aparecia sem os itens); as etapas do desktop se sobrepunham no modo preso; o título do fechamento quebrava em quatro linhas ao lado do mini-diagnóstico.

Não verificado: Safari em iPhone real (sticky, `svh` e barra de endereço só foram emulados), fluidez em aparelho modesto, LCP e CLS medidos em produção.
