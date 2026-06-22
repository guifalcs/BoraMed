
# Supabase — CLAUDE.md

## Project Refs

```
PROD_REF: gakvktwtdunljojghpff   (NUNCA db push / seed de teste contra este ref)
DEV_REF:  branch de preview efêmero (criar sob demanda; ver docs/ambiente-testes-pagamento.md)
```

> Testes de pagamento: usar stack local (`supabase start`) ou um branch de preview
> com credenciais de TESTE do Mercado Pago. Detalhes em
> `docs/ambiente-testes-pagamento.md`.

## Comandos e Fluxo de Dev (Supabase Skill)

* Desenvolva as mudanças de banco iterando livremente via MCP (`execute_sql`) ou CLI (`npx supabase db query "SQL"`).
* Antes de commitar: verifique potenciais problemas rodando os alertas de segurança via MCP (`get_advisors`) ou CLI (`npx supabase db advisors`).
* Quando a estrutura final no banco local estiver correta e testada, extraia a migration definitiva: `npx supabase db pull <nome-descritivo> --local --yes`.

```bash
npx supabase start                        # inicia Docker local
npx supabase db query "SQL"               # executa SQL no banco local (para testar schemas)
npx supabase db pull nome --local --yes   # gera a migration do que foi alterado ("commit")
npx supabase db reset                     # reseta e aplica todas as migrations
npx supabase functions serve              # roda edge functions localmente
npx supabase functions deploy nome        # deploy de edge function
npx supabase gen types typescript --local # gera tipos TS do schema
```

## Regras

* NUNCA utilizar `supabase migration new` para escrever SQL na mão e tentar fazer push logo em sequência sem testar (anti-pattern)
* NUNCA editar migration já aplicada (commitada).
* Para Segurança, Auth, RLS e Views: Exija conformidade **estrita** com as regras estabelecidas na **Supabase Skill Oficial** (`.agents/skills/supabase/SKILL.md`). A skill é a fonte primária da verdade sobre regras e práticas seguras.
* Service role key: apenas em edge functions ou server-side. Nunca no frontend.
* Migrations em `migrations/`, edge functions em `functions/`.

## Checklist ao criar nova tabela

* [ ] `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
* [ ] `criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
* [ ] Política de SELECT para usuários autenticados
* [ ] Política de INSERT/UPDATE/DELETE restrita ao `auth.uid()`
* [ ] Índice nas colunas de filtro frequente (tema_id, periodo, tipo)
