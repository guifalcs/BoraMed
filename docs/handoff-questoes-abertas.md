# Handoff — Questões Abertas (Discursivas) com Correção por IA

**Branch:** `claude/open-ended-questions-plan-un8m3l` (pushed — HEAD `7bd4455`)
**Plano original:** `docs/plano-questoes-abertas-ia.md`
**Status:** Fases 1–7 implementadas, validadas manualmente (blocos A, B e C) e no
stack **local**. E2e Playwright **verde** (2026-07-08): os 2 testes de
`questoes-abertas.spec.ts` passam e a suíte chromium completa (34 testes) segue
verde. IA real (DeepSeek V4 Flash) validada por **smoke test direto na API**
(playground OpenRouter), mas **ainda não testada dentro do app** com provider
real. Falta: (1) teste manual no app com a IA real num PC limpo, (2) merge/PR,
(3) deploy (migrations + edge function). **Nada foi para produção.**

> **RETOMADA EM OUTRO PC (próxima sessão):** todo o código está pushado. O único
> arquivo que NÃO vem no clone é `supabase/functions/.env.local` (gitignored) —
> recrie-o pelo passo-a-passo da seção "Como rodar localmente" abaixo antes de
> testar. Sem ele com `AI_GRADING_PROVIDER=openai-compat` + chave, a correção
> cai em `sem_ia`.

---

## O que a feature entrega

Questões discursivas de ponta a ponta: cadastro no admin (manual, import markdown/IA,
conversão de fechada→aberta), execução em estudo e simulado, correção por IA com
nota 0–100 + feedback, revisão, histórico e métricas por pontos. **A IA é motor
adicional, não dependência**: sem IA o app continua funcionando (a questão vira
`sem_ia`, sai do denominador da nota, e a resposta padrão continua visível).

---

## Estado por fase (todas commitadas)

| Fase | Entrega | Commit principal |
|------|---------|------------------|
| F1 | Schema: colunas secretas em `questao` (`resposta_modelo`, `pontos_chave`, `criterios_correcao`), `enviada_em`/`pontos` em `tentativa_resposta`, tabela `resposta_correcao`; form admin "Discursiva" | `5e0dabd` |
| F2 | Edge function `corrigir-resposta-aberta` + `GradingProvider` (`openai-compat` / `fake`); 15 testes Deno | `eda4b97` |
| F3 | RPCs `salvar_resposta_texto`, `enviar_resposta_aberta`, `consolidar_correcoes_tentativa`, `get_status_correcoes`, `finalizar_tentativa` v2; 3 shared components (`resposta-aberta-input`, `correcao-feedback`, `resposta-padrao`); modo estudo | `34af6b1` |
| F4 | `gerar_simulado_personalizado` com formato de questão; tela de resultado bloqueante (poll + timeout 90s) | `e624439` |
| F5 | `get_revisao_*`, KPIs e desempenho por tema migrados para pontos; revisão renderiza discursivas | `9ea8f78` |
| F6 | Import markdown `FORMATO: aberta` + matriz de validação; conversão fechada→aberta; 7 specs do parser | `74a9fbd` |
| F7 | XP por pontos, desafio diário sem discursivas, impressão, docs (ADR-029, business-rules, security-audit) | `2564a63` |

**Ajustes pós-validação manual:**
- **Sessão 2026-07-08 (teste no app com IA real):**
  - **Bug do autosave discursivo (isolamento por questão):** o rascunho vazava
    entre questões (mesma instância de `RespostaAbertaInputComponent` reutilizada;
    signal `texto` stale) e um autosave pendente podia salvar na questão errada ao
    navegar. Correção: emit imediato do rascunho no filho (sem debounce interno) +
    reset do `texto` por `chave` (id da questão) + debounce da persistência movido
    para o pai (`tentativa-exec`), isolado por questão com id capturado em closure,
    com flush no `ngOnDestroy`.
  - **Identidade da IA (Aurora):** `correcao-feedback` agora tem persona — ícone
    Sparkles em círculo com `--gradient-brand`, "Corrigido por Aurora / IA
    corretora · BoraMed", e a identidade também nos estados corrigindo/erro/sem_ia.
    Nome exportado como `AGENTE_IA_NOME`.
  - **Disclaimer da correção (tooltip):** novo componente reutilizável
    `app-ui-info-tooltip` (ícone Info + balão no hover/foco, CSS puro, acessível)
    ao lado de "IA corretora · BoraMed". Texto em `AGENTE_IA_DISCLAIMER`
    (`correcao-feedback.component.ts`): a correção é apoio ao estudo (direção +
    pontos principais), não a oficial, e não reproduz os critérios exatos dos
    professores da Afya — com disclaimer de independência (regra de negócio Afya).
    Doc em `design-system.md`.
  - **Prompt — pontuação por comando do enunciado:** `montarPrompt` reforçado para
    exigir o formato pedido: "cite/liste" tolera explicação extra; "explique/
    justifique/descreva" penaliza quem só cita. Regra "na dúvida, mais rigoroso que
    leniente" e feedback deve declarar o desconto por formato.
  - **Métricas de gasto com IA no admin (Financeiro):** nova coluna
    `resposta_correcao.custo_usd` (custo real capturado de `usage.cost` do
    OpenRouter na edge function) + RPC `admin_get_metricas_ia()` (admin-only) com
    volume/tokens/custo por janelas (hoje/7d/30d/total), série diária 30d e quebra
    por modelo. UI: seção "Gasto com IA (Aurora)" em `(admin)/financeiro`.
    Migration `20260708120000_ia_custo_e_metricas.sql`. Correções feitas antes
    desta mudança ficam com `custo_usd` NULL (contam como 0); novas capturam o
    custo real.
