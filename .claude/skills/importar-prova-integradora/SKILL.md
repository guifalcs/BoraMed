---
name: importar-prova-integradora
description: Use ao importar uma prova Integradora (N1+N2 por período) para o acervo — chega como relatório de devolutiva da AFYA em PDF de texto, uma questão por seção com enunciado, alternativas marcadas (CORRETA), resposta comentada e referências. Ativa ao mencionar importar Integradora, relatório de devolutiva, PDF de prova com camada de texto, "Nª QUESTÃO" / "Resposta comentada". NÃO use para TPI (essa é digitalizada — skill importar-prova-scan) nem para questões autorais.
---

# Importar prova Integradora (relatório de devolutiva)

Pipeline para a **Integradora**, que chega como **relatório de devolutiva gerado**:
PDF com camada de texto em 100% das páginas, uma seção por questão, resposta certa
marcada em linha.

**Nenhuma etapa envolve IA e o custo em tokens é zero.** Enunciado, alternativas,
gabarito, explicação, referências e classificação saem por regex do próprio PDF. Se
um campo sair errado, é bug — não alucinação. Não despache subagente para
transcrever nada aqui: transcrever à mão o que `pdftotext` já entrega exato só
introduz erro.

## Escopo — quando NÃO usar

| tipo de prova | como entra |
| --- | --- |
| **Integradora** (relatório de devolutiva, texto) | este pipeline |
| **TPI** (scan + folha de gabarito + devolutiva) | skill `importar-prova-scan` |
| Treinos Nacionais, Simulados Processuais, Laboratório | autorais, direto em `/admin/questoes` |

`extrair.mjs` sai com **exit 1** se achar página sem camada de texto — isso quer
dizer prova digitalizada, e aí é o outro pipeline.

## O que o usuário recebe no fim

Duas coisas, e as duas são obrigatórias no fechamento:

1. **`saida/prova.md`** — para colar em `/admin/importar` → aba Questões.
2. **A lista de questões com imagem**, cada uma com **um trecho do enunciado para
   buscar** no `/admin/questoes`, porque a figura tem que ser anexada à mão.

A figura pode ou não ter sobrevivido no PDF, e isso muda o entregável: quando
sobreviveu, `extrair-imagens.mjs` gera o arquivo; quando o gerador do relatório a
descartou, só o trecho de busca resta, para você achar a questão na fonte original.
Anexar a imagem é sempre manual — o markdown do admin não a transporta.

## Etapas

Todos os comandos a partir da raiz do projeto. `$T` é o diretório de trabalho que
`extrair.mjs` imprime.

### 1. Extrair

```bash
node scripts/importar-prova-integradora/extrair.mjs "<prova>.pdf"
```

Falha com exit 1 se houver página sem texto, lacuna na numeração das questões, ou
**questão sem enunciado ou sem alternativas** — esse último é o bloqueio que
importa: campo obrigatório vazio significa que o autômato de rótulos pulou uma
seção, e perda silenciosa é o pior modo de falha. Não siga com exit 1.

Confira a amostra de Q1 que o script imprime: se `fonte_original`, apoio, pergunta,
alternativas e gabarito estiverem coerentes, o parser está alinhado com este PDF.

### 2. Validar

```bash
node scripts/importar-prova-integradora/validar.mjs $T
```

Quatro crivos por questão. O que dá força ao pipeline é o **crivo 2**: a marcação
`(CORRETA)` é metadado da questão e a resposta comentada é prosa de quem escreveu —
duas fontes independentes dentro do mesmo PDF.

Leia a **tabela de cobertura** em `relatorio-validacao.md` e não trate "sem flag"
como "verificado a fundo": `sem_eco` quer dizer confirmação ausente, não erro
detectado. Ao repassar o resultado, diga quantas questões ficaram em cada nível.

Exit 1 com qualquer flag alta pendente.

### 3. Revisar o que foi sinalizado (só se houver flag)

```bash
node scripts/importar-prova-integradora/revisar.mjs $T
```

Escreve `$T/questoes-revisadas.json` já preenchido com as questões sinalizadas.
Peça ao usuário para conferir contra as páginas do PDF indicadas em
`_paginas_do_pdf`, corrigir o texto e trocar `"revisado": false` por `true`. Depois
rode `validar.mjs` e `gerar.mjs` de novo.

Correção **nunca** vai em `validacao.json`. `gerar.mjs` mescla campo a campo, então
a revisão sobrevive a um novo `validar.mjs`.

### 4. Gerar o markdown

```bash
node scripts/importar-prova-integradora/gerar.mjs $T \
  --fonte "Integradora 4 (2025.2)" --tipo nacional
```

`--tipo` é sempre `nacional`: o parser do admin só aceita
`nacional | processual | laboratorio`, e "Integradora" é **subtipo de prova**, que
se resolve depois em `/admin/provas`.

Sai em `$T/saida/`: `prova.md` (tudo) + `parte-NN.md` (lotes de 25) +
`PENDENCIAS.md`.

Se o resumo marcar alguma questão com **ESTÁ NO PDF**, rode em seguida:

```bash
node scripts/importar-prova-integradora/extrair-imagens.mjs $T
```

Escreve `saida/imagens/qNNN-N.jpg`. Rode **depois** do `gerar.mjs`, nunca antes.

Questão com flag alta não resolvida fica **fora** do markdown e é listada em
`PENDENCIAS.md`. Não use `--incluir-alta` sem ter olhado cada uma.

### 5. Round-trip — obrigatório antes de colar

```bash
node scripts/importar-prova-integradora/verificar-roundtrip.mjs $T
```

