
# Frontend — CLAUDE.md

## Comandos

```bash
ng serve             # dev em localhost:4200
ng build             # build de produção
ng lint              # lint
ng test              # testes unitários (Karma/Jasmine)
ng generate component # gerar componente
npm run storybook    # Storybook em localhost:6006
npm run build-storybook  # build estático do Storybook
npx playwright test  # testes e2e
```

## Estrutura

```
src/
  app/
    (auth)/
      login/
        login.component.ts
        login.component.html
      cadastro/
        cadastro.component.ts
    (dashboard)/
      dashboard.component.ts       # layout com sidebar
      provas/
        provas-list.component.ts
        prova-detail.component.ts
      simulado/
        simulado-config.component.ts
        simulado-exec.component.ts
        simulado-result.component.ts
      historico/
        historico.component.ts
    core/
      guards/
        auth.guard.ts
      services/
        supabase.service.ts
        auth.service.ts
        simulado.service.ts
      interceptors/
    shared/
      components/                  # TODO componente aqui = obrigatório ter story
        questao-card/
          questao-card.component.ts
          questao-card.component.html
          questao-card.component.stories.ts
        alternativa-item/
          alternativa-item.component.ts
          alternativa-item.component.html
          alternativa-item.component.stories.ts
        simulado-header/
        resultado-summary/
        ui/                        # Button, Badge, Skeleton, Input
      pipes/
      directives/
  environments/
    environment.ts
    environment.prod.ts
```

## Storybook — Regra Obrigatória

* Todo componente em `shared/components/` DEVE ter um arquivo `.stories.ts`.
* Story cobre no mínimo: estado default, estado de loading (se aplicável), variações de props relevantes.
* Componentes de página (`(dashboard)/`, `(auth)/`) não precisam de story — apenas os de `shared/`.
* Rodar `npm run storybook` antes de abrir PR que adiciona ou modifica componentes compartilhados.

## Padrão de Componente

```ts
@Component({
  selector: 'app-questao-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './questao-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestaoCardComponent {
  questao = input.required<Questao>()
  numero = input.required<number>()
  onResponder = output<string>()
}
```

## Supabase Client

```ts
// Server Component / Server Action
import { createClient } from '@/lib/supabase/server'

// Client Component
import { createClient } from '@/lib/supabase/client'
```

## Regras

* Standalone components. Sem NgModule.
* Signals para estado: `signal()`, `computed()`, `effect()`.
* `input()` e `output()` em vez de `@Input()` / `@Output()`.
* `ChangeDetectionStrategy.OnPush` em todos os componentes.
* Sem `any`. Tipos em `src/app/core/models/`.
* Tailwind para todos os estilos. Sem CSS scoped salvo casos excepcionais.
* Mobile-first. Breakpoint principal: `md` (768px).
* Imagens de laboratório: skeleton durante loading, `max-w-lg w-full mx-auto rounded-lg`.
* Sorteio de questões: chamar `simulado.service.ts` que delega para RPC/Edge Function.

## Checklist de novo componente

* [ ] Arquivo kebab-case, classe PascalCase
* [ ] `standalone: true`
* [ ] `ChangeDetectionStrategy.OnPush`
* [ ] Props via `input()`, eventos via `output()`
* [ ] Sem `any`
* [ ] Mobile-first (testar em 375px)
* [ ] Story em `.stories.ts` (obrigatório para `shared/components/`)
* [ ] Loading state se buscar dados

## Variáveis de Ambiente

```ts
// environments/environment.ts
export const environment = {
  production: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
}
```
