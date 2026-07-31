# Prompt de transcrição de página de prova digitalizada

Este é o texto entregue a cada subagente de transcrição, **uma página por agente**.
Substitua `{ARQUIVO}`, `{PAGINA}` e `{DIR}` antes de despachar.

---

Você vai transcrever **uma página** de uma prova de medicina fotografada. Sua saída
alimenta um pipeline de importação que depois cruza sua transcrição com o gabarito
oficial e com a devolutiva comentada da prova. Precisão literal é tudo que importa.

Leia a imagem: `{ARQUIVO}` (página {PAGINA} do PDF).

## Regras absolutas

1. **Transcreva literalmente.** Não corrija gramática, ortografia, concordância ou
   pontuação, mesmo que a prova esteja errada. Não resuma, não reescreva, não
   complete frase nenhuma. Se a prova escreveu "pois haver ser cicatriz sorológica",
   você escreve exatamente isso.

2. **IGNORE 100% das marcações à mão.** Este scan é da prova de um aluno: há setas,
   círculos, X, sublinhados, rabiscos e anotações na margem. Elas são as respostas
   *do aluno* e **frequentemente estão erradas** — na questão 5 desta prova as
   marcações do aluno apontam para "a" e "d", e o gabarito oficial é "b". Não
   transcreva nenhuma
   marcação manuscrita, não a mencione, e **nunca** use nada disso para inferir qual
   alternativa é a correta.

3. **Nunca emita gabarito.** Não existe campo de resposta correta no seu JSON. Se
   você incluir `gabarito`, `correta`, `resposta` ou similar, o pipeline rejeita o
   arquivo. O gabarito vem de outra fonte, oficial, e não é problema seu.

4. **Não invente.** Se um trecho estiver ilegível (dobra do papel, sombra, corte na
   borda, encadernação), transcreva o que dá para ler e marque o buraco com `[?]`
   exatamente assim. Anote em `observacoes` o que ficou ilegível. O validador trata
   `[?]` como bloqueio de revisão obrigatória — isso é o comportamento desejado.
   Chutar uma palavra plausível é o pior erro possível aqui.

## Como identificar as questões

- Uma questão **começa** com um cabeçalho tipo `6ª Questão (0.09)`. O número vai em
  `numero` e o peso entre parênteses em `peso` (string, ex: `"0.09"`).
- Um prefixo institucional entre parênteses no começo do texto — `(UNISL JI-PARANÁ)`,
  `(AFYA ITACOATIARA)`, `(UNIPTAN)` — vai em `fonte_original` e **não** no enunciado.
- Se o texto no **topo da página não tem cabeçalho de questão**, ele é continuação da
  questão da página anterior. Nesse caso emita o fragmento com `numero: null` e
  `continua_da_anterior: true`. É normal que um fragmento de continuação tenha só
  alternativas, ou só um pedaço de texto.
- Se a última questão da página **não termina** nela (falta alternativa, ou o texto é
  cortado pelo rodapé), marque `continua_na_proxima: true`.
- Você não vê as outras páginas. Não tente adivinhar o que veio antes ou depois.

## Divisão apoio / pergunta

- `enunciado_apoio` — caso clínico, texto-base, tabela, citação, afirmativas
  numeradas (`I.`, `II.`, `III.`), fonte de figura. Tudo que **antecede** a pergunta.
- `enunciado` — a pergunta final: a frase interrogativa ou o comando
  (`Assinale a alternativa correta`, `É correto o que se afirma em:`,
  `Diante do quadro apresentado, qual é a conduta terapêutica inicial mais adequada?`).
- Se não houver texto de apoio, deixe `enunciado_apoio` como `""`.
- Num fragmento de continuação, ponha o texto no campo a que ele pertence pelo seu
  próprio conteúdo: prosa narrativa → `enunciado_apoio`; pergunta/comando final →
  `enunciado`.

## Alternativas

- Sempre as chaves `a`–`e` em minúsculo, na ordem impressa na prova.
- Sem o prefixo da letra no texto: `"a": "Reavaliação clínica em 24 horas."`, não
  `"a": "a. Reavaliação clínica em 24 horas."`.
- Se uma alternativa é partida pela quebra de página, transcreva o pedaço visível na
  página que você está lendo e marque `continua_na_proxima`/`continua_da_anterior`.
- Se a prova tiver menos de 5 alternativas, emita só as que existem — não invente.

## Imagens embutidas

Se a questão contiver figura, gráfico, traçado (ECG, cardiotocografia), foto, lâmina
ou tabela em forma de imagem:

- `tem_imagem: true`
- `imagem_topo_pct` / `imagem_base_pct`: posição vertical aproximada da figura na
  página, em porcentagem da altura total (0 = topo, 100 = base). Estimativa a olho
  serve; é usada só para recortar um preview de revisão.
- Continue transcrevendo o texto normalmente. Legenda e `Fonte:` da figura vão em
  `enunciado_apoio`.

Também informe `posicao_topo_pct` para **toda** questão: onde o cabeçalho dela começa
na página, em % da altura. Usado para posicionar o scan na tela de revisão.

## Saída

Escreva **apenas** o arquivo `{DIR}/p{PAGINA_3_DIGITOS}.json` com este conteúdo, e
responda com uma linha só (`ok p{PAGINA}: N questões`). Nada de markdown, nada de
comentário, nada de cercas de código dentro do JSON.

```json
{
  "pagina_pdf": 3,
  "questoes": [
    {
      "numero": null,
      "peso": null,
      "fonte_original": null,
      "continua_da_anterior": true,
      "continua_na_proxima": false,
      "enunciado_apoio": "",
      "enunciado": "",
      "alternativas": {
        "a": "Tratar com penicilina benzatina e acompanhamento trimestral.",
        "b": "Administrar penicilina cristalina por 10 dias e coletar VDRL no líquor."
      },
      "tem_imagem": false,
      "imagem_topo_pct": null,
      "imagem_base_pct": null,
      "posicao_topo_pct": 0,
      "observacoes": null
    },
    {
      "numero": 6,
      "peso": "0.09",
      "fonte_original": "UNISL JI-PARANÁ",
      "continua_da_anterior": false,
      "continua_na_proxima": false,
      "enunciado_apoio": "Gestante, primigesta, de 41 semanas de idade gestacional, comparece a maternidade em início de trabalho de parto, bolsa rota, com contrações efetivas e ritmadas e dilatação de 5cm. [...] Fonte: Federação Internacional de Ginecologia e Obstetrícia (2015).",
      "enunciado": "Com base nos critérios da da Federação Internacional de Ginecologia e Obstetrícia (FIGO) de 2015 para interpretação da cardiotocografia, a avaliação da frequência cardíaca fetal no exame apresentado indica um traçado:",
      "alternativas": {
        "a": "Anormal, pois apresenta desacelerações repetitivas, que indicam comprometimento da oxigenação fetal.",
        "b": "Anormal, pois apresenta um padrão pseudossinusoidal, com oscilações rítmicas transitórias da frequência cardíaca."
      },
      "tem_imagem": true,
      "imagem_topo_pct": 27,
      "imagem_base_pct": 47,
      "posicao_topo_pct": 14,
      "observacoes": null
    }
  ]
}
```

Ordene `questoes` na ordem em que aparecem na página, de cima para baixo.
