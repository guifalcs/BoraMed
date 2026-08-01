---
name: importar-prova-devolutiva
description: Use ao importar para o acervo qualquer prova que chegue como relatório de devolutiva da AFYA em PDF de texto — Integradora, SOI, HAM, N1/N2 específica. Uma seção por questão, com enunciado, alternativas marcadas (CORRETA) ou "Alternativas: --" nas discursivas, resposta comentada e referências. Ativa ao mencionar importar Integradora/SOI/HAM, relatório de devolutiva, PDF de prova com camada de texto, "Nª QUESTÃO" / "Resposta comentada". NÃO use para TPI (essa é digitalizada — skill importar-prova-scan) nem para questões autorais.
---

# Importar prova pelo relatório de devolutiva

Pipeline para qualquer prova da AFYA que chegue como **relatório de devolutiva
gerado**: PDF com camada de texto em 100% das páginas, uma seção por questão,
resposta certa marcada em linha.

O que o pipeline entende é o **relatório**, não a disciplina. Integradora, SOI e
HAM usam o mesmo gerador; o que muda entre elas está tratado:

| varia entre provas | como o pipeline lida |
| --- | --- |
| título da prova | posicional — o que está solto acima de "RELATÓRIO DE DEVOLUTIVA DE PROVA" |
| bloco "Filtros da questão" | só a Integradora traz; sem ele, não sai `classificacao-sugerida.csv` |
| questões discursivas | SOI e HAM trazem duas por prova; viram `FORMATO: aberta` |
| marcador `Nª QUESTÃO` | pode dividir a linha com `Enunciado:` ou `Feedback:` |
| origem `(AFYA Bragança)` | caixa mista, sem `[IES]` para confirmar |

**Nenhuma etapa envolve IA e o custo em tokens é zero.** Enunciado, alternativas,
gabarito, resposta modelo, explicação e referências saem por regex do próprio
PDF. Se um campo sair errado, é bug — não alucinação. Não despache subagente para
transcrever nada aqui: transcrever à mão o que `pdftotext` já entrega exato só
introduz erro.

## Escopo — quando NÃO usar

| tipo de prova | como entra |
| --- | --- |
| Integradora, SOI, HAM (relatório de devolutiva, texto) | este pipeline |
| **TPI** (scan + folha de gabarito + devolutiva) | skill `importar-prova-scan` |
| Treinos Nacionais, Simulados Processuais, Laboratório | autorais, direto em `/admin/questoes` |

`extrair.mjs` sai com **exit 1** se achar página sem camada de texto — isso quer
dizer prova digitalizada, e aí é o outro pipeline.

## Fechada e discursiva na mesma prova

As provas de SOI e HAM misturam os dois formatos, e a diferença atravessa o
pipeline inteiro:

|  | fechada | discursiva |
| --- | --- | --- |
| como o relatório marca | `(alternativa D) (CORRETA)` | `Alternativas:` seguido de `--` |
| gabarito | a letra marcada | a resposta comentada |
| vai para o admin como | `ALTERNATIVAS` + `GABARITO` | `FORMATO: aberta` + `RESPOSTA_MODELO` |
| conferência | crivo 2 — `(CORRETA)` × comentário | crivo da discursiva — chave presente e cobrindo os itens |

`RESPOSTA_MODELO` é o gabarito que o aluno vê e a referência que a **Aurora** usa
para corrigir. `PONTOS_CHAVE` e `CRITERIOS` saem vazios de propósito: o relatório
não os traz, e destilá-los do texto seria inventar rubrica que ninguém escreveu.
Diga isso ao usuário — em questão que for entrar em simulado corrigido, vale
preencher à mão em `/admin/questoes`.

**Um terceiro formato existe e é bloqueio:** `indefinido`, quando o campo
`Alternativas:` tem texto e nenhuma `(alternativa X)` foi reconhecida. Não é
discursiva — é o autômato de rótulos tendo comido o campo. Nunca libere.

## O que o usuário recebe no fim

1. **`saida/prova.md`** — para colar em `/admin/importar` → aba Questões.
2. **A lista de questões com imagem**, cada uma com **um trecho do enunciado para
   buscar** no `/admin/questoes`, porque a figura tem que ser anexada à mão.
3. **A lista de discursivas**, para o passe manual de `PONTOS_CHAVE`.

A figura pode ou não ter sobrevivido no PDF, e isso muda o entregável: quando
sobreviveu, `extrair-imagens.mjs` gera o arquivo; quando o gerador do relatório a
descartou, só o trecho de busca resta. Anexar a imagem é sempre manual — o
markdown do admin não a transporta.

## Etapas