Roda o `parseBlocos()` **de verdade** do `admin-importar.component.ts` contra o
markdown e confere campo por campo. Exit 1 significa não colar.

### 6. Reportar o trabalho manual — obrigatório

`gerar.mjs` termina imprimindo o bloco `INSERIR MANUALMENTE DEPOIS DE IMPORTAR`.

**Repasse essa lista ao usuário questão por questão, com o trecho de busca.** Não
basta dizer "veja PENDENCIAS.md": sem o número da questão e o trecho para pesquisar,
a prova entra com figura faltando e ninguém percebe.

Diga também, sempre:

- `/admin/importar` **não** liga questão a prova — depois de importar, criar a prova
  em `/admin/provas` com subtipo **Integradora** e vincular as questões;
- `DISCIPLINA`/`TEMA` saem vazios de propósito; `classificacao-sugerida.csv` traz
  Área, Subárea, Semana e Módulo de cada questão.

### 7. Limpar

```bash
node scripts/importar-prova-integradora/limpar.mjs $T --raiz
```

`--raiz` recolhe para `$T` o PDF de entrada que ficou solto na raiz do projeto.
Feche confirmando `git status --short` limpo.

Use `--tudo` quando a prova já estiver importada e conferida no admin.

## Imagem e tabela: sinalizar, nunca converter

A regra que o usuário pediu, e ela é a mesma nos dois casos: **o que não couber no
markdown do admin não é achatado em texto — é sinalizado.**

- **Imagem** — pode ou não estar no PDF, e o relatório diz qual é o caso. Quando o
  raster sobreviveu, `extrair-imagens.mjs` gera o arquivo (questão 28 da 2025.1:
  dois gráficos de crescimento da OMS na página 67). Quando o gerador do relatório
  descartou a figura, ela não está no PDF e precisa vir da fonte original (foi o
  caso de toda a 2025.2). Detecção por raster embutido e por menção com dêixis no
  enunciado ("observe a imagem abaixo", "a radiografia a seguir"). O
  relatório mostra a **frase que disparou**, porque nenhum regex distingue com
  certeza `"a radiografia a seguir"` (figura) de `"a ultrassonografia revelou imagem
  hiperecogênica de 8 mm"` (achado escrito). Trate a lista como candidatas a
  conferir, não como fato — e diga isso ao usuário.
- **Tabela** — o bloco de colunas alinhadas é substituído por
  `[TABELA DA PROVA — não convertida em texto; inserir manualmente]` na posição em
  que estava, e o conteúdo removido fica em `PENDENCIAS.md` para remontar a grade.

`quadro` está fora do detector de imagem de propósito: em texto médico "quadro
clínico" é o caso do paciente, e dava dezenas de falsos positivos por prova.

## Invariantes — não negocie

- **O gabarito vem da marcação `(CORRETA)`.** O comentário **confere** o gabarito;
  não o define.
- **Campo obrigatório vazio é bloqueio.** É como a questão 7 da prova de calibração
  perdeu as quatro alternativas em silêncio, antes de os rótulos passarem a casar
  com sensibilidade à caixa.
- **Nada de IA nesta prova.** É PDF de texto: `pdftotext` extrai exato. (O único uso
  de OCR é desempatar de qual questão é uma imagem em página compartilhada, dentro do
  `extrair-imagens.mjs`.)
- **Alternativa de 4 caracteres ou menos é bloqueio.** Na questão 21 da 2024.2 a
  alternativa C do PDF é literalmente `x`, erro da questão original. A resposta
  comentada costuma revelar qual era — corrija em `questoes-revisadas.json` citando a
  evidência, nunca invente.
- **Nunca edite `validacao.json` à mão.**
- **Exit 1 é bloqueio, não aviso.**

## Camada de texto pode estar corrompida

PDF gerado não garante texto confiável. A prova de calibração trouxe um parágrafo
com `regiã o`, `epigá strica`, `vô mitos` e `dnáuseasas` — espaço espúrio dentro da
palavra, e num caso caractere perdido de verdade.

O pipeline repara só o inequívoco (ligadura, acento decomposto, espaço antes de
marca combinante, `ı` acentuado) e **sinaliza como flag alta** o que sobra,
mantendo a questão fora do markdown até revisão. Se aparecer
`texto_corrompido`, mande o usuário olhar as páginas indicadas: não há reparo
mecânico para caractere perdido.

## Limites de escopo

Calibrado em **três** provas: Integradora 4 de 2025.2 (96 páginas), 2025.1 (128) e
2024.2 (76). Nenhuma tinha tabela como texto, então o caminho de substituição por
placeholder tem cobertura só por teste unitário — numa Integradora com tabela de
verdade, confira o primeiro resultado antes de confiar.

**Cada edição nova exigiu ajuste do parser**, então conte com isso: a 2025.1 trouxe
origem em caixa mista, outro vocabulário de rótulo, comentário em seções, `[IES]`
duplicado e figura embutida; a 2024.2 trouxe marca d'água na margem do rótulo,
alternativa degenerada (`x`), tabela como imagem e imagem em página dividida. Rode
`testar.mjs` depois de qualquer mexida no parser — cada teste lá é um defeito que já
passou em silêncio uma vez.

A força do cruzamento também varia entre edições (27 gabaritos confirmados na 2025.2,
19 na 2025.1, 12 na 2024.2), porque depende de a devolutiva citar as alternativas em
vez de parafraseá-las. Diga o número ao usuário em vez de deixar implícito que as 50
foram conferidas a fundo.

Detalhe de cada crivo, dos limiares e dos pontos cegos em
`scripts/importar-prova-integradora/README.md`. Testes: `node
scripts/importar-prova-integradora/testar.mjs`.
