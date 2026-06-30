import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { BrandPanelComponent } from '../../shared/components/brand-panel/brand-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { recoverPasswordSchema } from '../../core/models/auth.schemas';

type RecuperarSenhaState = 'idle' | 'loading' | 'success';
type ResendState = 'idle' | 'loading' | 'sent' | 'error';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-recuperar-senha',
  imports: [RouterLink, UiButtonComponent, UiInputComponent, BrandPanelComponent],
  templateUrl: './recuperar-senha.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecuperarSenhaComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly email = signal('');
  protected readonly state = signal<RecuperarSenhaState>('idle');
  protected readonly resendState = signal<ResendState>('idle');
  protected readonly resendCooldown = signal(0);

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const parsed = recoverPasswordSchema.safeParse({ email: this.email() });
    if (!parsed.success) return;

    this.state.set('loading');
    await this.auth.recoverPassword(parsed.data);
    this.toast.success('Se este e-mail existir, o link de recuperação foi enviado.');
    this.state.set('success');
    this.startCooldown();
  }

  protected async handleResend(): Promise<void> {
    if (this.resendState() === 'loading' || this.resendCooldown() > 0) return;

    const parsed = recoverPasswordSchema.safeParse({ email: this.email() });
    if (!parsed.success) return;

    this.resendState.set('loading');
    const result = await this.auth.recoverPassword(parsed.data);

    if (result.ok) {
      this.resendState.set('sent');
      this.toast.success('Link de recuperação reenviado.');
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
}