Todos os comandos a partir da raiz do projeto. `$T` é o diretório de trabalho que
`extrair.mjs` imprime.

### 1. Extrair

```bash
node scripts/importar-prova-devolutiva/extrair.mjs "<prova>.pdf"
```

Falha com exit 1 se houver página sem texto, layout de duas colunas, lacuna na
numeração das questões, ou **campo obrigatório vazio** — e o obrigatório depende
do formato: enunciado sempre; alternativas na fechada; resposta comentada na
discursiva. Campo vazio significa que o autômato de rótulos pulou uma seção, e
perda silenciosa é o pior modo de falha. Não siga com exit 1.

Confira a amostra que o script imprime (uma fechada e uma discursiva): se
`fonte_original`, apoio, pergunta, alternativas/resposta modelo e gabarito
estiverem coerentes, o parser está alinhado com este PDF.

### 2. Validar

```bash
node scripts/importar-prova-devolutiva/validar.mjs $T
```

Crivos por questão, e o que dá força ao pipeline nas fechadas é o **crivo 2**: a
marcação `(CORRETA)` é metadado da questão e a resposta comentada é prosa de quem
escreveu — duas fontes independentes dentro do mesmo PDF. Nas discursivas ele não
se aplica (`nao_se_aplica`), e quem confere é o crivo da discursiva.

Leia a **tabela de cobertura** em `relatorio-validacao.md` e não trate "sem flag"
como "verificado a fundo": `sem_eco` quer dizer confirmação ausente, não erro
detectado. Ao repassar o resultado, diga quantas questões ficaram em cada nível.

Exit 1 com qualquer flag alta pendente.

### 3. Revisar o que foi sinalizado (só se houver flag)

```bash
node scripts/importar-prova-devolutiva/revisar.mjs $T
```

Escreve `$T/questoes-revisadas.json` já preenchido com as questões sinalizadas.
Peça ao usuário para conferir contra as páginas do PDF indicadas em
`_paginas_do_pdf`, corrigir o texto e trocar `"revisado": false` por `true`.
Depois rode `validar.mjs` e `gerar.mjs` de novo.

Correção **nunca** vai em `validacao.json`. `gerar.mjs` mescla campo a campo, então
a revisão sobrevive a um novo `validar.mjs`.

### 4. Gerar o markdown

```bash
node scripts/importar-prova-devolutiva/gerar.mjs $T \
  --fonte "SOI 4 (2025.2)" --subtipo SOI --tipo nacional
```

`--fonte` sai do nome do PDF quando omitido. `--subtipo` é o subtipo que a prova
vai ter em `/admin/provas` (SOI, HAM, Integradora) e só aparece no texto de
pendências. `--tipo` é sempre `nacional`: o parser do admin só aceita
`nacional | processual | laboratorio`, e a disciplina se resolve depois.

Sai em `$T/saida/`: `prova.md` (tudo) + `parte-NN.md` (lotes de 25) +
`PENDENCIAS.md`.

Se o resumo marcar alguma questão com **ESTÁ NO PDF**, rode em seguida:

```bash
node scripts/importar-prova-devolutiva/extrair-imagens.mjs $T
```

Questão com flag alta não resolvida fica **fora** do markdown e é listada em
`PENDENCIAS.md`. Não use `--incluir-alta` sem ter olhado cada uma.

### 5. Round-trip — obrigatório antes de colar

```bash
node scripts/importar-prova-devolutiva/verificar-roundtrip.mjs $T
```

Roda o `parseBlocos()` **de verdade** do `admin-importar.component.ts` contra o
markdown e confere campo por campo — inclusive que a discursiva chega como
`resposta_aberta_curta` com a resposta modelo intacta. Exit 1 significa não colar.

### 6. Reportar o trabalho manual — obrigatório

`gerar.mjs` termina imprimindo o bloco `INSERIR MANUALMENTE DEPOIS DE IMPORTAR`.

**Repasse essa lista ao usuário questão por questão, com o trecho de busca.** Não
basta dizer "veja PENDENCIAS.md": sem o número da questão e o trecho para
pesquisar, a prova entra com figura faltando e ninguém percebe.

Diga também, sempre:

- `/admin/importar` **não** liga questão a prova — depois de importar, criar a
  prova em `/admin/provas` com o subtipo certo e vincular as questões;
- `DISCIPLINA`/`TEMA` saem vazios de propósito;
- quantas discursivas entraram e que elas estão sem `PONTOS_CHAVE`.

### 7. Limpar

```bash
node scripts/importar-prova-devolutiva/limpar.mjs $T --raiz
```

