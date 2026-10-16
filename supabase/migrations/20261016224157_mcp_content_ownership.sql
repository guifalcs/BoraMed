-- Marca os registros que Arthur criou pelo MCP. A tabela não é exposta para
-- leitura/escrita de clientes; somente a Edge Function com service role opera nela.
create table if not exists public.mcp_created_content (
  entity_type text not null check (entity_type in ('questao', 'prova', 'material', 'flashcard_deck')),
  entity_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

alter table public.mcp_created_content enable row level security;
revoke all on public.mcp_created_content from public, anon, authenticated;
grant all on public.mcp_created_content to service_role;

comment on table public.mcp_created_content is
  'Private ownership registry for records created through the authenticated BoraMed MCP. Mutations require a matching owner entry.';
