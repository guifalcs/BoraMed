
# Supabase — CLAUDE.md

## Project Refs

```
DEV_REF:  (preencher após criar projeto no Supabase Cloud)
PROD_REF: (preencher após criar projeto no Supabase Cloud)
```

## Comandos

```bash
npx supabase start                        # inicia Docker local
npx supabase db reset                     # reseta e aplica todas as migrations
npx supabase migration new nome           # cria nova migration
npx supabase db push                      # aplica migrations (DEV apenas)
npx supabase functions serve              # roda edge functions localmente
npx supabase functions deploy nome        # deploy de edge function
npx supabase gen types typescript --local # gera tipos TS do schema
```

## Regras

* NUNCA editar migration já aplicada (commitada).
* NUNCA fazer `db push` para produção manualmente — apenas via CI.
* RLS obrigatório em toda tabela nova.
* Service role key: apenas em edge functions ou server-side. Nunca no frontend.
* Migrations em `migrations/`, edge functions em `functions/`.

## Schema — Projeto Med

```sql
-- Tipos
tipo_questao: 'nacional' | 'processual' | 'laboratorio'

-- Tabelas
tema (id, nome, periodo, tipo_questao)
questao (id, enunciado, tipo, periodo, tema_id, imagem_url, faculdade_afya, criado_em)
alternativa (id, questao_id, texto, correta, ordem)
prova (id, nome, tipo, periodo, ano, faculdade_afya)
prova_questao (prova_id, questao_id, ordem)
simulado (id, user_id, config_json, criado_em, finalizado_em)
simulado_questao (simulado_id, questao_id, ordem, resposta_dada, correta)
resultado (id, simulado_id, user_id, nota, tempo_gasto_segundos, criado_em)
```

## Storage

```
bucket: questoes-lab/
  <questao_id>/imagem.jpg
  Acesso: público (leitura) para usuários autenticados
```

## RLS — Padrão

```sql
-- Questões, temas, provas: leitura para qualquer usuário autenticado
auth.role() = 'authenticated'

-- Simulados e resultados: apenas o próprio aluno
auth.uid() = user_id
```

## Estrutura de Migration

```
supabase/
  migrations/
    20250501000000_create_temas.sql
    20250501000001_create_questoes.sql
    20250501000002_create_simulados.sql
    ...
  functions/
    gerar-simulado/
      index.ts
```

## Checklist ao criar nova tabela

* [ ] `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
* [ ] `criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
* [ ] Política de SELECT para usuários autenticados
* [ ] Política de INSERT/UPDATE/DELETE restrita ao `auth.uid()`
* [ ] Índice nas colunas de filtro frequente (tema_id, periodo, tipo)
