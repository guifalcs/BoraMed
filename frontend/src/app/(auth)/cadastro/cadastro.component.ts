import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';

type CadastroState = 'idle' | 'error' | 'loading';

@Component({
  selector: 'app-cadastro',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './cadastro.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CadastroComponent {
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly state = signal<CadastroState>('idle');
}
