# Importação de prova pelo relatório de devolutiva (AFYA)

Pipeline para qualquer prova que chegue como **relatório de devolutiva gerado** —
PDF com camada de texto em 100% das páginas, uma questão por vez, com enunciado,
alternativas, resposta comentada e referências.

O que o pipeline entende é o **formato do relatório**, não a disciplina:
Integradora, SOI e HAM saem do mesmo gerador. O que varia entre elas está tratado
em um lugar só e listado em [Variação entre provas](#variação-entre-provas).

**Nenhuma etapa envolve IA.** Enunciado, alternativas, gabarito, resposta modelo,
explicação, referências e classificação saem por regex do próprio PDF. Se algum
campo sair errado, é bug — não alucinação. Custo em tokens: zero.

Uso guiado: skill `importar-prova-devolutiva`
(`.claude/skills/importar-prova-devolutiva/`).

## Escopo — o que este pipeline não é

| tipo de prova | como entra |
| --- | --- |
| **Integradora, SOI, HAM** (relatório de devolutiva, texto) | este pipeline |
| **TPI** (PDF digitalizado: scan + gabarito + devolutiva) | `importar-prova-scan` — precisa de IA para ler a foto |
| Treinos Nacionais, Simulados Processuais, Laboratório | autorais, direto em `/admin/questoes` |

A diferença que importa: na TPI o gabarito vem de uma folha separada e as
marcações à mão do aluno erram. Aqui a resposta certa vem marcada em linha, no
metadado da própria questão:

```
(alternativa C) (CORRETA)
```

`extrair.mjs` sai com **exit 1** se o PDF tiver página sem camada de texto, em vez
de tentar adivinhar — isso é sinal de que a prova é digitalizada e vai pelo outro
pipeline.

## Anatomia do relatório

Uma seção por questão, sempre nesta ordem:

| rótulo | vira |
| --- | --- |
| `Nª QUESTÃO` | separador de questão |
| `Código da questão:` | registro (não é importado) |
| `Tipo da questão:` | conferência (esperado: Múltipla Escolha) |
| `Unidade de avaliação:` | registro |
| `Enunciado:` | `ENUNCIADO_APOIO` + `ENUNCIADO` |
| `Alternativas:` | `ALTERNATIVAS` + `GABARITO` (pela marca `(CORRETA)`), ou `--` na discursiva |
| `Grau de dificuldade:` | registro |
| `Resposta comentada:` | `EXPLICACAO` na fechada, `RESPOSTA_MODELO` na discursiva |
| `Referências:` | `REFERENCIA` |
| `Feedback:` | descartado (é sempre `--`) |
| `Filtros da questão:` | `classificacao-sugerida.csv` (Área, Subárea, Semana, Módulo, IES) |

Nem todo rótulo existe em toda prova: `Código da questão`, `Tipo da questão`,
`Grau de dificuldade` e `Filtros da questão` só aparecem nas de Integradora.

Tamanhos típicos: Integradora 4 (2025.2) tem 96 páginas e 50 questões; SOI IV
(2025.2), 25 páginas e 15 questões (13 fechadas + 2 discursivas); HAM IV
(2025.2), 17 páginas e 10 questões (8 + 2).

## Variação entre provas

| varia | onde está tratado |
| --- | --- |
| título da prova (`INTEGRADORA…`, `N1 ESPECÍFICA_SOI 4…`, `Nl ESPECIFICA SOi 4…`) | `cabecalhoDaProva` — posicional: o que está solto acima de "RELATÓRIO DE DEVOLUTIVA DE PROVA" |
| marcador dividindo a linha com `Enunciado:` ou `Feedback:` | `RE_MARCADOR_QUESTAO` + `fatiarQuestoes` |
| ordinal corrompido (`12!! QUESTÃO`) | `RE_MARCADOR_QUESTAO` aceita 0–3 caracteres não alfanuméricos |
| hash de autenticação espaçado (`000072. 59001d.`) | `RE_HASH` |
| origem em caixa mista (`(AFYA Bragança)`, `(FASA Vic)`) | `separarOrigem` |
| ausência do bloco de filtros | `extrair.mjs` só emite o CSV quando há classificação |
| questões discursivas | ver [Questão discursiva](#questão-discursiva) |
| layout de duas colunas (2022.2) | `ehLayoutDeDuasColunas` — bloqueia com diagnóstico |

## Comandos

```bash
# 1. extração determinística (~2s, zero tokens)
node scripts/importar-prova-devolutiva/extrair.mjs "SOI 4 - (2025.2).pdf"
#    → imprime o diretório de trabalho ($T abaixo)

# 2. validação
node scripts/importar-prova-devolutiva/validar.mjs $T

# 3. só se houver flag: esqueleto de revisão manual
node scripts/importar-prova-devolutiva/revisar.mjs $T

# 4. markdown para /admin/importar (imprime o que exige trabalho manual)
node scripts/importar-prova-devolutiva/gerar.mjs $T --fonte "SOI 4 (2025.2)" --subtipo SOI --tipo nacional

# 5. round-trip contra o parser real do admin (obrigatório antes de colar)
node scripts/importar-prova-devolutiva/verificar-roundtrip.mjs $T

# 6. limpeza
node scripts/importar-prova-devolutiva/limpar.mjs $T --raiz

# testes do pipeline
node scripts/importar-prova-devolutiva/testar.mjs
```

Todos saem com **exit 1** quando encontram algo que exige decisão humana. Exit 1 é
bloqueio, não aviso.

## Questão discursiva

As provas de SOI e HAM trazem duas por prova; as de Integradora, nenhuma. O
relatório **não declara o formato**: a discursiva é a que emite `Alternativas:`
seguido de `--`, e a resposta esperada vem na resposta comentada.

|  | fechada | discursiva |
| --- | --- | --- |
| marca no relatório | `(alternativa D) (CORRETA)` | `Alternativas:` + `--` |
| gabarito | a letra marcada | a resposta comentada |
| markdown do admin | `ALTERNATIVAS` + `GABARITO` | `FORMATO: aberta` + `RESPOSTA_MODELO` |
| conferência | crivo 2 (`(CORRETA)` × comentário) | crivo 1b (chave presente, cobrindo os itens) |

`classificarFormato()` tem um terceiro valor, e ele é a razão de a função existir:
**`indefinido`**, quando o campo `Alternativas:` tem texto e nenhuma
`(alternativa X)` foi reconhecida. "Sem alternativa nenhuma" é exatamente o que se
vê quando o autômato de rótulos erra e come o campo — sem esse terceiro valor, uma
questão de múltipla escolha mutilada entraria no acervo como discursiva, que é
perda silenciosa disfarçada de formato. Só é discursiva quando o campo veio de
fato vazio.

`PONTOS_CHAVE` e `CRITERIOS` saem vazios: o relatório não os traz, e destilá-los
do texto seria inventar rubrica que ninguém escreveu. `PENDENCIAS.md` lista as
discursivas com trecho de busca, para o passe manual no `/admin/questoes`.

### Corte do enunciado com subitens

O enunciado da discursiva costuma terminar numa lista de comandos:

```
Um paciente, de 32 anos, sem comorbidades, apresenta febre, disúria…
Considerando o quadro clínico e laboratorial, responda às perguntas a seguir.
a) Caracterize o quadro clínico do paciente e cite o provável agente etiológico.
b) Explique os mecanismos fisiopatológicos subjacentes à infecção urinária.
c) Baseado na etiologia, descreva o tratamento farmacológico adequado.
```

Sem tratamento, o corte por parágrafo levaria **só o item `c)`** para `ENUNCIADO` e
empurraria `a)` e `b)` para o apoio: nada se perderia, mas a questão entraria no
acervo perguntando um terço do que pergunta. `cortarNosItens()` exige dois itens em
sequência alfabética fechando o enunciado — item isolado é lista dentro do caso
clínico, não comando.

## Imagem e tabela: sinalizar, nunca converter

É o motivo de este pipeline existir separado, e a regra é a mesma nos dois casos:
**o que não couber no markdown do admin não é achatado em texto — é sinalizado.**

### Imagem

Duas situações, e o relatório diz em qual cada questão está:

- **o raster sobreviveu no PDF** — `extrair-imagens.mjs` gera o arquivo em
  `saida/imagens/qNNN-N.jpg`. É o caso da questão 28 da 2025.1, cujos dois
  gráficos de crescimento da OMS estão embutidos na página 67.
- **o gerador do relatório descartou a figura** — ela não está no PDF, não há
  recorte a extrair, e a única saída é buscar na fonte original. Foi o caso de
  toda a 2025.2.

Nos dois casos o pipeline entrega **um trecho do enunciado para buscar** no
`/admin/questoes`, porque anexar a figura é sempre manual.

Dois sinais independentes:

| sinal | pega | limite |
| --- | --- | --- |
| raster embutido (`pdfimages`) | figura que sobreviveu no PDF | não pega figura descartada pelo gerador |
| menção com dêixis no enunciado | "observe a imagem abaixo", "a radiografia a seguir" | não pega figura sem menção nenhuma |

**Tabela também chega como imagem.** Na 2024.2 a questão 24 traz a *"TABELA 38-1 —
Taxas de falha dos contraceptivos"* como raster, não como texto. O detector de
tabela por colunas alinhadas corretamente não acha nada (não há texto para
alinhar) e o caminho de imagem resolve. Se uma prova sinalizar imagem numa questão
que "devia" ter tabela, é isso.

#### De quem é a imagem, quando a página é dividida

Uma questão termina no meio da página em que a seguinte começa, e o `pdfimages` não
informa a posição vertical da imagem — então a página sozinha não diz de quem ela é.
Na 2024.2 a tabela dos contraceptivos (página 36) era creditada à questão 24, que é
dela, **e** à 25, que é sobre fases do parto.

`extrair.mjs` detecta a ambiguidade sem ler a imagem (duas questões na mesma página
com raster) e emite o sinal `ATENÇÃO: a página N é dividida com a questão M`.
`extrair-imagens.mjs` desempata por **OCR**: compara o texto da imagem com o texto de
cada candidata e exige margem. Na 2024.2 deu `Q24:0.36 Q25:0.04` — decidido.

Sem `tesseract` instalado o desempate não roda: a imagem sai com nome de página
(`paginaNNN-1.jpg`) e é reportada como ambígua, em vez de ser atribuída no chute.

`quadro` está **fora** do detector de propósito: em texto médico "quadro clínico",
"quadro febril" e "esse quadro" são o caso do paciente, e apareciam dezenas de
vezes por prova. Só conta com indicação dêitica ("quadro abaixo", "quadro 2").

A dêixis é o que separa `"observe a radiografia a seguir"` (figura) de
`"a ultrassonografia revelou imagem hiperecogênica de 8 mm"` (achado narrado por
escrito, que não precisa de figura). Não é perfeito nos dois sentidos, então o
relatório **mostra a frase que disparou** em vez de só afirmar que há imagem.

### Tabela

Tabela num PDF de texto chega com a grade vetorial (invisível ao `pdftotext`) e as
células alinhadas por espaço. `gerar.mjs` **substitui o bloco** por

```
[TABELA DA PROVA — não convertida em texto; inserir manualmente]
```

na posição em que ele estava, e `PENDENCIAS.md` guarda o conteúdo removido em
bloco de código, para você remontar a grade em `/admin/questoes`. Achatar em prosa
produziria um enunciado sem sentido — é exatamente o que se quer evitar.

Exige **bloco** de 2+ linhas alinhadas: uma linha isolada com espaço largo é
justificação de texto de referência bibliográfica (`2024.   E-book.   ISBN   978…`),
não tabela.

## Os crivos

`validar.mjs` roda verificações independentes por questão. Quais rodam depende do
formato: a discursiva passa pelo crivo 1b no lugar dos crivos 1 e 2.

### 1. Estrutura (fechada)

4–5 alternativas contíguas a partir de `a`, enunciado presente, exatamente uma
`(CORRETA)`, nenhuma alternativa duplicada, gabarito apontando para alternativa que
existe.

### 1b. Discursiva

Sem `(CORRETA)` para cruzar, o peso cai todo aqui:

| flag | severidade | o que pega |
| --- | --- | --- |
| `sem_resposta_modelo` | alta | discursiva sem resposta comentada — não há gabarito para importar |
| `aberta_com_alternativas` | alta | classificada como discursiva mas com alternativa parseada (contradição interna) |
| `resposta_modelo_curta` | média | chave com menos de 120 caracteres — candidata a corte na extração |
| `item_sem_resposta` | média | o enunciado pede `a)`, `b)`, `c)` e a chave só responde parte |

`item_sem_resposta` é o cruzamento possível aqui: quando a chave responde item a
item, um item sem eco quase sempre significa resposta comentada cortada. É média
e não alta porque a chave às vezes responde em prosa corrida, sem repetir as
letras.

### 2. `(CORRETA)` × resposta comentada — o crivo de verdade

A marcação `(CORRETA)` é metadado da questão; a resposta comentada é prosa de quem
escreveu. **Duas fontes independentes dentro do mesmo PDF**, e é isso que confere
o gabarito. Quatro caminhos, em ordem de força:

| nível | como confirma |
| --- | --- |
| `forte` | o comentário julga correta exatamente a alternativa marcada, e só ela |
| `forte_por_eliminacao` | o comentário julga incorretas **todas** as outras |
| `media` | julga a marcada correta, mas também outra |
| `presenca` | o texto da marcada aparece no comentário, sem veredito legível |
| `inaplicavel` | questão de assertivas cujo comentário não julga os numerais um a um |
| `sem_eco` | o comentário não descreve as alternativas de forma reconhecível |

#### Onde o veredito é lido, e por que a posição importa

Um veredito só conta **na posição em que veredito aparece**: no começo do
parágrafo (depois de rótulo opcional), no rótulo curto anterior, no parágrafo
seguinte quando o atual é citação pura da alternativa, ou herdado do cabeçalho da
seção (`Resposta correta:` … `Por que as demais estão incorretas:`).

Ler de qualquer posição parecia funcionar e produzia **acusação falsa**, que é o
pior defeito possível num crivo de gabarito — três casos reais da 2025.1:

| o que acontecia | por que |
| --- | --- |
| `"A assertiva I é verdadeira e a II é falsa."` acusada de incorreta | "falsa" é o texto **da própria alternativa**, não julgamento sobre ela |
| `"Erro: Embora … estejam corretos, o Albendazol …"` lida como correta | "corretos" está em oração concessiva; o veredito é o `Erro:` inicial |
| `"Hepatite viral tipo A aguda"` casada com o parágrafo da tipo B | a letra que discrimina é curta demais para virar token, os bigramas ficam idênticos e os parágrafos empatam |

Daí duas regras: o veredito é lido só de posição de veredito, e **empate sem
margem não decide nada** (`MARGEM_MINIMA`). Alternativa que empata fica marcada
`empate` no `validacao.json` em vez de gerar flag.

A eliminação existe porque é o caso mais comum: a justificativa da correta
**parafraseia** em vez de transcrever ("Correta. O caso é típico de
Glomerulonefrite Pós-Estreptocócica…"), então a correta não tem eco textual, mas as
três outras são explicitamente chamadas de incorretas. Sem essa regra, metade da
prova ficaria em `sem_eco`.

`sem_eco` **não é erro detectado, é confirmação ausente** — e a diferença entre as
duas coisas é o que impede o relatório de mentir. Leia a tabela de cobertura em vez
de tratar "sem flag" como "verificado a fundo".

### 2b. Questões de assertivas — o crivo mais forte

Quando **todas** as alternativas são combinações de numerais romanos (`I, apenas.`,
`III e IV.`), a similaridade de texto é inaplicável: não há token com poder
discriminativo. No pipeline do TPI isso virava `cruzamento_inaplicavel` e a questão
ficava sem conferência de gabarito nenhuma.

Aqui dá para fazer melhor. O comentário julga cada numeral:

```
Assertiva I: Correta. O Sinal de Murphy indica colecistite aguda.
Assertiva IV: Incorreta. Diverticulite não é o diagnóstico provável.
```

O crivo monta o conjunto dos corretos (`{I, II, III}`) e acha a alternativa que
reproduz exatamente esse conjunto. Comparar conjunto contra conjunto não depende de
similaridade nenhuma — é o crivo mais forte do pipeline.

Cobre as duas formas de veredito vistas: na mesma linha (`Assertiva I: Correta.`) e
no parágrafo seguinte (`Afirmativa I: Trata-se de… / Essa afirmativa está correta`).

### 3. Estrutura degenerada

Alternativa com 4 caracteres ou menos é **bloqueio**. Não é rigor gratuito: na
questão 21 da 2024.2 a alternativa C do PDF é literalmente `x` — erro de digitação
da questão original da AFYA, não da extração. `x` não pode entrar no acervo como
alternativa.

O limiar é baixo de propósito. Resposta de uma palavra é normal em prova médica
(`Fimose.`, `Sífilis.`, `Baby blues.`) e flagá-las gerava 8 avisos inúteis por prova.

Quando isso acontece, a resposta comentada geralmente diz qual era a alternativa
perdida: na questão 21 ela discute "Hipospadia (Incorreta)", que não corresponde a
nenhuma das outras três.

### 4. Integridade

Camada de texto corrompida, lacuna (`[?]`, `�`), parênteses desbalanceados,
truncamento, e rótulo do parser do admin no início de campo.

### 5. Mídia

Imagem e tabela entram com severidade `manual`, separada das outras: não são
defeito de extração e não bloqueiam a geração — são trabalho manual depois.

## Camada de texto corrompida

Nem todo PDF gerado tem texto confiável. A Integradora 4 (2025.2) trouxe um
parágrafo assim na questão 46:

> A dor na apendicite é localizada na **regiã o** **epigá strica** ou
> periumbilical, quase sempre acompanhada **dnáuseasas** e **vô mitos** […] o
> **peritô nio** periapendicular. A febre **nã o** costuma ser elevada.

Dois problemas diferentes: espaço espúrio dentro da palavra (reparável só com
dicionário) e `dnáuseasas`, que perdeu e duplicou caractere de verdade (não
reparável de jeito nenhum). Nenhum dos dois é detectável pelos crivos de
estrutura — o texto passa por prosa válida.

`normalizarTipografia()` repara só o que é **inequívoco**:

| defeito | reparo | por que é seguro |
| --- | --- | --- |
| `ﬁsiopatológico` (ligadura U+FB01) | `fisiopatológico` | busca no admin não acha o codepoint de ligadura |
| acento decomposto (NFD) misturado com pré-composto | NFC | `"ação"` decomposto ≠ `"ação"` pré-composto para o Postgres |
| `ilı ́aca` (espaço antes da marca combinante) | `ilíaca` | não existe marca combinante isolada em português |
| `ı` + acento (U+0131) | `í` | português não usa `ı` em nenhuma palavra |

Nunca `NFKC`: esmagaria `Na⁺`, `Cl⁻` e `µg`, que são conteúdo clínico.

O que sobra vai para `paragrafosSuspeitos()`, em dois níveis:

- **certo** — palavra terminada em `ã`, `õ`, `ô` ou `ê` seguida de fragmento
  minúsculo. A lista de palavras portuguesas com esse fim é fechada e curta
  (`manhã`, `irmã`, `avô`, `você`…), então `regiã o` e `peritô nio` são corrupção
  com certeza prática. Vira **flag alta** e a questão fica fora do markdown.
- **fraco** — mesma forma terminada em `á`, `é`, `í`, `ó`, `ú`, `â`. Aqui `está
  dentro`, `até os` e `já que` são português correto e frequentes, então só entra no
  relatório para conferência, sem bloquear.

Na prova de calibração isso deu **1 verdadeiro positivo e 0 falsos** em 50
questões.

## Divisão apoio / pergunta

`ENUNCIADO_APOIO` recebe o caso clínico e os exames; `ENUNCIADO`, a pergunta final.
Dois cortes, tentados em ordem, e **nenhum deles descarta ou reordena texto**:

1. **por parágrafo** — o último parágrafo é a pergunta (35 das 50 questões).
2. **por frase** — dentro do último parágrafo, a última fronteira de frase seguida
   de abertura de comando (14 das 50). Existe porque em boa parte das questões o
   caso e a pergunta estão no mesmo parágrafo, sem linha em branco: *"…estava
   esperando as dores das contrações aumentarem. Analise a situação descrita…"*.

Quando nenhum se aplica com segurança, o enunciado inteiro fica em `ENUNCIADO`.
`ENUNCIADO_APOIO` é opcional no admin, então não dividir é sempre válido — e um
corte errado é pior que nenhum corte. Na questão 18 a pergunta está no **meio**
(seguida das assertivas I–IV): dividir exigiria reordenar, então a regra
corretamente não divide.

O `verificar-roundtrip.mjs` confere os dois campos, então um corte que perdesse
texto não passaria.

## Round-trip: obrigatório antes de colar

`verificar-roundtrip.mjs` delega para o verificador do pipeline do TPI, que
transpila `admin-importar.component.ts` e roda o `parseBlocos()` **de verdade**
contra `saida/prova.md`, conferindo campo por campo. Ele não sabe nada de TPI — só
lê `validacao.json` + `saida/prova.md`, contrato que este pipeline também cumpre.
Duplicar o arquivo criaria duas versões do único teste que fala com o parser de
produção.

Exit 1 significa **não colar**.

## Conteúdo que parece rótulo

Duas camadas do mesmo problema, e as duas morderam de verdade.

**Na extração.** O autômato de campos casa rótulo com **sensibilidade à caixa**.
Sem isso, a questão 7 perdia as quatro alternativas em silêncio: o enunciado traz a
linha

```
referência: 0,4 a 0,9 mg/dL).
```

— continuação de `creatinina: 1,1 mg/dL (valor de referência: …)` quebrada pelo
`-layout` — que casava com `Referências:` e pulava o autômato do enunciado direto
para a bibliografia. O gerador do relatório emite o rótulo sempre capitalizado;
prosa de prova, não. O autômato também **só avança**: `Resposta comentada:` aparece
51 vezes numa prova de 50 questões porque um comentário cita o próprio rótulo.

Campo obrigatório vazio no fim da extração é **bloqueio** — foi assim que a questão
7 passou antes, e perda silenciosa é o pior modo de falha possível.

**Na geração.** `parseQuestaoBloco()` do admin detecta campos por prefixo de linha.
`gerar.mjs` gruda a linha suspeita na anterior (texto preservado, só a quebra de
linha muda) e, quando o rótulo cai na primeira linha de um campo — onde não há para
onde grudar, porque o parser dá `trim()` antes de testar — **exclui** a questão e
lista em `PENDENCIAS.md`. Use rótulos sempre em MAIÚSCULAS ao montar markdown à
mão: é o que separa rótulo de conteúdo.

## Revisão manual

`revisar.mjs` escreve `questoes-revisadas.json` já preenchido com as questões
sinalizadas: texto atual nos campos editáveis e, nos campos com prefixo `_`, as
flags, as páginas do PDF e o gabarito, só como contexto.

Não existe tela HTML como no TPI de propósito: lá a dúvida é "a IA leu a foto
certo?" e o scan ao lado resolve. Aqui não há scan — o que precisa de olho humano é
um trecho em que a camada de texto do PDF saiu embaralhada, e para isso o que ajuda
é o texto em JSON editável com as marcas apontadas.

Edite, troque `"revisado": false` por `true` e rode `validar.mjs` e `gerar.mjs` de
novo. `gerar.mjs` mescla **campo a campo**, então campo que você não mexer mantém o
valor extraído, e a revisão sobrevive a um novo `validar.mjs`.

Nunca edite `validacao.json` à mão.

## Estrutura do diretório de trabalho

```
.trabalho/<slug-da-prova>/
├── manifesto.json              cabeçalho da prova, páginas, avisos da extração
├── questoes.json               a prova como ela é, todos os campos
├── validacao.json              resultado dos quatro crivos por questão
├── relatorio-validacao.md      resumo + cobertura do cruzamento + flags altas
├── classificacao-sugerida.csv  Área/Subárea/Semana/Módulo/IES por questão
├── questoes-revisadas.json     suas correções (de revisar.mjs)
└── saida/
    ├── prova.md                markdown completo
    ├── parte-NN.md             lotes de 25
    └── PENDENCIAS.md           imagens, tabelas, exclusões, vínculo com a prova
```

Gitignorado: o relatório traz nome de aluno no cabeçalho, além do conteúdo da prova.

## Invariantes

- **O gabarito vem da marcação `(CORRETA)`**, nunca de inferência sobre o
  comentário. O comentário **confere** o gabarito (crivo 2); não o define.
- **Imagem e tabela nunca viram texto corrido.** Tabela é substituída por
  placeholder com o conteúdo preservado em `PENDENCIAS.md`; imagem é sinalizada com
  trecho de busca.
- **Campo obrigatório vazio é bloqueio**, não aviso: significa que o autômato de
  rótulos pulou uma seção.
- **Correção vai em `questoes-revisadas.json`**, nunca em `validacao.json`.
- **Exit 1 é bloqueio.**

## Limites conhecidos

- **Calibrado em 13 provas** — Integradora 4/8 (2024.2, 2025.1, 2025.2), SOI IV
  (2022.2, 2023.1, 2023.2, 2024.2, 2025.1, 2025.2) e HAM IV (2022.2, 2023.2,
  2024.2, 2025.2). Onze rodam ponta a ponta; as duas de 2022.2 bloqueiam pelo
  layout de duas colunas (abaixo). Os limiares (eco no comentário em 0.45,
  vocabulário em 0.34, margem em 0.15, pergunta em 400 caracteres, 3+ espaços
  para coluna de tabela) saíram das Integradoras. Os scripts imprimem os números
  e não só o veredito: muitas flags `sem_eco` de uma vez significa recalibrar o
  limiar, não extração ruim.
- **O relatório de 2022.2 vem em duas colunas** — rótulos empilhados à esquerda,
  texto todo numa coluna indentada à direita. Ali `Alternativas:` aparece na
  altura da **segunda linha do enunciado**, porque a coluna esquerda não
  acompanha o fluxo da direita: o autômato transiciona cedo e metade do enunciado
  vira alternativa. `ehLayoutDeDuasColunas()` detecta pela indentação (1%–3% das
  linhas de conteúdo passam da coluna 15 nas provas lineares, 84%–86% nessas) e
  bloqueia com essa mensagem. Suportar o formato exigiria um segundo modo de
  extração; por ora, prova de 2022.2 entra à mão pelo `/admin/questoes`.
- **Cada edição nova mudou o parser**, e essa é a medida honesta de quanto o formato
  varia. A Integradora 2025.1 trouxe prefixo de origem em caixa mista
  (`(AFYA Paraíba)` contra `(FESAR)`), outro vocabulário de rótulo no comentário
  (`Comentário: Correta.`), comentário em seções, filtro `[IES]` duplicado e figura
  embutida de verdade. A 2024.2 trouxe marca d'água na margem da linha do rótulo,
  alternativa degenerada (`x`), tabela entregue como imagem e imagem em página
  dividida por duas questões. As de SOI e HAM trouxeram questão discursiva,
  marcador de questão dividindo a linha com outro rótulo, ordinal corrompido
  (`12!! QUESTÃO`), hash espaçado e origem sem `[IES]` para confirmar.
  **Conte com ajustar o parser na próxima edição** em vez de assumir que ela passa
  limpa — e rode `testar.mjs` depois de qualquer mexida.
- **`pdfimages` é opcional, `pdftotext` não.** Sem `pdfimages` no PATH (poppler
  avulso do Git for Windows) o pipeline segue com aviso e perde só o sinal de
  raster embutido. `pdftotext` é chamado com `-enc UTF-8` explícito porque o build
  do Git emite na codepage local, e aí nenhum rótulo casa e a prova sai vazia sem
  erro nenhum.
- **Tabela como texto nunca apareceu em prova real.** As três edições têm zero: a
  única tabela encontrada (2024.2, questão 24) é raster. O caminho de substituição
  por placeholder tem cobertura só por teste unitário, com dados sintéticos —
  confira o primeiro resultado antes de confiar.
- **O desempate de imagem por OCR precisa de `tesseract`** (`apt install
  tesseract-ocr tesseract-ocr-por`). Sem ele a extração de imagem funciona, mas
  imagem em página compartilhada sai marcada como ambígua para você decidir.
- **A força do cruzamento varia muito entre edições** e depende de como a devolutiva
  foi escrita: 2025.2 confirmou 27 de 50 gabaritos, 2025.1 confirmou 19, e a 2024.2
  só 12 — nesta última o comentário parafraseia as alternativas em vez de citá-las, e
  às vezes explica o conceito sem dizer "correta"/"incorreta". Não é defeito da
  extração; é ausência de confirmação, e o relatório distingue as duas coisas.
- **Figura puramente vetorial sem menção no texto é o ponto cego.** Tabela vetorial
  é pega pelas células alinhadas (o texto está lá); gráfico vetorial sem legenda nem
  menção não é pego por nenhum dos três sinais. Sem `mutool`/`qpdf` no ambiente não
  há como inspecionar operador de desenho, e a dependência é só `poppler-utils` de
  propósito.
- **`DISCIPLINA`/`TEMA` saem vazios** de propósito: a nomenclatura dos filtros do
  relatório não corresponde ao cadastro. Veja `classificacao-sugerida.csv`.
- **O bloco "Filtros da questão" pode vir em duas colunas** (IESC 2023.1: a chave
  `[Semanas]` na margem da linha `Feedback:` e o valor na linha seguinte, ao lado
  do `--`). Nesse caso a chave é descartada como margem — **com aviso nomeando o
  que saiu** — e a coluna correspondente fica vazia no CSV. Atinge só a sugestão
  de classificação; enunciado, alternativas e gabarito não dependem desse bloco.
- **`/admin/importar` não vincula questão a prova.** Depois de importar, crie a
  prova em `/admin/provas` com o subtipo certo (Integradora, SOI, HAM) e vincule
  as questões.
- **`PONTOS_CHAVE` e `CRITERIOS` das discursivas saem vazios** porque o relatório
  não os traz. Preencher exigiria destilar rubrica do texto da chave, que é
  invenção — fica como passe manual listado em `PENDENCIAS.md`.
- **O parser assume o formato do relatório AFYA.** Outro layout faz `extrair.mjs`
  sair com erro em vez de adivinhar — aí é adaptar `CAMPOS` em `lib/relatorio.mjs`,
  não empurrar.

## Estado das importações — snapshot de 31/07/2026

Esta seção é um instantâneo, não contrato: o estado real está nos diretórios de
trabalho, que são gitignorados (material de prova + nome de aluno). Quem retomar
o trabalho começa por aqui.

**12 provas do 4º período importadas em 31/07/2026** — 140 questões (116 fechadas
+ 24 discursivas), todas com round-trip íntegro e zero flags altas:

| prova | questões | subtipo em `/admin/provas` |
| --- | --- | --- |
| SOI IV — 2023.2, 2024.2, 2025.1, 2025.2 | 15 cada (13+2) | SOI |
| HAM IV — 2023.2, 2024.2, 2025.2 | 10 cada (8+2) | HAM |
| IESC IV — 2023.1, 2023.2, 2024.2, 2025.1, 2025.2 | 10 cada (8+2) | IESC |

**Não importadas, e por quê:**

| prova | motivo |
| --- | --- |
| SOI IV (2023.1) | scan com OCR ruim — 5 questões com `ocr_suspeito` (Q1, Q3, Q9, Q10, Q14). Sairia com 10 de 15, e o texto das outras precisa de conferência |
| SOI, HAM e IESC IV (2022.2) | relatório em duas colunas; `extrair.mjs` bloqueia |
| Integradora 4 (2024.2, 2025.1, 2025.2) | tinham markdown pronto e revisão manual aplicada, mas os diretórios de trabalho e os PDFs sumiram do projeto antes da importação. Reprocessar exige os PDFs de novo |

### Imagens pendentes — 7 questões

Nenhuma tem o raster no PDF: o gerador do relatório descartou todas, então a
figura vem da fonte original. Busque o trecho no `/admin/questoes` e anexe.

| prova | questão | gabarito | buscar por | figura |
| --- | --- | --- | --- | --- |
| SOI IV (2025.2) | Q10 | B | `Uma criança de 5 anos apresenta diarreia aquosa persistente, dor` | ciclo de vida do agente etiológico |
| HAM IV (2023.2) | Q06 | D | `Um pré-escolar de 3 anos é levado ao pronto-socorro pela mãe após` | radiografia |
| HAM IV (2025.2) | Q04 | C | `Um paciente pediátrico é trazido à Unidade de Pronto Atendimento pela` | radiografia a interpretar |
| HAM IV (2025.2) | Q10 | discursiva | `Um menino de 12 meses é levado à consulta pediátrica pela mãe, que` | gráfico de crescimento (item b) |
| IESC IV (2023.1) | Q10 | discursiva | `Marina traz sua filha de 6 meses à unidade de saúde da família para` | gráfico de peso × idade |
| IESC IV (2024.2) | Q09 | B | `Durante uma consulta de rotina em uma Unidade Básica de Saúde, um` | gráfico de crescimento |
| IESC IV (2025.1) | Q07 | C | `Ao realizar uma consulta de rotina em uma Unidade de Saúde da Família` | gráfico de crescimento |

Cinco das sete são gráfico de crescimento — provavelmente as mesmas curvas da OMS
reaproveitadas entre provas. Quatro ficam sem sentido sem a figura ("analise o
gráfico apresentado abaixo") e entraram como `ativa`.

A questão 4 da IESC 2023.1 foi sinalizada e **é falso positivo**: cita "raio-X do
tórax" como conduta recomendada no texto, não como figura anexa. Fica registrada
aqui para não ser reinvestigada a cada rodada.

### O que ainda falta nas 12 importadas

1. **Preencher `PONTOS_CHAVE`** nas 24 discursivas que forem entrar em simulado
   com correção pela Aurora — saem vazias porque o relatório não as traz.
2. **Classificar** disciplina/tema, que saem vazios de propósito.

### Cobertura do gabarito, por prova

Quantos gabaritos foram **conferidos contra a devolutiva** (o resto vem só da
marcação `(CORRETA)`, que é confiável mas é fonte única):

| prova | conferidos | por quê |
| --- | --- | --- |
| Integradora 4 (2025.2) | 27 / 50 | devolutiva cita o texto das alternativas |
| Integradora 4 (2025.1) | 19 / 50 | idem, com mais questões de assertivas |
| Integradora 4 (2024.2) | 12 / 50 | devolutiva parafraseia em vez de citar; a Q33 não tem devolutiva nenhuma |
| SOI IV (2025.1) | 6 / 13 | 2 questões de assertivas sem veredito numeral a numeral |
| SOI IV (2025.2) | 4 / 13 | devolutiva cita a alternativa entre aspas e comenta em bloco |
| IESC IV (todas) | 6 / 40 no total | devolutiva comenta sem dizer "correta"/"incorreta" de forma legível, e muitas são de assertivas |

**As provas de IESC são o caso mais fraco do acervo nesse eixo**: 34 das 40
fechadas entraram com o gabarito vindo só da marcação `(CORRETA)`. É fonte única
e confiável, mas não conferida — se aparecer reclamação de gabarito, comece por
elas.

As discursivas ficam fora dessa conta: não têm alternativa marcada para cruzar, e
quem responde por elas é o crivo 1b.

Não some isso como "verificado": leia a tabela de cobertura em
`relatorio-validacao.md` de cada prova.
