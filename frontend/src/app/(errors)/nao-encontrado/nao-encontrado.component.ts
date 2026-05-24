import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ErrorStateAcao, ErrorStateComponent } from '../../shared/components/error-state/error-state.component';

@Component({
  selector: 'app-nao-encontrado',
  standalone: true,
  imports: [ErrorStateComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <app-error-state
        codigo="404"
        titulo="Página não diagnosticada"
        mensagem="A URL que você buscou não consta no prontuário do sistema."
ilustracao="illustrations/404.webp"
        [acoes]="acoes"
        (acaoClick)="onAcaoClick($event)"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NaoEncontradoComponent {
  private readonly router = inject(Router);

  readonly acoes: ErrorStateAcao[] = [
    { label: 'Voltar ao início', variant: 'primary', tipo: 'inicio' },
    { label: 'Ver simulados', variant: 'secondary', tipo: 'simulados' },
  ];

  onAcaoClick(tipo: string): void {
    if (tipo === 'inicio') {
      this.router.navigateByUrl('/dashboard');
    } else if (tipo === 'simulados') {
      this.router.navigateByUrl('/dashboard/simulados');
    }
  }
}
