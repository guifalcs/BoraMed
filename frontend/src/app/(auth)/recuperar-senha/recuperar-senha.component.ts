import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { recoverPasswordSchema } from '../../core/models/auth.schemas';

type RecuperarSenhaState = 'idle' | 'loading' | 'success';

@Component({
  selector: 'app-recuperar-senha',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './recuperar-senha.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecuperarSenhaComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);

  protected readonly email = signal('');
  protected readonly state = signal<RecuperarSenhaState>('idle');

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const parsed = recoverPasswordSchema.safeParse({ email: this.email() });
    if (!parsed.success) return;

    this.state.set('loading');
    await this.auth.recoverPassword(parsed.data);
    this.toast.success('Se este e-mail existir, o link de recuperação foi enviado.');
    this.state.set('success');
  }
}
