---
name: edge-functions
description: Use when creating or modifying Supabase Edge Functions. Covers structure, authentication, error handling, CORS and deployment.
---

# Supabase Edge Functions

## Criar uma Edge Function

```bash
supabase functions new nome-da-function
```

Cria em `supabase/functions/nome-da-function/index.ts`.

## Template padrão

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Criar cliente Supabase com token do usuário
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Validar input
    const body = await req.json()
    // ... validação aqui

    // Lógica da function
    // ...

    return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

## Regras

1. Sempre tratar CORS com preflight OPTIONS
2. Sempre verificar autenticação via header Authorization
3. Sempre validar inputs antes de processar
4. Sempre retornar JSON com Content-Type correto
5. Sempre tratar erros com try/catch e retornar status adequado
6. Nunca expor dados sensíveis em mensagens de erro

## Testar localmente

```bash
supabase functions serve nome-da-function
```

## Deploy

- Staging: `supabase functions deploy nome-da-function --project-ref {{SUPABASE_DEV_REF}}`
- Produção: APENAS via GitHub Actions
