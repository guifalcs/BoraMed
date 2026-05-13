import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ShieldAlert } from 'lucide-angular';
import { ErrorStateAcao, ErrorStateComponent } from '../../shared/components/error-state/error-state.component';

@Component({
  selector: 'app-sem-permissao',
  standalone: true,
  imports: [ErrorStateComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <app-error-state
        codigo="403"
        titulo="Acesso restrito"
        mensagem="Você não tem prontuário liberado para acessar essa área."
        [icone]="icone"
        [acoes]="acoes"
        (acaoClick)="onAcaoClick($event)"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SemPermissaoComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly icone = ShieldAlert;

  readonly acoes: ErrorStateAcao[] = [
    { label: 'Voltar', variant: 'secondary', tipo: 'voltar' },
    { label: 'Falar com suporte', variant: 'primary', tipo: 'suporte' },
  ];

  onAcaoClick(tipo: string): void {
    if (tipo === 'voltar') {
      this.location.back();
    } else if (tipo === 'suporte') {
      this.router.navigateByUrl('/dashboard/suporte');
    }
  }
}
