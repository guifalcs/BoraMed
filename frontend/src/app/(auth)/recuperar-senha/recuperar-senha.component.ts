import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';

type RecuperarSenhaState = 'idle' | 'loading' | 'success';

@Component({
  selector: 'app-recuperar-senha',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './recuperar-senha.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecuperarSenhaComponent {
  protected readonly email = signal('');
  protected readonly state = signal<RecuperarSenhaState>('idle');
}
