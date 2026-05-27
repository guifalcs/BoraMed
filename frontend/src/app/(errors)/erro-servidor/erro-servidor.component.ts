import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { ErrorStateAcao, ErrorStateComponent } from '../../shared/components/error-state/error-state.component';

@Component({
  selector: 'app-erro-servidor',
  standalone: true,
  imports: [ErrorStateComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <app-error-state
        codigo="500"
        titulo="Algo deu errado"
        mensagem="Ocorreu um erro inesperado. Tente novamente em alguns instantes."
        ilustracao="illustrations/erro-generico.webp"
        [acoes]="acoes"
        (acaoClick)="onAcaoClick($event)"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErroServidorComponent {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly acoes: ErrorStateAcao[] = [
    { label: 'Tentar novamente', variant: 'primary', tipo: 'retry' },
    { label: 'Voltar ao início', variant: 'secondary', tipo: 'inicio' },
  ];

  onAcaoClick(tipo: string): void {
    if (tipo === 'retry') {
      if (this.isBrowser) window.location.reload();
    } else if (tipo === 'inicio') {
      this.router.navigateByUrl('/dashboard');
    }
  }
}