`--raiz` recolhe para `$T` o PDF de entrada que ficou solto na raiz do projeto.
Feche confirmando `git status --short` limpo.

Use `--tudo` quando a prova já estiver importada e conferida no admin.

## Imagem e tabela: sinalizar, nunca converter

**O que não couber no markdown do admin não é achatado em texto — é sinalizado.**

- **Imagem** — pode ou não estar no PDF, e o relatório diz qual é o caso.
  Detecção por raster embutido (`pdfimages`) e por menção com dêixis no enunciado
  ("observe a imagem abaixo", "a figura abaixo ilustra o ciclo de vida"). O
  relatório mostra a **frase que disparou**, porque nenhum regex distingue com
  certeza `"a radiografia a seguir"` (figura) de `"a ultrassonografia revelou
  imagem hiperecogênica de 8 mm"` (achado escrito). Trate a lista como candidatas
  a conferir, e diga isso ao usuário.
- **Tabela** — o bloco de colunas alinhadas é substituído por
  `[TABELA DA PROVA — não convertida em texto; inserir manualmente]` na posição em
  que estava, e o conteúdo removido fica em `PENDENCIAS.md`.

`quadro` está fora do detector de imagem de propósito: em texto médico "quadro
clínico" é o caso do paciente, e dava dezenas de falsos positivos por prova.

**`pdfimages` é opcional.** Sem ele no PATH (é o caso do poppler avulso do Git for
Windows), o pipeline segue com aviso e perde só o sinal de raster embutido. Se o
usuário for anexar figuras, vale instalar o poppler completo antes.

## Invariantes — não negocie

- **O gabarito da fechada vem da marcação `(CORRETA)`.** O comentário **confere**
  o gabarito; não o define.
- **O gabarito da discursiva é a resposta comentada**, importada como
  `RESPOSTA_MODELO`. Discursiva sem ela é bloqueio, não questão pela metade.
- **Campo obrigatório vazio é bloqueio.**
- **`formato: indefinido` nunca é discursiva.** É bug de parsing.
- **Nada de IA nesta prova.** É PDF de texto: `pdftotext` extrai exato. (O único
  uso de OCR é desempatar de qual questão é uma imagem em página compartilhada,
  dentro do `extrair-imagens.mjs`.)
- **Alternativa de 4 caracteres ou menos é bloqueio.** Na questão 21 da
  Integradora 2024.2 a alternativa C do PDF é literalmente `x`, erro da questão
  original. A resposta comentada costuma revelar qual era — corrija em
  `questoes-revisadas.json` citando a evidência, nunca invente.
- **Nunca edite `validacao.json` à mão.**
- **Exit 1 é bloqueio, não aviso.**

## Camada de texto pode estar corrompida

PDF gerado não garante texto confiável. Uma prova de calibração trouxe um
parágrafo com `regiã o`, `epigá strica`, `vô mitos` e `dnáuseasas` — espaço
espúrio dentro da palavra, e num caso caractere perdido de verdade.

O pipeline repara só o inequívoco (ligadura, acento decomposto, espaço antes de
marca combinante, `ı` acentuado) e **sinaliza como flag alta** o que sobra,
mantendo a questão fora do markdown até revisão. Se aparecer `texto_corrompido`,
mande o usuário olhar as páginas indicadas: não há reparo mecânico para caractere
perdido.

## Limites de escopo

Calibrado em **13 provas**: Integradora 4/8 (2024.2, 2025.1, 2025.2), SOI IV
(2022.2, 2023.1, 2023.2, 2024.2, 2025.1, 2025.2) e HAM IV (2022.2, 2023.2,
2024.2, 2025.2). Das treze, **onze rodam ponta a ponta**.

**As duas de 2022.2 não passam, por decisão**: aquele relatório vem em **duas
colunas** — rótulos empilhados à esquerda, texto todo à direita —, e ali
`Alternativas:` aparece na altura da segunda linha do enunciado. O parser detecta
esse layout e bloqueia com essa mensagem, em vez de importar meio enunciado como
alternativa. Prova de 2022.2 entra à mão pelo `/admin/questoes`.

**Cada edição nova exigiu ajuste do parser**, então conte com isso. Rode
`testar.mjs` depois de qualquer mexida — cada teste lá é um defeito que já passou
em silêncio uma vez.

A força do cruzamento varia entre edições, porque depende de a devolutiva citar
as alternativas em vez de parafraseá-las. Diga o número ao usuário em vez de
deixar implícito que todas foram conferidas a fundo.

Detalhe de cada crivo, dos limiares e dos pontos cegos em
`scripts/importar-prova-devolutiva/README.md`. Testes: `node
scripts/importar-prova-devolutiva/testar.mjs`.
