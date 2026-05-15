import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { UiButtonComponent } from '../ui/button/ui-button.component';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [UiIconComponent, UiButtonComponent],
  templateUrl: './empty-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  titulo = input.required<string>();
  descricao = input<string | null>(null);
  icone = input<LucideIconData | null>(null);
  ilustracao = input<string | null>(null);
  labelBotao = input<string | null>(null);

  acao = output<void>();
}
