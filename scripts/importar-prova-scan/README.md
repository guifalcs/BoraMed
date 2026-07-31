# Importação de prova de TPI (PDF digitalizado)

Pipeline para **TPI — Teste de Progresso Institucional**, o único tipo de prova do
acervo que chega como PDF digitalizado (foto da prova de um aluno). É o caso em que
pedir a transcrição direto para uma IA falha: texto quebrado, alternativas
inventadas e gabarito copiado das marcações à mão do aluno.

A confiabilidade não vem de a IA acertar. Vem de **cada campo ser conferido contra
uma segunda fonte independente do mesmo PDF**, mecanicamente. Só o enunciado e as
alternativas passam por IA; gabarito, explicação, distratores e referências saem
por regex do próprio PDF.

Uso guiado: skill `importar-prova-scan` (`.claude/skills/importar-prova-scan/`).

## Escopo

**Não** serve para o resto do acervo: Treinos Nacionais, Simulados Processuais e
Laboratório são autorais e entram direto pelo `/admin/questoes`. Prova com camada
de texto nas questões também não precisa disso — `pdftotext` extrai tudo.

O parsing da folha de gabarito e da devolutiva assume o formato do relatório AFYA
(ver "Limites conhecidos"). Outra prova digitalizada com estrutura diferente faz o
`extrair.mjs` sair com erro em vez de adivinhar.

## Anatomia do PDF

Provas nesse formato costumam ter três seções em sequência:

| seção | conteúdo | extração |
| --- | --- | --- |
| scan | prova fotografada | visão/IA |
| gabarito | folha oficial de respostas | camada de texto |
| devolutiva | resposta comentada por questão | camada de texto |

Na TPI 2025.1: páginas 1–46 são scan, 47–48 gabarito, 49–145 devolutiva. **99 das
145 páginas eram texto puro** — rode `extrair.mjs` antes de assumir que o PDF é
todo imagem.

## Comandos

```bash
# 1. extração determinística (gabarito, devolutiva, imagens das páginas)
node scripts/importar-prova-scan/extrair.mjs "TPI 2025.1.pdf"
#    → imprime o diretório de trabalho ($T abaixo)

# 2. transcrever o scan  → via skill, agentes `transcritor` em lotes de 5-6 páginas
#    escreve $T/transcricao/passe1/pNNN.json

# 3. segunda testemunha: OCR (zero tokens; substitui o 2º passe de IA)
node scripts/importar-prova-scan/ocr.mjs $T

# 4. validação mecânica
node scripts/importar-prova-scan/validar.mjs $T

# 5. lacunas [?] que sobraram: recorta em resolução nativa  → agentes resolvem
node scripts/importar-prova-scan/zoom-lacunas.mjs $T

# 6. revisão humana do que ainda travou
node scripts/importar-prova-scan/revisao.mjs $T   # abre $T/revisao.html

# 7. markdown para /admin/importar (imprime o que exige trabalho manual depois)
node scripts/importar-prova-scan/gerar.mjs $T --fonte "TPI 2025.1" --tipo nacional

# 8. round-trip contra o parser real do admin (obrigatório antes de colar)
node scripts/importar-prova-scan/verificar-roundtrip.mjs $T

# 9. limpeza: remove o intermediário (~48 MB) e recolhe arquivos soltos na raiz
node scripts/importar-prova-scan/limpar.mjs $T --raiz

# extras
node scripts/importar-prova-scan/recortar.mjs $T  # recorta as figuras embutidas
node scripts/importar-prova-scan/testar.mjs       # testes do pipeline
```

Todos os scripts saem com **exit 1** quando encontram algo que exige decisão
humana. Exit 1 é bloqueio, não aviso.

## Os quatro crivos

`validar.mjs` roda quatro verificações independentes por questão:

1. **Estrutura** — 5 alternativas a–e, enunciado presente, nenhuma duplicada,
   gabarito oficial aponta para uma alternativa que existe.
2. **Consenso** — as testemunhas independentes coincidem: o OCR da página sempre
   (`ocr.mjs`, zero tokens) e um segundo passe de IA quando existir, com diff
   palavra a palavra. Pega erro que uma testemunha cometeu e a outra não.
3. **Cruzamento** — confere a transcrição contra a devolutiva oficial. Pega erro
   que os **dois** passes cometeram igual (falha correlacionada do mesmo modelo).
4. **Integridade** — truncamento, `[?]`, `�`, parênteses desbalanceados, palavra
   colada, alternativa curta demais.

### A força do crivo 3 varia, e o relatório diz quanto

