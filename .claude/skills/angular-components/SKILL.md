---
name: angular-components
description: Use when creating or modifying Angular components. Covers project structure, component patterns, signals, Storybook stories and the shared component library.
---

# Angular Components

## Estrutura de um componente

```
feature-name/
├── feature-name.component.ts       → Lógica
├── feature-name.component.html     → Template
├── feature-name.component.scss     → Estilos
└── feature-name.component.spec.ts  → Testes
```

## Antes de criar um componente

1. Verifique se já existe em `frontend/src/app/shared/components/`
2. Se existir, reutilize — NUNCA recrie
3. Se precisar de variação, estenda o componente existente com nova prop/input

## Template de componente (signals)

```typescript
import { Component, input, output, signal, computed } from '@angular/core';

@Component({
  selector: 'app-{{component-name}}',
  standalone: true,
  imports: [],
  templateUrl: './{{component-name}}.component.html',
  styleUrl: './{{component-name}}.component.scss'
})
export class {{ComponentName}}Component {
  // Inputs (substituem @Input)
  title = input.required<string>();
  variant = input<'primary' | 'secondary'>('primary');

  // Outputs (substituem @Output)
  clicked = output<void>();

  // State interno
  isLoading = signal(false);

  // Computed
  cssClass = computed(() => `btn-${this.variant()}`);
}
```

## Storybook — Toda componente nova precisa de story

```typescript
// frontend/src/stories/{{component-name}}.stories.ts
import type { Meta, StoryObj } from '@storybook/angular';
import { {{ComponentName}}Component } from '../app/shared/components/{{component-name}}/{{component-name}}.component';

const meta: Meta<{{ComponentName}}Component> = {
  title: 'Shared/{{ComponentName}}',
  component: {{ComponentName}}Component,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<{{ComponentName}}Component>;

export const Default: Story = {
  args: {
    title: 'Exemplo',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    title: 'Exemplo',
    variant: 'secondary',
  },
};
```

## Onde colocar

- **Reutilizável (botão, card, badge, input):** `shared/components/`
- **Service singleton:** `core/`
- **Específico de uma feature:** `features/{{feature-name}}/`
- **Layout de página:** `layouts/`
