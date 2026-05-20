import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ShieldAlert } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-impersonation-banner',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './impersonation-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImpersonationBannerComponent {
  nomeUsuario = input.required<string>();
  carregando = input<boolean>(false);
  voltar = output<void>();

  protected readonly shieldAlert = ShieldAlert;

  protected onVoltar(): void {
    this.voltar.emit();
  }
}
