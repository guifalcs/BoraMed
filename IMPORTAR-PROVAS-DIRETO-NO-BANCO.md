# Importar provas direto no banco (sem passar pelo /admin/importar)

Runbook genérico — vale para qualquer período. Antes de começar, confirme com o usuário (ou pelo
nome da pasta de PDFs, ex. "6 periodo") **qual período** está sendo importado, e substitua
`<PERIODO>` abaixo pelo número certo.

Contexto: já existe um pipeline determinístico (`scripts/importar-prova-devolutiva/`, skill
`importar-prova-devolutiva`) que extrai provas da AFYA (relatório de devolutiva em PDF) e gera
`saida/prova.md` validado por `verificar-roundtrip.mjs` (parser real do admin). Confira
`scripts/importar-prova-devolutiva/README.md`, seção "Estado das importações", antes de repetir
trabalho — pode ser que a extração/validação/geração do markdown já tenha sido feita numa sessão
anterior para esse período, e falte só a etapa de gravar no banco.

O que este runbook resolve: inserir as questões **direto no banco de produção**, sem depender de
colar manualmente em `/admin/importar` pela interface. Não existe "computer use" disponível neste
ambiente (teste com `orca status --json` antes de assumir o contrário — se o binário não existir,
siga por aqui). O caminho que funciona é chamar a mesma RPC que o botão "Salvar" usa, via SQL
direto (`mcp__supabase__execute_sql`).

**Isto grava em produção de verdade.** Antes de rodar em lote, valide com UMA prova, confira o
resultado com uma query, só então siga para as demais. Se tiver qualquer dúvida sobre uma decisão
de produto (nome da prova, se publica ou não, quais provas excluir), pergunte ao usuário — não
assuma.

## 0. Pré-requisitos que você precisa descobrir a cada período (não são fixos)

Rode estas queries no início e guarde os resultados:

```sql
-- disciplinas do período em questão
select id, sigla, nome, periodo from disciplina where periodo = <PERIODO> order by sigla;

-- a(s) faculdade(s) cadastrada(s) (confira, não assuma o UUID de memória)
select id, nome, sigla from faculdade;

-- seu próprio usuário admin, para autoria/impersonation
select id, papel, email from profiles where papel in ('admin','super_admin') and banido = false;

-- padrão de nome já usado em provas de períodos anteriores (para bater o padrão)
select nome, tipo, origem, formato, rede, subtipo, subtipo_nacional, periodo, disciplina_id, publicada
from prova
order by criado_em desc limit 20;
```

Padrão observado em importações anteriores: `nome = "N1 {SIGLA} {período em romano} {ano.semestre}"`
(ex.: `"N1 HAM V 2025.2"`), `tipo='faculdade'`, `origem='faculdade'`, `formato='nacional'`,
`rede='afya'`, `subtipo='N1'`, `subtipo_nacional='N1'`, `publicada=false` (**as provas anteriores
foram todas criadas como rascunho, não publicadas** — replique isso a menos que o usuário peça o
contrário), `faculdade_id` da AFYA. **Não copie esses valores sem checar** — confirme o subtipo
real olhando `manifesto.json` de cada prova (`cabecalho.titulo`): se disser "N2 ESPECÍFICA" em vez
de "N1 ESPECÍFICA", ou "TESTE DE PROGRESSO", ajuste o `subtipo`/`subtipo_nacional` de acordo (os
valores válidos na coluna são `N1`, `N2`, `teste_progresso`, `integradora`).

## 1. Se `saida/prova.md` ainda não existir para alguma prova

Siga a skill `importar-prova-devolutiva` (`.claude/skills/importar-prova-devolutiva/`) ponta a
ponta: `extrair.mjs` → `validar.mjs` → (se houver flag alta) `revisar.mjs` → `gerar.mjs` →
`verificar-roundtrip.mjs`. Se a prova for digitalizada (scan, sem camada de texto), use a skill
`importar-prova-scan` em vez dessa — mas só se a estrutura scan+gabarito+devolutiva da TPI
realmente estiver presente (veja abaixo).

Armadilhas conhecidas, de importações anteriores:

