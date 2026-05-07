
# Projeto Med — AGENTS.md

## Stack

Angular 18+ (standalone, signals) + TypeScript + Tailwind | Supabase | Vercel | Playwright

## Comandos

```bash
ng serve             # dev em localhost:4200
ng build             # build de produção
ng lint              # lint
ng test              # testes unitários
npm run storybook    # Storybook em localhost:6006
npx supabase start   # supabase local (Docker)
npx supabase db push # migrations (DEV apenas)
npx playwright test  # testes e2e
```

## Convenções

* TypeScript strict. Sem `any`.
* Standalone components. Sem NgModule.
* Signals para estado reativo. Evitar RxJS para estado simples.
* `ChangeDetectionStrategy.OnPush` em todos os componentes.
* kebab-case para arquivos, PascalCase para componentes.
* Commits em português: `tipo(escopo): descrição`
* Migrations: `YYYYMMDDHHMMSS_nome_descritivo.sql`

## Estrutura

```
frontend/src/app/
  (auth)/            # login, cadastro
  (dashboard)/       # área logada
    provas/          # provas nacionais
    simulado/        # geração e execução
    historico/       # desempenho
  core/              # guards, interceptors, services globais
  shared/            # componentes, pipes, directives reutilizáveis
supabase/migrations/ # migrations SQL com timestamp
supabase/functions/  # edge functions Deno
docs/                # documentação de domínio
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
* Sorteio de questões: Supabase RPC ou Edge Function — nunca lógica no cliente.
