---
name: importar-prova-scan
description: Use ao importar uma prova em PDF digitalizado (TPI, prova de faculdade, prova fotografada) para o acervo. Ativa ao mencionar importar prova, PDF de prova, prova escaneada/digitalizada, TPI, gabarito + devolutiva, ou quando a importação normal do /admin/importar traz questões quebradas.
---

# Importar prova digitalizada com verificação cruzada

Pipeline para importar provas cujo PDF é **foto da prova de um aluno** — o caso em
que pedir a transcrição direto para uma IA falha: texto quebrado, alternativas
inventadas e gabarito copiado das marcações à mão do aluno (que erram).

A confiabilidade não vem da IA acertar. Vem de **cada campo ser conferido contra
uma segunda fonte independente do mesmo PDF**, mecanicamente.

## Por que provas assim têm três seções

Esse formato de PDF costuma trazer, em sequência:

| seção | conteúdo | como extrair |
| --- | --- | --- |
| scan | prova fotografada | **só visão/IA** |
| gabarito | folha oficial de respostas | **camada de texto** — determinístico |
| devolutiva | resposta comentada por questão | **camada de texto** — determinístico |

Só a primeira precisa de IA. Gabarito, explicação, distratores e referências saem
por regex, com fidelidade absoluta. **Sempre rode `extrair.mjs` antes de assumir
que o PDF é todo imagem** — na TPI 2025.1, 99 das 145 páginas eram texto puro.

## Etapas

Todos os comandos a partir da raiz do projeto. `$T` é o diretório de trabalho que
`extrair.mjs` imprime.

### 1. Extrair (determinístico, ~30s)

```bash
node scripts/importar-prova-scan/extrair.mjs "<prova>.pdf"
```

Falha com exit 1 se encontrar lacuna no gabarito, questão duplicada na devolutiva
ou página com texto que não se encaixa em nenhuma seção. **Não siga com exit 1** —
é sinal de que o PDF tem estrutura diferente da esperada e algo seria perdido em
silêncio. Investigue a página apontada.

### 2. Transcrever o scan (a única etapa que gasta tokens)

Leia `scripts/importar-prova-scan/PROMPT-TRANSCRICAO.md` — é o contrato, com as
regras que evitam os erros clássicos (marcação à mão, gabarito inventado, questão
partida entre páginas).

Despache subagentes **do tipo `transcritor`** (`.claude/agents/transcritor.md`),
que tem só Read+Write e roda em sonnet. Regras de custo, medidas nesta prova:

- **Lotes de 5–6 páginas por agente**, nunca uma página por agente. O overhead de
  subagente (~21k tokens de system prompt e schema) é pago por agente, não por
  página: 46 agentes de 1 página custaram ~1,2M, enquanto 8 agentes de 6 páginas
  custam ~300k pelo mesmo trabalho.
- **Cole o conteúdo do PROMPT-TRANSCRICAO.md direto no prompt do agente**, em vez
  de mandar ele ler o arquivo — economiza um turno de contexto cheio por agente.
- **Não use `general-purpose`** para isso: ele carrega o schema de todas as
  ferramentas.

Cada agente escreve um JSON por página em `$T/transcricao/passe1/pNNN.json`.

### 3. Segunda testemunha: OCR, não um segundo passe de IA

```bash
node scripts/importar-prova-scan/ocr.mjs $T
```

Requer `sudo apt install -y tesseract-ocr tesseract-ocr-por` uma vez.

Custa **zero tokens** e é melhor ciência que um segundo passe: dois passes do
mesmo modelo erram de forma correlacionada, enquanto um motor OCR clássico erra de
forma completamente diferente de um LLM (confunde glifo, não alucina frase
plausível). `validar.mjs` detecta o diretório `ocr/` e usa automaticamente.

O OCR não serve para diff estrito (foto torta destrói o layout) — serve para
**cobertura**: cada trecho transcrito tem que ter eco no OCR da mesma página.

**Só pague um segundo passe de IA** (`$T/transcricao/passe2/`) se o relatório de
validação mostrar muitas questões ainda sem testemunha nenhuma. Se pagar: agentes
novos, prompt idêntico, e **nunca** mostre o passe 1 para o passe 2 nem mencione
que ele existe — passe 2 contaminado transforma o consenso em teatro.

### 4. Validar (determinístico)

```bash
node scripts/importar-prova-scan/validar.mjs $T
```

Quatro crivos independentes por questão:

1. **Estrutura** — 5 alternativas a–e, enunciado presente, nenhuma duplicada.
2. **Consenso** — as testemunhas independentes coincidem: OCR da página sempre, e um
   segundo passe de IA quando existir (diff palavra a palavra).
3. **Cruzamento** — a alternativa do gabarito oficial tem que aparecer no
   comentário da devolutiva; os distratores, na seção de distratores. Texto
   corrompido por OCR não casa com nada e cai aqui.
4. **Integridade** — truncamento, `[?]`, parênteses desbalanceados, palavra colada.

Exit 1 com qualquer flag alta. Lê `relatorio-validacao.md` para o resumo.