O cruzamento não tem a mesma força em toda questão. `relatorio-validacao.md` traz
a distribuição:

| nível | o que foi conferido |
| --- | --- |
| **forte** | a devolutiva nomeia a letra correta e ela bate com a folha de gabarito |
| **média** | a devolutiva transcreve a resposta correta e ela bate com a alternativa do gabarito |
| **presença** | só foi possível conferir que as alternativas existem no texto oficial |

Nível presença pega OCR corrompido (texto lido errado não aparece em lugar
nenhum), mas **não** pega troca de ordem das alternativas. Na TPI 2025.1 só 7 de
120 questões têm seção `Distratores:` separada e 32 declaram a resposta
explicitamente — no resto, a devolutiva comenta todas as alternativas no mesmo
bloco e "qual delas o comentário descreve" não é decidível. O validador diz isso
em vez de fingir confirmação.

Não confunda "sem flag" com "verificado a fundo": leia a tabela de cobertura.

### Por que bigramas

Alternativas de prova médica diferem por uma palavra. "Leucemia Linfoide Aguda" e
"Leucemia Mieloide Aguda" têm vocabulário quase idêntico, então containment de
unigramas dá 1.0 para as duas e não distingue nada. Em bigramas,
`{leucemia linfoide, linfoide aguda}` e `{leucemia mieloide, mieloide aguda}` não
se cruzam.

O preço é sensibilidade a reescrita, então há duas métricas com papéis distintos:

- `similaridade` (bigrama) — decide **qual** alternativa a devolutiva descreve.
- `similaridadeVocabulario` (unigrama em janela) — decide se o texto **existe**;
  robusta a reescrita, é a rede contra corrupção de OCR.

## Regra do gabarito: devolutiva acima da folha

A devolutiva comentada vale mais que a folha de gabarito seca. Onde as duas
discordam, **vale a devolutiva** e a troca é automática — só registrada, não
bloqueia. `lib/gabarito.mjs`, três caminhos em ordem de força:

| origem | quando | decide por |
| --- | --- | --- |
| `devolutiva_letra` | a devolutiva nomeia a letra ("a resposta correta seria letra A") | a letra citada; não depende do scan |
| `devolutiva_texto` | a devolutiva transcreve o texto da resposta certa | a alternativa cujo **texto** casa com ela |
| `folha` | a devolutiva não declara nada | a folha de gabarito |

Decidir por *texto* no caminho 2 é o ponto: se as alternativas foram transcritas
fora de ordem, a letra da folha aponta para a errada, mas o texto continua certo.
Exige margem sobre a segunda colocada — empate entre alternativas parecidas não
decide nada e cai de volta na folha, deixando o crivo 3 sinalizar.

`validacao.json` guarda `letra_oficial` (a em uso, já resolvida), `letra_folha` e
`gabarito_origem`. `relatorio-validacao.md` lista as questões trocadas.

Na TPI 2025.1 isso resolve a **questão 93**: a folha diz `B`, a devolutiva diz
"A resposta correta seria letra A" — vale **A**.

## Conteúdo que parece rótulo

`parseQuestaoBloco()` em `admin-importar.component.ts` detecta campos por prefixo
de linha. Conteúdo de prova tem linhas assim de verdade, e o estrago era
silencioso — a questão entrava mutilada sem erro de validação:

| linha no conteúdo | o que acontecia |
| --- | --- |
| `Fonte: Federação Internacional...` (legenda de figura) | consumida como campo `FONTE`; a legenda **desaparecia** do enunciado |
| `Gabarito: A alternativa correta...` (na explicação) | casava com `/^GABARITO:\s*([A-Ea-e])/i` e **invertia o gabarito** para A |

**Corrigido no componente** por duas regras que desambiguam rótulo de conteúdo:

1. **Primeira ocorrência ganha** em campo de valor único. O template emite todos
   antes de `EXPLICACAO`, então repetição depois é conteúdo.
2. Dentro de seção de texto livre (`ENUNCIADO`, `ENUNCIADO_APOIO`, `EXPLICACAO`,
   `RESPOSTA_MODELO`), o rótulo só vale na **forma canônica em maiúsculas**. O
   template sempre usa maiúscula; prosa de prova, não.

Cabeçalhos de seção (palavra isolada) seguem tolerantes a caixa. Casos cobertos em
`admin-importar.parser.spec.ts`.

