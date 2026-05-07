---
applyTo: "supabase/**"
---

# Supabase Guidelines

- Schema changes: Iterate freely using `execute_sql` (via MCP) or `supabase db query`. When ready, commit via `supabase db pull <name> --local --yes`.
- Prioritize Supabase MCP tools (`search_docs`, `execute_sql`, `get_advisors`) over raw CLI scripts.
- Never edit applied migrations — create corrective ones
- Security: Follow the exact Supabase Skill guidelines rigorously (RLS enabled on ALL exposed schemas, security invoker for Views, explicit SELECT + UPDATE policies, etc.).
- Edge Functions: validate all inputs, handle errors, check auth
- Use parameterized queries, never string concatenation
- After schema changes: `supabase gen types typescript --local`
