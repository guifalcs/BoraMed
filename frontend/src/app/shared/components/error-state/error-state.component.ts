import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { UiButtonComponent } from '../ui/button/ui-button.component';

export interface ErrorStateAcao {
  label: string;
  variant: 'primary' | 'secondary';
  tipo: string;
}

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [UiIconComponent, UiButtonComponent],
  templateUrl: './error-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  codigo = input<string | null>(null);
  titulo = input.required<string>();
  mensagem = input.required<string>();
  detalhe = input<string | null>(null);
  icone = input<LucideIconData | null>(null);
  ilustracao = input<string | null>(null);
  acoes = input<ErrorStateAcao[]>([]);

  acaoClick = output<string>();

  protected readonly badgeClasses = computed<string>(() => {
    const base = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';
    switch (this.codigo()) {
      case '404': return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
      case '403': return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
      case '500': return `${base} bg-red-50 text-red-700 border border-red-200`;
      default:    return `${base} bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]`;
    }
  });
}