`gerar.mjs` blinda também do lado da geração (defesa em profundidade): gruda a
linha suspeita na anterior — texto preservado integralmente, só a posição da
quebra de linha muda — e, quando o rótulo cai na primeira linha de um campo, onde
não há para onde grudar (o parser dá `trim()` antes de testar, então indentar não
resolve), **exclui** a questão da saída e lista em `PENDENCIAS.md`.

`verificar-roundtrip.mjs` roda o parser de verdade e prova que nada se perdeu.

## Estrutura do diretório de trabalho

```
.trabalho/<slug-da-prova>/
├── manifesto.json              mapa das seções + avisos da extração
├── gabarito.json               { "1": "E", ... }            ← única fonte de gabarito
├── devolutiva.json             comentário/distratores/referências/resposta declarada
├── classificacao-sugerida.csv  Área/Subárea/Tema quando a devolutiva declara
├── paginas/pNNN.jpg            JPEG nativo do scan, sem recompressão
├── transcricao/passe1|passe2/  pNNN.json por página
├── validacao.json              resultado dos quatro crivos por questão
├── relatorio-validacao.md      resumo + cobertura + detalhe das flags altas
├── revisao.html                tela de revisão com o scan lado a lado
├── questoes-revisadas.json     suas correções (baixado da tela)
└── saida/
    ├── prova.md                markdown completo
    ├── parte-NN.md             lotes de 30
    ├── PENDENCIAS.md           imagens, exclusões, classificação
    └── imagens/qNNN.jpg        recortes das figuras
```

O diretório é gitignorado: contém material de prova e fotos com dados de aluno.

## Invariantes

- **O gabarito nunca vem da transcrição do scan.** As marcações à mão são as
  respostas do aluno e erram — na TPI 2025.1, na questão 3 o aluno circulou
  "Leucemia Mieloide Aguda" e o gabarito é "Leucemia Linfoide Aguda".
  `carregarPasse()` rejeita transcrição que traga campo de gabarito. Ele vem do
  PDF oficial, resolvido por `lib/gabarito.mjs` (devolutiva > folha).
- **Dois passes de verdade.** Passe 2 contaminado pelo passe 1 transforma o
  consenso em teatro. Subagentes novos, prompt idêntico, sem mencionar que existe
  um passe anterior.
- **Correção vai em `questoes-revisadas.json`**, nunca editando `validacao.json`.
  `gerar.mjs` mescla campo a campo, então a revisão sobrevive a um novo
  `validar.mjs`.

## Limites conhecidos

- Questões com assertivas `I/II/III` têm alternativas do tipo "II e IV, apenas",
  sem tokens úteis: o crivo 3 não se aplica e o validador marca
  `cruzamento_inaplicavel`. Essas dependem só do consenso entre os passes.
- **Figuras e tabelas não entram pelo markdown do admin** — é a única parte que
  sempre exige trabalho manual depois de importar. `gerar.mjs` termina imprimindo
  o bloco `INSERIR MANUALMENTE DEPOIS DE IMPORTAR`, listando questão por questão
  as que têm imagem e as que têm tabela/quadro achatado em texto corrido (a
  detecção olha rótulo "Tabela:/Quadro:/Gráfico:" e densidade de `|` e ` / ` no
  texto de apoio). `recortar.mjs` gera o recorte da figura a partir da banda
  vertical estimada na transcrição; confira antes de subir.
- `/admin/importar` não vincula questão a prova. Depois de importar, vincule em
  `/admin/provas`.
- `DISCIPLINA`/`TEMA` saem vazios de propósito: a nomenclatura da devolutiva não
  corresponde ao cadastro.
- **Calibrado e testado em uma prova só** — TPI 2025.1, 46 páginas de scan, 120
  questões. Os limiares (eco no OCR 0.45, cruzamento 0.6/0.34, faixa de zoom
  470px) saíram dela. Em TPI de outra origem podem precisar de ajuste: os scripts
  imprimem os números, então muitas flags `sem_eco_no_ocr` de uma vez significa
  recalibrar o limiar, não transcrição ruim.
- **Sem a devolutiva o pipeline enfraquece muito**: o crivo 3 desaparece (é o que
  confere se o gabarito aponta para a alternativa certa), o preenchimento
  automático de `[?]` perde a única fonte confiável, a regra "devolutiva acima da
  folha" fica sem efeito, e as questões entram sem `EXPLICACAO` nem `REFERENCIA`.
  A classificação das seções está em três regex em `lib/pdf.mjs`: gabarito espera
  a tabela `001 (E)`, devolutiva espera `Nª QUESTÃO`/"Resposta comentada:", e scan
  é página com menos de 60 caracteres alfanuméricos.
