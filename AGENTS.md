
# Projeto Med — AGENTS.md

## Stack

Next.js 14 App Router + TypeScript + Tailwind | Supabase | Vercel | Playwright

## Comandos

```bash
npm run dev          # dev local
npm run build        # build
npm run lint         # lint
npx supabase start   # supabase local (Docker)
npx supabase db push # migrations (DEV apenas)
npx playwright test  # testes e2e
```

## Convenções

* TypeScript strict. Sem `any`.
* kebab-case para arquivos, PascalCase para componentes.
* Server Components por padrão. `'use client'` só para interatividade.
* Server Actions em `actions.ts` dentro da pasta da feature.
* Commits em português: `tipo(escopo): descrição`
* Migrations: `YYYYMMDDHHMMSS_nome_descritivo.sql`

## Estrutura

```
frontend/src/app/          # rotas Next.js (App Router)
frontend/src/components/   # componentes reutilizáveis
frontend/src/lib/          # supabase client/server, utils
frontend/src/types/        # tipos TypeScript do domínio
supabase/migrations/       # migrations SQL com timestamp
supabase/functions/        # edge functions Deno
docs/                      # regras de negócio, arquitetura, design
```

## Módulos MVP

1. **Provas Nacionais** — provas antigas Afya, exibição e gabarito.
2. **Simulados Processuais** — filtro por tema + qtd, geração aleatória server-side.
3. **Simulados de Laboratório** — questões com imagens de lâminas/peças.

## Regras Críticas

* NUNCA editar migrations aplicadas.
* NUNCA fazer `db push` para produção manualmente.
* NUNCA expor service role key no frontend.
* RLS obrigatório em toda tabela nova.
* Questões de laboratório exigem `imagem_url`.
* Lógica de sorteio de questões: sempre server-side.
