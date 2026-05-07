---
applyTo: "supabase/**"
---

# Supabase Guidelines

- Migration names: `YYYYMMDD_description.sql`
- Never edit applied migrations — create corrective ones
- RLS enabled on every table, no exceptions
- Edge Functions: validate all inputs, handle errors, check auth
- Use parameterized queries, never string concatenation
- After schema changes: `supabase gen types typescript --local`
