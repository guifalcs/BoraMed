import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-impersonation-banner',
  standalone: true,
  templateUrl: './impersonation-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImpersonationBannerComponent {
  nomeUsuario = input.required<string>();
  carregando = input<boolean>(false);
  voltar = output<void>();

  protected onVoltar(): void {
    this.voltar.emit();
  }
}
