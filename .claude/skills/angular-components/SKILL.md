---

name: angular-components
description: Use ao criar ou modificar componentes, páginas ou serviços Angular. Ativa ao mencionar componente, página, rota, service, signal, standalone, template, binding.
---
## Padrão de Componente

```ts
// shared/components/questao-card/questao-card.component.ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Questao } from '@core/models'

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
  respondida = input<string | null>(null)
  responder = output<string>()
}
```

```html
<!-- questao-card.component.html -->
<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
  <span class="mb-3 inline-block rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
    {{ numero() }}
  </span>

  @if (questao().imagem_url) {
    <img
      [src]="questao().imagem_url"
      alt="Imagem da questão"
      class="mb-4 max-w-lg w-full mx-auto rounded-lg"
    />
  }

  <p class="mb-4 text-base font-medium text-gray-900">{{ questao().enunciado }}</p>

  <ul class="space-y-2">
    @for (alt of questao().alternativas; track alt.id) {
      <li>
        <button
          (click)="responder.emit(alt.id)"
          [class.border-blue-500]="respondida() === alt.id"
          [class.bg-blue-50]="respondida() === alt.id"
          class="w-full rounded-lg border border-gray-200 p-4 text-left text-sm hover:bg-gray-50"
        >
          {{ alt.texto }}
        </button>
      </li>
    }
  </ul>
</div>
```

## Padrão de Service

```ts
// core/services/simulado.service.ts
import { Injectable, inject, signal } from '@angular/core'
import { SupabaseService } from './supabase.service'
import { SimuladoConfig, Simulado } from '@core/models'

@Injectable({ providedIn: 'root' })
export class SimuladoService {
  private supabase = inject(SupabaseService).supabase

  simuladoAtivo = signal<Simulado | null>(null)

  async gerarSimulado(config: SimuladoConfig): Promise<Simulado> {
    const { data, error } = await this.supabase.rpc('gerar_simulado', { config })
    if (error) throw error
    this.simuladoAtivo.set(data)
    return data
  }
}
```

## Padrão de Rota

```ts
// app.routes.ts
export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
    children: [
      {
        path: 'simulado/novo',
        loadComponent: () => import('./simulado/simulado-config.component').then(m => m.SimuladoConfigComponent),
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent),
  },
]
```

## Storybook — Obrigatório para shared/components/

Todo componente em `shared/components/` deve ter um arquivo `.stories.ts` criado junto.
Sem story = componente incompleto.

```ts
// questao-card.component.stories.ts
import type { Meta, StoryObj } from '@storybook/angular'
import { QuestaoCardComponent } from './questao-card.component'

const meta: Meta<QuestaoCardComponent> = {
  component: QuestaoCardComponent,
  title: 'Simulado/QuestaoCard',
}
export default meta

type Story = StoryObj<QuestaoCardComponent>

export const Default: Story = {
  args: {
    numero: 1,
    questao: {
      id: '1',
      enunciado: 'Qual estrutura anatômica está indicada na lâmina?',
      imagem_url: null,
      alternativas: [
        { id: 'a', texto: 'Alternativa A', correta: false, ordem: 1 },
        { id: 'b', texto: 'Alternativa B', correta: true, ordem: 2 },
        { id: 'c', texto: 'Alternativa C', correta: false, ordem: 3 },
        { id: 'd', texto: 'Alternativa D', correta: false, ordem: 4 },
        { id: 'e', texto: 'Alternativa E', correta: false, ordem: 5 },
      ],
    },
  },
}

export const ComImagem: Story = {
  args: {
    ...Default.args,
    questao: {
      ...Default.args!.questao,
      imagem_url: 'https://placehold.co/600x400',
    },
  },
}

export const Respondida: Story = {
  args: {
    ...Default.args,
    respondida: 'b',
  },
}
```

## Regras

- Standalone components. Sem NgModule.
- `input()` e `output()` em vez de `@Input()` / `@Output()`.
- `ChangeDetectionStrategy.OnPush` em todos os componentes.
- Signals para estado local e compartilhado.
- `@if` / `@for` (nova sintaxe Angular 17+). Sem `*ngIf` / `*ngFor`.
- Lazy loading em todas as rotas via `loadComponent`.
- Sem lógica de negócio no componente — delegar para service.
- Tailwind para estilos. Sem CSS scoped salvo exceções justificadas.

## Checklist de novo componente em shared/

- [ ] `standalone: true`
- [ ] `ChangeDetectionStrategy.OnPush`
- [ ] Props via `input()`, eventos via `output()`
- [ ] Template com nova sintaxe (`@if`, `@for`)
- [ ] Sem `any`
- [ ] Story com Default + variações relevantes (obrigatório)
- [ ] Loading state se buscar dados

---
