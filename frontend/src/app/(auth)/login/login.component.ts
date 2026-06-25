import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { BrandPanelComponent } from '../../shared/components/brand-panel/brand-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PrefetchService } from '../../core/services/prefetch.service';
import { loginSchema } from '../../core/models/auth.schemas';
import type { AuthErrorCode } from '../../core/models/auth.types';
import { SeoService } from '../../core/seo/seo.service';

type LoginState = 'idle' | 'error' | 'loading';
type ResendState = 'idle' | 'loading' | 'sent' | 'error';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-login',
  imports: [RouterLink, UiButtonComponent, UiInputComponent, BrandPanelComponent],
  templateUrl: './login.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(NotificationService);
  private readonly prefetch = inject(PrefetchService);
  private readonly seo = inject(SeoService);

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.seo.update({
      title: 'Entrar',
      description:
        'Acesse sua conta no BoraMed e continue treinando com simulados de medicina e questões comentadas no modelo das avaliações.',
      path: '/login',
    });
  }

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly state = signal<LoginState>('idle');
  protected readonly errorCode = signal<AuthErrorCode | null>(null);
  protected readonly resendState = signal<ResendState>('idle');
  protected readonly resendCooldown = signal(0);

  protected readonly showResend = computed(
    () => this.state() === 'error' && this.errorCode() === 'EMAIL_NOT_CONFIRMED',
  );

  protected readonly emailError = computed<string | null>(() => {
    if (this.state() !== 'error') return null;
    const code = this.errorCode();
    if (code === 'EMAIL_NOT_CONFIRMED') return 'Confirme seu e-mail antes de entrar.';
    return null;
  });

  protected readonly passwordError = computed<string | null>(() => {
    if (this.state() !== 'error') return null;
    const code = this.errorCode();
    // E-mail não confirmado já é sinalizado no campo de e-mail; não duplicar
    // com um erro genérico (e enganoso) no campo de senha.
    if (code === 'EMAIL_NOT_CONFIRMED') return null;
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
      this.prefetch.prefetchDashboardRoutes();
      void this.router.navigate(['/dashboard']);
    } else {
      this.errorCode.set(result.error);
      this.state.set('error');
    }
  }

  protected async handleResend(): Promise<void> {
    if (this.resendState() === 'loading' || this.resendCooldown() > 0) return;

    this.resendState.set('loading');
    const result = await this.auth.resendConfirmation(this.email());

    if (result.ok) {
      this.resendState.set('sent');
      this.toast.success('E-mail de confirmação reenviado.');
      this.startCooldown();
    } else {
      this.resendState.set('error');
      if (result.error === 'RATE_LIMITED') {
        this.toast.error('Muitas tentativas. Aguarde alguns minutos.');
        this.startCooldown();
      } else {
        this.toast.error('Não foi possível reenviar. Tente novamente.');
      }
    }
  }

  private startCooldown(): void {
    this.resendCooldown.set(RESEND_COOLDOWN_SECONDS);
    this.clearCooldownTimer();
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(next);
      if (next <= 0) this.clearCooldownTimer();
    }, 1000);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer !== null) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearCooldownTimer();
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
