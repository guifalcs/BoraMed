import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';

type LoginState = 'idle' | 'error' | 'loading';

@Component({
  selector: 'app-login',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './login.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly state = signal<LoginState>('idle');
}
