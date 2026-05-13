import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ServerCrash } from 'lucide-angular';
import { ErrorStateAcao, ErrorStateComponent } from '../../shared/components/error-state/error-state.component';

@Component({
  selector: 'app-erro-servidor',
  standalone: true,
  imports: [ErrorStateComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <app-error-state
        codigo="500"
        titulo="Parada no servidor"
        mensagem="Nosso time já está aplicando o desfibrilador."
        [icone]="icone"
        [acoes]="acoes"
        (acaoClick)="onAcaoClick($event)"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErroServidorComponent {
  private readonly router = inject(Router);

  readonly icone = ServerCrash;

  readonly acoes: ErrorStateAcao[] = [
    { label: 'Tentar novamente', variant: 'primary', tipo: 'retry' },
    { label: 'Voltar ao início', variant: 'secondary', tipo: 'inicio' },
  ];

  onAcaoClick(tipo: string): void {
    if (tipo === 'retry') {
      window.location.reload();
    } else if (tipo === 'inicio') {
      this.router.navigateByUrl('/dashboard');
    }
  }
}
