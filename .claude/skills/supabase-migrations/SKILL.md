---
name: supabase-migrations
description: Use when creating, modifying or troubleshooting Supabase database migrations. Covers naming, RLS policies, types generation and the local-to-staging-to-prod workflow.
---

# Supabase Migrations

## Criar uma migration

```bash
supabase migration new nome_descritivo
```

Isso gera um arquivo em `supabase/migrations/TIMESTAMP_nome_descritivo.sql`.

## Regras

1. Nome descritivo em snake_case: `create_tasks_table`, `add_status_to_tasks`, `create_rls_for_tasks`
2. NUNCA editar uma migration já aplicada — criar nova migration corretiva
3. Toda tabela DEVE ter RLS habilitado
4. Toda tabela DEVE ter `created_at` e `updated_at` com default `now()`
5. Foreign keys com `ON DELETE` explícito (CASCADE, SET NULL ou RESTRICT)
6. Usar `IF NOT EXISTS` quando seguro para idempotência
7. Campos com valores pré-definidos (selects, status, tipos) DEVEM usar enum do PostgreSQL. Criar o enum antes da tabela na mesma migration. Ex: `CREATE TYPE task_status AS ENUM ('aberta', 'em_andamento', 'concluida', 'atrasada');`

## Template de tabela

```sql
CREATE TABLE IF NOT EXISTS public.{{table_name}} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- campos aqui
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.{{table_name}} ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own records"
  ON public.{{table_name}}
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own records"
  ON public.{{table_name}}
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

## Workflow

1. Criar migration: `supabase migration new descricao`
2. Escrever SQL
3. Testar local: `supabase db reset`
4. Gerar tipos: `supabase gen types typescript --local > frontend/src/app/core/types/database.types.ts`
5. Push para staging: `supabase db push --project-ref {{SUPABASE_DEV_REF}}`
6. Produção: APENAS via GitHub Actions após merge na main