- **Antes de marcar uma flag alta como revisada, confira contra o PDF de verdade**:
  `pdftotext -f <pág_inicial> -l <pág_final> -layout "<arquivo>.pdf" -`. Boa parte das flags
  `marcada_como_incorreta` / `gabarito_contradiz_comentario` / `gabarito_contradiz_assertivas` são
  **falso positivo do validador** (não reconhece certos padrões de texto), não erro de extração —
  mas outras são reais (ex.: a marcação `(CORRETA)` no PDF contradiz o texto da explicação de
  verdade, ou vice-versa). Só marque `"revisado": true` depois de checar manualmente qual das duas
  está errada.
- **PDFs 100% escaneados sem seção de gabarito nem de devolutiva não servem para nenhum dos dois
  pipelines** (nem `importar-prova-devolutiva`, nem `importar-prova-scan` — este último exige a
  estrutura scan+gabarito+devolutiva da TPI). Se `extrair.mjs` falhar com "nenhum marcador Nª
  QUESTÃO" e a prova for 100% sem camada de texto, pare e reporte ao usuário — não force, não
  invente gabarito.
- **Cheque duplicatas**: se duas provas do mesmo período/disciplina têm nomes de arquivo diferentes
  mas o mesmo conteúdo, compare `questoes.json` dos dois diretórios de trabalho (`Get-Content
  a\questoes.json` vs `b\questoes.json`, ou hash). Se forem idênticos, é uma cópia duplicada —
  importe uma vez só e avise o usuário.
- Arquivos com "Anulada" no nome: pule (prova cancelada pela IES) — a menos que não exista versão
  substituta, aí pergunte ao usuário. Arquivos com "Irregular" no nome: normalmente é
  irregularidade na aplicação, não no conteúdo — importar normalmente, mas avisar no fechamento.
- Um caso real encontrado: um enunciado veio com `"FONTE: Pessoal, 2021."` colado no início do
  campo `ENUNCIADO` (pega pelo crivo `rotulo_no_inicio`). Corrija manualmente movendo esse trecho
  para o fim de `ENUNCIADO_APOIO` (ou remova, se for só ruído de OCR/legenda) antes de gerar.

## 2. Gerar o payload da RPC a partir do `prova.md` (parser real do admin)

Não escreva o JSON à mão. Use o parser de verdade (`parseBlocos`) do
`frontend/src/app/(admin)/importar/admin-importar.component.ts`, transpilado on-the-fly — é o
mesmo truque que `verificar-roundtrip.mjs` já usa para provar que o markdown sobrevive ao parser
real. Salve como script no seu scratchpad, por exemplo `montar-sql.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

function acharRaiz() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const alvo = join(dir, 'frontend/src/app/(admin)/importar/admin-importar.component.ts');
    try { readFileSync(alvo); return dir; } catch {}
    dir = resolve(dir, '..');
  }
  throw new Error('raiz do projeto não encontrada');
}
const RAIZ = acharRaiz();
const COMPONENTE = join(RAIZ, 'frontend/src/app/(admin)/importar/admin-importar.component.ts');

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--'));
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const nome = flag('nome'), subtipo = flag('subtipo'), periodo = flag('periodo');
const disciplinaId = flag('disciplina-id'), adminId = flag('admin-id'), faculdadeId = flag('faculdade-id');
const out = flag('out') ?? 'saida.sql';
if (!dirArg || !nome || !subtipo || !periodo || !disciplinaId || !adminId || !faculdadeId) {
  console.error('uso: node montar-sql.mjs <dir-trabalho> --nome X --subtipo N1 --periodo N --disciplina-id UUID --admin-id UUID --faculdade-id UUID --out arquivo.sql');
  process.exit(2);
}

const dir = resolve(dirArg);
const md = join(dir, 'saida', 'prova.md');
const require = createRequire(join(RAIZ, 'frontend/'));
const ts = require('typescript');
const src = readFileSync(COMPONENTE, 'utf-8');
const corte = src.indexOf('@Component(');
const puro = src.slice(0, corte).replace(/^import[\s\S]*?from\s+'[^']*';\s*$/gm, '');
const js = ts.transpileModule(puro, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const tmp = join(mkdtempSync(join(tmpdir(), 'parser-admin-')), 'parser.mjs');
writeFileSync(tmp, js, 'utf-8');
const { parseBlocos } = await import(pathToFileURL(tmp).href);

const parsed = parseBlocos(readFileSync(md, 'utf-8'), [], []);
const invalidas = parsed.filter((q) => !q.valida);
if (invalidas.length > 0) {
  console.error(`${invalidas.length} questão(ões) inválida(s) — não gerando SQL`);
  invalidas.forEach((q, i) => console.error(`  bloco ${i + 1}: ${q.erros.join('; ')}`));
  process.exit(1);
}

const questoesNovas = parsed.map((q) => ({
  enunciado: q.enunciado, enunciado_apoio: q.enunciado_apoio, formato: q.formato,
  tipo_questao: q.tipo_questao ?? 'nacional', status: 'ativa', disciplina_id: disciplinaId,
  explicacao: q.explicacao, referencia: q.referencia, fonte: q.fonte,
  resposta_modelo: q.resposta_modelo, pontos_chave: q.pontos_chave, criterios_correcao: q.criterios_correcao,
  origem_geracao: 'ia_assistida',
  alternativas: q.alternativas.map((a, i) => ({ letra: a.letra, texto: a.texto, correta: a.correta, ordem: i + 1 })),
  tema_ids: [],
}));

const prova = {
  nome, tipo: 'faculdade', origem: 'faculdade', formato: 'nacional', rede: 'afya',
  faculdade_id: faculdadeId, periodo: Number(periodo), subtipo, subtipo_nacional: subtipo,
  disciplina_id: disciplinaId, publicada: false, arquivada: false,
};

const tag = '$json$';
const sql = `select set_config('request.jwt.claims', json_build_object('sub', '${adminId}')::text, false);

