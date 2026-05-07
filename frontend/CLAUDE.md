
# Frontend — CLAUDE.md

## Comandos

```bash
npm run dev    # dev em localhost:3000
npm run build  # build de produção
npm run lint   # eslint
npx playwright test  # testes e2e
```

## Estrutura

```
src/
  app/
    (auth)/
      login/page.tsx
      cadastro/page.tsx
    (dashboard)/
      layout.tsx              # sidebar + header
      page.tsx                # home/dashboard
      provas/
        page.tsx              # lista de provas nacionais
        [id]/page.tsx         # prova específica
      simulado/
        novo/page.tsx         # configurador de simulado
        [id]/page.tsx         # execução do simulado
        [id]/resultado/page.tsx
      historico/page.tsx
  components/
    ui/                       # Button, Input, Card, Badge, Skeleton
    questao/
      questao-card.tsx
      alternativa-item.tsx
    simulado/
      simulado-header.tsx     # progresso + timer + finalizar
      configurador.tsx        # seletor de tema + quantidade
      resultado-summary.tsx
    layout/
      sidebar.tsx
      bottom-nav.tsx          # mobile
  lib/
    supabase/
      client.ts               # createBrowserClient
      server.ts               # createServerClient
    utils/
      simulado.ts             # lógica de sorteio, cálculo de nota
  types/
    index.ts                  # Questao, Alternativa, Simulado, Resultado...
```

## Supabase Client

```ts
// Server Component / Server Action
import { createClient } from '@/lib/supabase/server'

// Client Component
import { createClient } from '@/lib/supabase/client'
```

## Regras

* Sem `any`. Todos os tipos em `src/types/index.ts`.
* Mobile-first. Breakpoint principal: `md` (768px).
* Server Components por padrão. `'use client'` só para hooks/eventos.
* Server Actions em `actions.ts` dentro da pasta da feature.
* Validação de input com zod em toda Server Action.
* Imagens de laboratório: skeleton durante loading, `max-w-lg w-full mx-auto rounded-lg`.
* Lógica de sorteio de questões: sempre server-side (nunca expor IDs no cliente antes de responder).

## Checklist de novo componente

* [ ] Arquivo em kebab-case, componente exportado em PascalCase
* [ ] Props tipadas com interface (sem `any`)
* [ ] Mobile-first (testar em 375px)
* [ ] Loading state se buscar dados
* [ ] Sem lógica de negócio — delegar para `lib/utils/` ou Server Action

## Variáveis de Ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