- `98cfecd` — bloco A: visualização admin, cópia discursiva, badge do import, plural do botão.
- `652e782` — markdown na visualização, autor por email, cópia discursiva só preenche (não grava).
- `63da320` — contagem de temas por formato (corrige contradição "1 questão" vs "nenhuma"); feedback só no resultado do simulado.
- **(este commit)** — dados de teste no `seed.sql` + e2e Playwright.

---

## Arquitetura (resumo — detalhes em ADR-029 de `docs/architecture.md`)

- **Gabarito secreto:** `resposta_modelo`/`pontos_chave`/`criterios_correcao` sem
  SELECT grant para `authenticated` (modelo da migration `20260624125610`).
  Leitura só via RPC SECURITY DEFINER, mascarada como NULL em `modo='simulado'`.
- **Nota por pontos (sem backfill):** expressão canônica
  `coalesce(tr.pontos, (tr.correta)::int*100)`; nível tentativa
  `coalesce(t.pontos, t.acertos*100)` / `coalesce(t.total_pontuaveis, t.total_questoes)`.
  Threshold de "acerto" = pontos ≥ 70. `sem_ia` sai do denominador.
- **Correção:** edge function uma-resposta-por-chamada, claim idempotente,
  2 retries; provider por env; cap diário (`AI_GRADING_DAILY_LIMIT`).
- **Fluxo:** estudo = correção síncrona inline; simulado = envio definitivo +
  tela de resultado bloqueante (poll `get_status_correcoes` 3s, re-dispara
  paradas, consolida; timeout 90s força `sem_ia`).

### Migrations desta feature
```
20260707120000_abertas_schema_correcao_e_grants.sql
20260707130000_abertas_rpcs_resposta_e_nota_pontos.sql
20260707140000_abertas_simulado_personalizado.sql
20260707150000_abertas_revisao_e_metricas.sql
20260707160000_abertas_transversais.sql
20260707170000_abertas_contagem_temas_por_formato.sql
20260708120000_ia_custo_e_metricas.sql   # custo_usd + admin_get_metricas_ia (métricas de IA no admin)
20260708130000_equivalencia_e_revisao_conversao.sql  # grupo_equivalencia_id + revisao_conversao em questao
20260708140000_sorteio_dedup_e_rodizio_grupo.sql     # gerar_simulado_personalizado ciente de equivalência
```

### Edge function
`supabase/functions/corrigir-resposta-aberta/` + módulos compartilhados
`_shared/grading-provider.ts`, `_shared/grading-openai-compat.ts`, `_shared/grading-fake.ts`.

---

## Como rodar localmente (para continuar a validação)