select row_to_json(r) as resultado
from public.admin_criar_prova_com_questoes(
  p_prova := ${tag}${JSON.stringify(prova)}${tag}::jsonb,
  p_questoes_novas := ${tag}${JSON.stringify(questoesNovas)}${tag}::jsonb
) r;
`;
writeFileSync(out, sql, 'utf-8');
console.log(`✓ ${questoesNovas.length} questões (${questoesNovas.filter((q) => q.formato === 'resposta_aberta_curta').length} discursivas)`);
console.log(`SQL escrito em: ${out}`);
```

Rode para cada prova:

```powershell
node montar-sql.mjs "scripts\importar-prova-devolutiva\.trabalho\<slug>" `
  --nome "N1 <SIGLA> <período romano> <ano.semestre>" `
  --subtipo N1 --periodo <PERIODO> `
  --disciplina-id <uuid-da-disciplina> --admin-id <seu-uuid> --faculdade-id <uuid-afya> `
  --out "<slug>.sql"
```

## 3. Rodar o SQL — teste 1 primeiro, depois o lote

**Não use `mcp__supabase__execute_sql` colando o conteúdo do arquivo.** Isso força o modelo a
"retranscrever" um blob de 15-20KB dentro da própria chamada de tool, e retranscrição de texto
grande corrompe silenciosamente — um caso real: `"250mg\\dL"` (barra invertida escapada,
JSON válido) virou `"250mg\dL"` na retranscrição (escape inválido, Postgres rejeitou o insert
inteiro) e num outro caso uma questão inteira saiu com alternativas erradas e gabarito trocado,
sem erro nenhum — só foi pego numa auditoria de conteúdo depois.

Use `supabase db query --linked -f <arquivo>.sql` (CLI já vem com o projeto linkado — confirme com
`npx supabase projects list`). Ele lê o arquivo do disco e manda pro banco sem passar pelo
contexto do modelo — elimina essa classe inteira de erro:

```powershell
npx supabase db query --linked -f "<slug>.sql" -o json
```

**Rode uma prova primeiro**, confira o resultado (o próprio `-o json` já devolve a linha
`resultado` com `id`, `qtd_questoes`, `publicada`):

