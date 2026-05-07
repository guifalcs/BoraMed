Implemente a seguinte feature completa, seguindo o workflow abaixo rigorosamente:

**Feature:** $ARGUMENTS

---

## ETAPA 1 — Planejamento
Use o subagente architect para analisar o codebase e gerar um plano de implementação.
Apresente o plano ao usuário e PARE. Aguarde aprovação antes de prosseguir.

## ETAPA 2 — Frontend (visual)
Use o subagente implementer para criar os componentes Angular com dados mockados/estáticos.
Crie as stories no Storybook para cada componente novo.
Faça commit: `feat({{escopo}}): frontend - {{descrição}}`
PARE e peça ao usuário para testar o frontend. Aguarde aprovação.

## ETAPA 3 — Backend
Use o subagente implementer para criar migrations, RLS policies e Edge Functions.
Rode `supabase db reset` para validar as migrations localmente.
Faça commit: `feat({{escopo}}): backend - {{descrição}}`
PARE e peça ao usuário para validar o backend. Aguarde aprovação.

## ETAPA 4 — Integração
Use o subagente implementer para conectar o frontend ao backend real.
Substitua dados mockados por chamadas ao Supabase.
Faça commit: `feat({{escopo}}): integração frontend-backend`
PARE e peça ao usuário para testar o fluxo completo. Aguarde aprovação.

## ETAPA 5 — Testes
Use o subagente tester para escrever testes unitários e E2E.
Rode todos os testes e reporte o resultado.
Faça commit: `test({{escopo}}): testes unitários e e2e`

## ETAPA 6 — Review
Use o subagente reviewer para analisar todo o código produzido.
Apresente o relatório de review ao usuário.
Se houver issues críticas ou importantes, corrija antes de prosseguir.

## ETAPA 7 — Finalização
Faça push da branch e abra PR para main.
Adicione uma entrada no CHANGELOG.md com: data, tipo (Feature), resumo do que foi feito, e hash do último commit.

IMPORTANTE: NUNCA pule etapas. NUNCA prossiga sem aprovação explícita do usuário nas etapas 1, 2, 3 e 4.
