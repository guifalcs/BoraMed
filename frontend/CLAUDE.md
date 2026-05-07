
# Frontend — CLAUDE.md

## Comandos

```bash
ng serve             # dev em localhost:4200
ng build             # build de produção
ng lint              # lint
ng test              # testes unitários (Karma/Jasmine)
ng generate component # gerar componente
npm run storybook    # Storybook em localhost:6006
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
        provas-list.component.ts   # lista de provas nacionais
        prova-detail.component.ts  # execução da prova
      simulado/
        simulado-config.component.ts   # configurador
        simulado-exec.component.ts     # execução
        simulado-result.component.ts   # resultado
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
      components/
        questao-card/
        alternativa-item/
        simulado-header/
        resultado-summary/
        ui/                        # Button, Badge, Skeleton, Input
      pipes/
      directives/
  environments/
    environment.ts
    environment.prod.ts
```

## Padrão de Componente

```ts
// kebab-case no arquivo, PascalCase na classe
// questao-card.component.ts
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

## Regras

* Standalone components. Sem NgModule.
* Signals para estado: `signal()`, `computed()`, `effect()`.
* `input()` e `output()` em vez de `@Input()` / `@Output()`.
* `ChangeDetectionStrategy.OnPush` em todos os componentes.
* Sem `any`. Tipos em `src/app/core/models/`.
* Tailwind para todos os estilos. Sem CSS scoped salvo casos excepcionais.
* Mobile-first. Breakpoint principal: `md` (768px).
* Imagens de laboratório: skeleton durante loading, `max-w-lg w-full mx-auto rounded-lg`.
* Sorteio de questões: chamar `supabase.service.ts` que delega para RPC/Edge Function.

## Supabase Service

```ts
// core/services/supabase.service.ts
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  )

  get supabase() { return this.client }
}
```

## Checklist de novo componente

* [ ] Arquivo kebab-case, classe PascalCase
* [ ] `standalone: true`
* [ ] `ChangeDetectionStrategy.OnPush`
* [ ] Props via `input()`, eventos via `output()`
* [ ] Sem `any`
* [ ] Mobile-first
* [ ] Story no Storybook

## Variáveis de Ambiente

```ts
// environments/environment.ts
export const environment = {
  production: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
}
```
