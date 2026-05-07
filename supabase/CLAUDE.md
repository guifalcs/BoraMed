
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

## Checklist ao criar nova tabela

* [ ] `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
* [ ] `criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
* [ ] Política de SELECT para usuários autenticados
* [ ] Política de INSERT/UPDATE/DELETE restrita ao `auth.uid()`
* [ ] Índice nas colunas de filtro frequente (tema_id, periodo, tipo)