### 5. Revisar o que foi sinalizado

```bash
node scripts/importar-prova-scan/revisao.mjs $T
```

Abre `$T/revisao.html` no navegador: scan à esquerda posicionado na questão,
transcrição editável à direita, flags e o passe 2 para comparar. Corrija, marque
"revisado", baixe `questoes-revisadas.json` e salve em `$T/`.

Rode `validar.mjs` de novo se quiser reavaliar as flags.

### 6. Gerar o markdown

```bash
node scripts/importar-prova-scan/gerar.mjs $T --fonte "TPI 2025.1" --tipo nacional
```

Sai em `$T/saida/`: `prova.md` (tudo) + `parte-NN.md` (lotes de 30) +
`PENDENCIAS.md`. Cole em `/admin/importar` → aba Questões.

Questões com flag alta não resolvida ficam **fora** do markdown por padrão, listadas
em `PENDENCIAS.md`. Não use `--incluir-alta` sem ter olhado cada uma.

### 7. Round-trip — obrigatório antes de colar

```bash
node scripts/importar-prova-scan/verificar-roundtrip.mjs $T
```

Transpila `admin-importar.component.ts` e roda o `parseBlocos()` **de verdade**
contra o markdown, conferindo campo por campo que nada se perdeu nem mudou. Exit 1
significa não colar.

### 8. Reportar o que exige trabalho manual — obrigatório

`gerar.mjs` termina imprimindo um bloco `INSERIR MANUALMENTE DEPOIS DE IMPORTAR`
com as questões que têm **imagem** e as que têm **tabela/quadro**. Isso é a única
parte que o pipeline não resolve: o markdown do admin não transporta figura nem
grade de tabela.

**Repasse essa lista ao usuário no fechamento, questão por questão.** Não basta
dizer "veja PENDENCIAS.md" — ele precisa saber o número de cada questão, a página
do scan e o caminho do recorte, senão a prova entra com figuras faltando e ninguém
percebe.

Além disso:

- **Recortes das figuras**: `node recortar.mjs $T` gera em `$T/saida/imagens/`.
- **Vínculo com a prova**: `/admin/importar` não liga questão a prova. Depois de
  importar, crie/edite a prova em `/admin/provas` e vincule as questões.
- **Disciplina/tema**: sai vazio de propósito. `$T/classificacao-sugerida.csv` traz
  Área/Subárea/Tema das questões em que a devolutiva declara.

### 9. Limpar — obrigatório ao terminar

```bash
node scripts/importar-prova-scan/limpar.mjs $T --raiz
```

Remove o intermediário (páginas do scan, OCR, recortes de zoom, `revisao.html`) —
cerca de 48 MB numa prova de 46 páginas — e preserva o que serve de registro:
markdown gerado, validação, gabarito, devolutiva e a revisão manual.

`--raiz` recolhe para o diretório de trabalho os arquivos do pipeline que ficaram
soltos na raiz do projeto: o PDF de entrada e o `questoes-revisadas.json` que o
navegador baixou (ele cai em `~/Downloads` ou onde o usuário salvar, e é comum
acabar na raiz). Sem isso, o `questoes-revisadas.json` fica como arquivo não
rastreado sujando o `git status`.

Use `--seco` para ver o que seria removido, e `--tudo` para apagar o diretório de
trabalho inteiro quando a prova já estiver importada e conferida.

Feche confirmando `git status --short` limpo.

## Invariantes — não negocie

- **O gabarito nunca vem da transcrição do scan.** As marcações à mão são as
  respostas do aluno e erram. O validador rejeita transcrição que traga campo de
  gabarito.
- **Devolutiva acima da folha.** Entre as duas fontes oficiais, a devolutiva
  comentada vale mais que a folha de gabarito seca. Onde discordam, `validar.mjs`
  troca automaticamente e registra em `relatorio-validacao.md` (seção "Gabarito:
  devolutiva acima da folha"). Não é caso de revisão humana — é a regra.
- **Dois passes de verdade.** Passe 2 contaminado pelo passe 1 transforma o
  consenso em teatro.
- **Nunca edite `validacao.json` na mão.** Correção vai em
  `questoes-revisadas.json`, que `gerar.mjs` mescla campo a campo — assim a
  revisão sobrevive a um novo `validar.mjs`.
- **Exit 1 é bloqueio, não aviso.**

## Conteúdo que parece rótulo

`parseQuestaoBloco()` detecta campos por prefixo de linha. Uma linha começando com
`Fonte:` (legenda de figura) ou `Gabarito: A ...` dentro do conteúdo era consumida
como campo e corrompia a questão em silêncio.

Corrigido no componente: campo de valor único aceita só a primeira ocorrência, e
dentro de seção de texto livre o rótulo exige forma canônica em maiúsculas. Ao
montar markdown à mão, use **rótulos sempre em MAIÚSCULAS** — é o que separa
rótulo de conteúdo. `gerar.mjs` blinda também do lado da geração, e
`verificar-roundtrip.mjs` prova que nada se perdeu.
