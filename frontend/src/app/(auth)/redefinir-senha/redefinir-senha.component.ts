import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';

type RedefinirSenhaState = 'idle' | 'error' | 'loading' | 'success';

@Component({
  selector: 'app-redefinir-senha',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './redefinir-senha.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedefinirSenhaComponent {
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly state = signal<RedefinirSenhaState>('idle');
}
