import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { BrandPanelComponent } from '../../shared/components/brand-panel/brand-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { loginSchema } from '../../core/models/auth.schemas';
import type { AuthErrorCode } from '../../core/models/auth.types';

type LoginState = 'idle' | 'error' | 'loading';

@Component({
  selector: 'app-login',
  imports: [RouterLink, UiButtonComponent, UiInputComponent, BrandPanelComponent],
  templateUrl: './login.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(NotificationService);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly state = signal<LoginState>('idle');
  protected readonly errorCode = signal<AuthErrorCode | null>(null);

  protected readonly emailError = computed<string | null>(() => {
    if (this.state() !== 'error') return null;
    const code = this.errorCode();
    if (code === 'EMAIL_NOT_CONFIRMED') return 'Confirme seu e-mail antes de entrar.';
    return null;
  });

  protected readonly passwordError = computed<string | null>(() => {
    if (this.state() !== 'error') return null;
    const code = this.errorCode();
    if (code === 'INVALID_CREDENTIALS') return 'E-mail ou senha incorretos.';
    if (code === 'RATE_LIMITED') return 'Muitas tentativas. Aguarde alguns minutos.';
    if (code === 'NETWORK_ERROR') return 'Erro de conexão. Tente novamente.';
    return 'Erro inesperado. Tente novamente.';
  });

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const parsed = loginSchema.safeParse({ email: this.email(), password: this.password() });
    if (!parsed.success) {
      this.errorCode.set('INVALID_CREDENTIALS');
      this.state.set('error');
      return;
    }

    this.state.set('loading');
    const result = await this.auth.login(parsed.data);

    if (result.ok) {
      this.toast.success('Bem-vindo de volta!');
      void this.router.navigate(['/dashboard']);
    } else {
      this.errorCode.set(result.error);
      this.state.set('error');
    }
  }

  protected async handleGoogleSignIn(): Promise<void> {
    this.state.set('loading');
    const result = await this.auth.signInWithGoogle();
    if (!result.ok) {
      this.errorCode.set(result.error);
      this.state.set('error');
    }
  }
}
