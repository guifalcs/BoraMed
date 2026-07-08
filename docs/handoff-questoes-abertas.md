# Handoff — Questões Abertas (Discursivas) com Correção por IA

**Branch:** `claude/open-ended-questions-plan-un8m3l` (pushed)
**Plano original:** `docs/plano-questoes-abertas-ia.md`
**Status:** Fases 1–7 implementadas, validadas manualmente (blocos A, B e C) e no
stack **local**. E2e Playwright **verde** (2026-07-08): os 2 testes de
`questoes-abertas.spec.ts` passam e a suíte chromium completa (34 testes) segue
verde. Falta: decidir merge e fazer deploy (migrations + edge function +
secrets de IA). **Nada foi para produção.**

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
```

### Edge function
`supabase/functions/corrigir-resposta-aberta/` + módulos compartilhados
`_shared/grading-provider.ts`, `_shared/grading-openai-compat.ts`, `_shared/grading-fake.ts`.

---

## Como rodar localmente (para continuar a validação)

```bash
# 1. Stack local + seed (cria admin, assinatura e 2 discursivas de Cardiologia)
npx supabase start
npx supabase db reset --local

# 2. Edge functions com o provider fake (correção determinística, sem rede)
#    confira AI_GRADING_PROVIDER=fake em supabase/functions/.env.local
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

### 2. Deploy (quando o dono decidir)
**Decisão em aberto (retomar em outra sessão):** qual modelo de IA usar no
provider real. Uma pesquisa de custo-benefício foi iniciada mas não concluída;
critérios a comparar: benchmarks de raciocínio/medicina (HealthBench, MedQA),
qualidade em pt-BR, JSON estruturado confiável e preço por correção — incluindo
opções fora do trio OpenAI/Anthropic/Google (DeepSeek, Qwen, Kimi, GLM, Mistral).
Sinais preliminares (não verificados a fundo): GLM e DeepSeek aparecem como
candidatos fortes de custo-benefício entre os open-weights; literatura de
LLM-as-judge valida a abordagem de correção com rubrica + resposta modelo.
Tudo foi feito **só no local**. Para produção:
- `supabase db push` das 6 migrations `20260707*`.
- `supabase functions deploy corrigir-resposta-aberta`.
- **Secrets de IA** ✅ já configurados no projeto remoto `gakvktwtdunljojghpff`
  (2026-07-08, via `supabase secrets set`; documentados em
  `supabase/functions/.env.local.example`):
  - `AI_GRADING_PROVIDER=openai-compat`
  - `AI_GRADING_BASE_URL=https://openrouter.ai/api/v1`
  - `AI_GRADING_MODEL=openai/gpt-4o-mini` ← **provisório**; trocar quando a
    pesquisa de modelo for concluída (só `secrets set`, sem redeploy)
  - `AI_GRADING_API_KEY` (chave do OpenRouter — rotacionável no painel)
  - `AI_GRADING_DAILY_LIMIT=200`
- Ao ativar o provider real, o **contrato de dados é idêntico ao fake** — muda só
  a qualidade do feedback. Vale um teste manual de fumaça com uma questão real.

### 3. Merge / PR
Branch pronta para revisão. Sugestão: abrir PR de
`claude/open-ended-questions-plan-un8m3l` → `main` após o e2e verde.

### 4. Itens fora de escopo desta feature (registrados no plano, não implementados)
- Nenhum backlog crítico. Desafio diário permanece sem discursivas por decisão (D14).

---

## Riscos conhecidos
1. **Regressão de grants via `db pull`** reexpõe `resposta_modelo`. Todas as
   migrations têm o header de aviso; verificação rápida:
   `set role authenticated; select resposta_modelo from questao limit 1;`
   → deve dar `permission denied`.
2. **`forcar_sem_ia` é porta de mão única** (timeout de 90s generoso mitiga).
3. **Custo de IA** em simulados grandes — caps de tamanho (3000 chars) e diário são as alavancas.
4. **`.env.local`** (gitignored) precisa de `AI_GRADING_PROVIDER=fake` para os testes locais de correção; se estiver vazio, a correção cai em `sem_ia`.
