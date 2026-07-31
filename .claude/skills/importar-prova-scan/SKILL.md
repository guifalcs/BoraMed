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

### 2. Transcrever o scan — dois passes independentes

Leia `scripts/importar-prova-scan/PROMPT-TRANSCRICAO.md`. Ele é o prompt a usar,
com as regras que evitam os erros clássicos (marcação à mão, gabarito inventado,
questão partida entre páginas).

Para cada página em `$T/paginas/` despache **um subagente por página**,
substituindo `{ARQUIVO}`, `{PAGINA}` e `{DIR}` no prompt. Escreva em
`$T/transcricao/passe1/pNNN.json`.

Depois repita **tudo de novo** em `$T/transcricao/passe2/`.

Regras do passe 2 — é o que dá valor ao consenso:

- Subagentes novos. **Nunca** mostre o resultado do passe 1 para o passe 2, nem
  mencione que existe um passe anterior.
- Prompt idêntico, sem dicas adicionais.
- Se um passe 1 falhou numa página, refaça essa página nos dois passes.

Despache em ondas de ~8 agentes paralelos. São 2× o número de páginas de scan.

### 3. Validar (determinístico)

```bash
node scripts/importar-prova-scan/validar.mjs $T
```

Quatro crivos independentes por questão:

1. **Estrutura** — 5 alternativas a–e, enunciado presente, nenhuma duplicada.
2. **Consenso** — os dois passes coincidem (diff palavra a palavra).
3. **Cruzamento** — a alternativa do gabarito oficial tem que aparecer no
   comentário da devolutiva; os distratores, na seção de distratores. Texto
   corrompido por OCR não casa com nada e cai aqui.
4. **Integridade** — truncamento, `[?]`, parênteses desbalanceados, palavra colada.

Exit 1 com qualquer flag alta. Lê `relatorio-validacao.md` para o resumo.

### 4. Revisar o que foi sinalizado

```bash
node scripts/importar-prova-scan/revisao.mjs $T
```

Abre `$T/revisao.html` no navegador: scan à esquerda posicionado na questão,
transcrição editável à direita, flags e o passe 2 para comparar. Corrija, marque
"revisado", baixe `questoes-revisadas.json` e salve em `$T/`.

Rode `validar.mjs` de novo se quiser reavaliar as flags.

### 5. Gerar o markdown

```bash
node scripts/importar-prova-scan/gerar.mjs $T --fonte "TPI 2025.1" --tipo nacional
```

Sai em `$T/saida/`: `prova.md` (tudo) + `parte-NN.md` (lotes de 30) +
`PENDENCIAS.md`. Cole em `/admin/importar` → aba Questões.

Questões com flag alta não resolvida ficam **fora** do markdown por padrão, listadas
em `PENDENCIAS.md`. Não use `--incluir-alta` sem ter olhado cada uma.

### 6. Round-trip — obrigatório antes de colar

```bash
node scripts/importar-prova-scan/verificar-roundtrip.mjs $T
```

Transpila `admin-importar.component.ts` e roda o `parseBlocos()` **de verdade**
contra o markdown, conferindo campo por campo que nada se perdeu nem mudou. Exit 1
significa não colar.

### 7. Pendências

- **Figuras**: o markdown do admin não carrega imagem. `node recortar.mjs $T` gera
  recortes aproximados em `$T/saida/imagens/`; anexe manualmente em `/admin/questoes`.
- **Vínculo com a prova**: `/admin/importar` não liga questão a prova. Depois de
  importar, crie/edite a prova em `/admin/provas` e vincule as questões.
- **Disciplina/tema**: sai vazio de propósito. `$T/classificacao-sugerida.csv` traz
  Área/Subárea/Tema das questões em que a devolutiva declara.

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