### 0. Recriar o `.env.local` (obrigatório em PC limpo — arquivo é gitignored)
```bash
cd supabase/functions
cp .env.local.example .env.local   # já traz o bloco de IA preenchido com o modelo/rota
```
Depois edite `supabase/functions/.env.local`:
- **Mercado Pago** (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`): só se for testar
  pagamento; para testar questões abertas pode deixar como está.
- **IA — escolha um dos dois modos:**
  - **Real (DeepSeek V4 Flash)** para validar o app de verdade:
    ```
    AI_GRADING_PROVIDER=openai-compat
    AI_GRADING_BASE_URL=https://openrouter.ai/api/v1
    AI_GRADING_MODEL=deepseek/deepseek-v4-flash
    AI_GRADING_API_KEY=<sua chave sk-or-... do painel OpenRouter>
    AI_GRADING_ROUTER_ORDER=gmicloud,baidu,deepinfra,digitalocean,streamlake
    AI_GRADING_DAILY_LIMIT=200
    ```
    A chave **não** está no repo (é secret) — pegue em https://openrouter.ai/keys.
    Os mesmos valores já estão nos secrets do projeto remoto.
  - **Fake (determinístico, sem rede)** — obrigatório para os e2e Playwright:
    basta `AI_GRADING_PROVIDER=fake` (ignora as demais linhas de IA).

### 1–3. Subir o stack, functions e app
```bash
# 1. Stack local + seed (cria admin, assinatura e 2 discursivas de Cardiologia)
npx supabase start
npx supabase db reset --local

# 2. Edge functions (lê o .env.local do passo 0)
npx supabase functions serve --env-file ./supabase/functions/.env.local

# 3. App
cd frontend && ng serve
```

**Login:** `teste@boramed.com` / `Teste123!` (admin, assinatura ativa 90 dias).

O `seed.sql` agora persiste: promoção a admin, plano+assinatura, disciplina
CARDIO, 2 temas, 2 questões MC e **2 discursivas** (tríade de Charcot; resposta
rápida × lenta) com resposta modelo + pontos-chave, e o onboarding marcado como
concluído (para os e2e não travarem no tour).

### Comportamento do provider `fake`
Pontua pela cobertura **literal** dos pontos-chave (palavra ≥ 4 letras presente
na resposta). Ex.: escrever "febre, icterícia e dor em hipocôndrio direito,
colangite" cobre os 4 pontos → nota alta. Resposta vazia/sem relação → 0.

---

## Validação já feita

- **58 testes Deno** (handler da edge function) + **501 specs frontend** (Karma/Vitest) passando.
- **Smoke tests SQL** no stack local: nota mista, `sem_ia` no denominador, só-MC inline, contagem de temas por formato, XP por pontos.
- **Validação manual** (dono): bloco A (admin), bloco B (aluno/estudo/simulado com fake), bloco C (caminho sem IA / `sem_ia`). Tudo aprovado.
- **Segurança:** confirmado que `authenticated` recebe `permission denied` ao ler `resposta_modelo`.

---

## PRÓXIMOS PASSOS (para retomar)

### 1. Confirmar o e2e Playwright verde  ✅ feito (2026-07-08)
Os testes (`frontend/tests/e2e/questoes-abertas.spec.ts` +
`pages/montar-simulado.page.ts`), projeto **chromium** (backend local real + seed),
passam. Requer os 3 processos acima no ar (**functions com `fake`** é essencial):
```bash
cd frontend && npx playwright test questoes-abertas --project=setup --project=chromium
```

- O fix do onboarding no `seed.sql` funcionou. Um último ajuste foi necessário no
  teste do simulado: `getByRole('button', { name: 'Finalizar' })` batia por
  substring em "Finalizar prova" E "Finalizar" (strict mode violation engolida
  pelo `.catch`), então o diálogo de pendência nunca era confirmado. Corrigido
  escopando o botão dentro do `dialog "Finalizar prova?"` com `exact: true`.
- A suíte chromium completa também foi rodada: 34 passed, 11 skipped, 0 failed —
  o seed novo (2 discursivas) não regrediu os demais specs.
- Observação de CI: segundo o histórico, o CI usa o projeto `mocked`; estes
  testes são de backend real (como `simulados.spec.ts`) e rodam localmente. Se
  quiser cobertura em CI, avaliar subir o stack + functions no pipeline ou
  portar para o padrão `mocked` (mais frágil — mockaria todo o protocolo de correção).

### 2. Deploy (quando o dono decidir — DEPOIS do teste manual no app)
**Decisão do modelo: RESOLVIDA (2026-07-08) — `deepseek/deepseek-v4-flash`** via
OpenRouter, com roteamento de fallback por custo-benefício. Custo medido: ~US$
0,0003 por correção complexa (pior caso, em fallback) — irrisório em qualquer
volume realista; o `AI_GRADING_DAILY_LIMIT=200/usuário` cobre abuso.
**Pré-requisito antes de subir:** teste manual no app com a IA real (passo 3
abaixo) num PC limpo — o feedback só foi visto no playground, não dentro do app.
Depois disso, o deploy em produção é:
- `supabase db push` das 6 migrations `20260707*`.
- `supabase functions deploy corrigir-resposta-aberta`.
- **Secrets de IA** ✅ já configurados no projeto remoto `gakvktwtdunljojghpff`
  (2026-07-08, via `supabase secrets set`; documentados em
  `supabase/functions/.env.local.example`):
  - `AI_GRADING_PROVIDER=openai-compat`
  - `AI_GRADING_BASE_URL=https://openrouter.ai/api/v1`
  - `AI_GRADING_MODEL=deepseek/deepseek-v4-flash` ← escolhido pelo dono
    (2026-07-08). Custo-benefício: ~US$0,09/1M prompt + US$0,18/1M completion,
    contexto 1M. Smoke test direto na API OpenRouter aprovado (nota coerente em
    resposta boa/parcial/vazia + prompt injection ignorada). Trocar é só
    `secrets set`, sem redeploy.
  - `AI_GRADING_API_KEY` (chave do OpenRouter — rotacionável no painel)
  - `AI_GRADING_ROUTER_ORDER=gmicloud,baidu,deepinfra,digitalocean,streamlake`
    ← (novo) ordem de fallback de provider do OpenRouter, custo-benefício com
    preferência por fp8 (qualidade) sobre o fp4 mais barato do deepinfra. Slugs
    **minúsculos** (o nome de exibição não bate). Vazio = OpenRouter decide.
    Só `order`; `allow_fallbacks: true` é fixo no código.
- Ao ativar o provider real, o **contrato de dados é idêntico ao fake** — muda só
  a qualidade do feedback. Validado (2026-07-08) com 2 questões reais no
  playground: nota/feedback/pontos coerentes; prompt injection ignorada; custo
  ~US$0,0003 por correção complexa (pior caso, em fallback). **Nota de custo:**
  DeepInfra vive rate-limitado no pool compartilhado do OpenRouter — para grudar
  nele (cache quente + menor preço) usar BYOK (cadastrar chave própria do
  DeepInfra no OpenRouter). Sem isso, o fallback cobre e o custo segue irrisório.

### 3. Validar a IA real DENTRO DO APP (dono)  ⚠️ PRÓXIMO PASSO — PC limpo
O prompt/contrato atual está em
`supabase/functions/_shared/grading-openai-compat.ts:24` (`montarPrompt`):
persona "corretor de provas discursivas de medicina, rigoroso e justo",
temperatura 0, JSON `{pontos, feedback, pontos_atendidos, pontos_faltantes, erros}`.

**Já feito (2026-07-08):** smoke test do DeepSeek V4 Flash **direto na API**
(playground OpenRouter) com 2 questões (Charcot simples + caso clínico de CAD).
Notas justas (100 / 65), feedback pt-BR de bom tom, pontos atendidos/faltantes
corretos, erro do bicarbonato pego, prompt injection ignorada. Contrato JSON 100%
compatível com o parser.

**Falta (o que fazer no PC limpo):** ver esse mesmo feedback **renderizado dentro
do app**, respondendo discursivas de verdade em estudo e simulado, com o provider
real (passo 0 da seção "Como rodar localmente" → modo Real). Avaliar tom/justiça/
comprimento no contexto da UI e o fluxo completo (poll de correção no simulado,
`sem_ia` no timeout, revisão, histórico).
- Nuance de calibração observada no smoke test: um mesmo tema pode aparecer em
  `pontos_atendidos` E `pontos_faltantes` quando o aluno cobre a ideia geral mas
  não o específico (visto no caso de CAD: "correção gradual" creditada e "evitar
  edema cerebral" listada como faltante). Não é bug; se incomodar na UI, pedir no
  prompt que cada ponto apareça em uma lista só.
- Calibrar o prompt é só editar `montarPrompt` (estilo/tom). Mudar a ESTRUTURA
  do JSON (ex. nota por critério) mexe no schema `resposta_correcao` e na UI.

### 4. Painel de configurações de IA no admin (ideia do dono — avaliar/planejar)
O dono quer uma seção no admin dedicada às configurações da correção por IA,
para ele mesmo ajustar sem mexer em código/secrets. Candidatos a configuração:
modelo, prompt/persona, tom e tamanho do feedback, limite diário, threshold de
acerto (hoje 70), liga/desliga do provider. Exige decidir onde persistir
(tabela de config com RLS admin-only lida pela edge function, em vez de env
vars) — planejar antes de implementar.

### 5. Landing page: usar a IA como propaganda  ⚠️ pendente — próxima sessão
Atualizar os textos/seções da landing page para destacar a correção de questões
discursivas por IA como diferencial do produto (feedback individualizado por
resposta, estilo "corretor particular"). **Usar a skill `revenue-centric-design`**
para orientar copy/posicionamento/CRO.

### 6. Merge / PR
Branch pronta para revisão. Sugestão: abrir PR de
`claude/open-ended-questions-plan-un8m3l` → `main` (e2e já verde). O `gh` CLI
não está instalado na máquina — abrir pelo GitHub:
https://github.com/guifalcs/BoraMed/compare/main...claude/open-ended-questions-plan-un8m3l

### 7. Itens fora de escopo desta feature (registrados no plano, não implementados)
- Nenhum backlog crítico. Desafio diário permanece sem discursivas por decisão (D14).

---

## Gerenciamento de duplicatas aberta×fechada + revisão de conversão (2026-07-08)

Contexto: a base de produção é 100% fechada. Ao converter parte dela em discursivas
gêmeas, surgem duplicatas de conteúdo. Esta entrega é a **infra de gerenciamento**
(a conversão em massa em si ainda não foi executada — ver "Pendente" abaixo).

**Implementado (ADR-030):**
- **Schema** (`20260708130000`): `questao.grupo_equivalencia_id` (uuid) liga as
  gêmeas — questão lógica = `coalesce(grupo_equivalencia_id, id)`;
  `questao.revisao_conversao` (`'pendente'`/`'revisada'`/NULL) = flag discreta de
  curadoria. Ambas com SELECT grant por coluna (não são gabarito). Índices parciais.
- **Sorteio** (`20260708140000`): `gerar_simulado_personalizado` reescrito —
  dedup por grupo (`row_number() over (partition by grupo)`, nunca traz as duas
  gêmeas juntas) + rodízio agregando "entregues" por grupo lógico. Segue soft.
  Validado por SQL: 0 violações de dedup em 100 sorteios; gêmea da questão feita
  marcada `entregue=true`; smoke ponta-a-ponta do RPC em `misto` colapsa o par → 1.
- **Frontend admin (`(admin)/questoes`):** a cópia discursiva (`criarCopiaDiscursiva`)
  grava o grupo na gêmea e carimba a original quando ela não tinha grupo. Aba de
  questões ganhou contadores (total/fechadas/abertas/a revisar) clicáveis como
  quick-filters, badge "revisar" por linha e ação "✓ revisada". `admin.service`:
  `contarQuestoesPorFormato`, `marcarRevisaoConversao`, filtros `grupoFormato`/
  `revisaoConversao` em `listarQuestoes`.
- **Segurança:** advisor limpo; `resposta_modelo` segue `permission denied` para
  `authenticated` após o reset; colunas novas legíveis.

**Testes desta feature (persistidos, versionados):**
- **SQL** (`supabase/tests/equivalencia_sorteio_test.sql`): 3 casos determinísticos
  contra o stack local via RPC real — (1) dedup no `misto` (par gêmeo → 1 questão),
  (2) rodízio cross-format (fez a discursiva ⇒ a fechada gêmea sai quando há
  inéditas), (3) soft (sem inéditas, a gêmea vista reentra). Asserts via
  `RAISE EXCEPTION` (psql sai != 0 em falha). Rodar após `db reset --local`:
  `docker exec -i supabase_db_ProjetoMed psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/equivalencia_sorteio_test.sql`
- **Frontend (Vitest):** `admin.service.equivalencia.spec.ts` (contadores/marcação/
  filtros novos) + `admin-questoes.conversao.spec.ts` (a cópia discursiva vincula o
  grupo: cria+carimba a original quando não havia grupo, reusa quando havia, e
  questão avulsa não recebe grupo). Suíte total: **512 passando**.

**Decisões (dono, 2026-07-08):** vínculo por `grupo_equivalencia_id` (não self-FK);
flag em coluna dedicada `revisao_conversao` (não no enum `status`); rodízio soft
group-aware (não exclusão dura); discursiva convertida nasce **ativa** (a flag é só
lembrete, não bloqueia o aluno).

**Pendente (próxima sessão):** executar a **conversão em massa** das fechadas — um
script/RPC que, por questão fechada escolhida, cria a discursiva gêmea (resposta_modelo/
pontos_chave derivados da alternativa correta + explicação), `status='ativa'`,
mesmo `grupo_equivalencia_id` e `revisao_conversao='pendente'`. Definir o recorte
(todas? por disciplina/tema?) com o dono. A infra acima já suporta.

## Riscos conhecidos
1. **Regressão de grants via `db pull`** reexpõe `resposta_modelo`. Todas as
   migrations têm o header de aviso; verificação rápida:
   `set role authenticated; select resposta_modelo from questao limit 1;`
   → deve dar `permission denied`.
2. **`forcar_sem_ia` é porta de mão única** (timeout de 90s generoso mitiga).
3. **Custo de IA** em simulados grandes — caps de tamanho (3000 chars) e diário são as alavancas.
4. **`.env.local`** (gitignored) precisa de `AI_GRADING_PROVIDER=fake` para os testes locais de correção; se estiver vazio, a correção cai em `sem_ia`.