```sql
select p.nome, p.qtd_questoes, p.publicada,
  (select count(*) from prova_questao pq where pq.prova_id = p.id) as vinculadas,
  (select count(*) from questao q join prova_questao pq on pq.questao_id = q.id
     where pq.prova_id = p.id and q.formato = 'resposta_aberta_curta') as discursivas
from prova p where p.id = '<id-retornado>';
```

`vinculadas` deve bater com `qtd_questoes`, `discursivas` deve bater com o número de questões
abertas da prova (normalmente 2 por prova, mas confira o manifesto da prova em vez de assumir).
Se bateu, siga para as demais provas do mesmo jeito. Se alguma prova tiver conteúdo idêntico a
outra já processada (checagem da seção 1), não repita o insert.

Se em algum momento faltar contexto sobre o que cada campo da RPC espera, a definição completa
está disponível via:

```sql
select pg_get_functiondef(oid) from pg_proc where proname = 'admin_criar_prova_com_questoes';
```

Para lotes grandes, um loop de PowerShell chamando `npx supabase db query --linked -f` por prova
resolve sozinho, sem gastar contexto do modelo por prova — não precisa de subagent para isso
especificamente (o motivo de delegar antes era evitar retranscrição, que este comando já resolve).

## 3.5. Auditoria de conteúdo — obrigatória antes de considerar a importação concluída

Mesmo rodando por arquivo (sem retranscrição), confira o conteúdo gravado contra a fonte — não só
a contagem de questões. Gere dois JSONs por prova e compare:

1. **Esperado**: rode `parseBlocos` sobre `saida/prova.md` (mesmo truque da seção 2) e monte um
   mapa `{ fonte: { enunciado, enunciado_apoio, explicacao, referencia, resposta_modelo,
   alternativas: [{letra, texto, correta}] } }`, normalizando espaços.
2. **Real**: rode via `supabase db query --linked -f` uma query que traga, por prova_id, `fonte`,
   os mesmos campos da tabela `questao`, e as alternativas em `jsonb_agg` ordenadas por letra —
   grave com `-o json` num arquivo.
3. Compare os dois por `fonte`, campo a campo, incluindo o par `(letra, correta)` de cada
   alternativa. Só declare a prova íntegra depois disso bater 100%.

## 4. Ao final: relatório de imagens pendentes

Depois de todas as provas inseridas, rode (ou já tenha rodado) `gerar.mjs` de cada uma — ele
imprime, e grava em `saida/PENDENCIAS.md`, a seção "Questões com imagem" com: número da questão,
gabarito, trecho do enunciado para buscar no `/admin/questoes`, e se a imagem sobreviveu no PDF
(`saida/imagens/`) ou precisa vir da fonte original.

Monte uma lista consolidada, **prova por prova, questão por questão**, algo como:

```
| prova | questão | gabarito | buscar por | imagem no PDF? |
|---|---|---|---|---|
| HAM VI (2025.2) | Q04 | C | "trecho do enunciado..." | não — buscar na fonte |
```

Essa é a lista que o usuário repassa para quem cuida da imagem das provas — não esqueça de avisar
também: `/admin/importar` não vincula questão a prova (já resolvido aqui, pois você criou
prova+questões juntas pela RPC), mas se alguma disciplina/tema ficou vazia, mencione que segue
vazia de propósito (o relatório não traz), e quantas discursivas entraram sem `PONTOS_CHAVE`
(campo vazio por padrão — quem for usar em simulado corrigido pela Aurora deve preencher à mão em
`/admin/questoes`).

## 5. Fechamento

- Adicione ao `.gitignore` as pastas de PDF de origem que ainda não estiverem cobertas (padrões já
  existentes: `/HAM */`, `/IESC */`, `/SOI */`, `/CC */` — se aparecer disciplina nova, adicione o
  padrão dela também, ex. `/CI */`). Os PDFs trazem nome de aluno no cabeçalho, nunca versionar.
- Atualize `scripts/importar-prova-devolutiva/README.md`, seção "Estado das importações", com uma
  nova entrada datada confirmando que as provas foram gravadas no banco (não só geradas em
  markdown) — siga o formato das seções anteriores.
- Rode `limpar.mjs <dir> --raiz` em cada diretório de trabalho só depois de confirmar no banco que
  a prova está lá — não antes.
