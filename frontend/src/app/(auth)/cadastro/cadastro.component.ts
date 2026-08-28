import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { UiSelectComponent } from '../../shared/components/ui/select/ui-select.component';
import { BrandPanelComponent } from '../../shared/components/brand-panel/brand-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { signupSchema } from '../../core/models/auth.schemas';
import { FACULDADE_UNIDADE_OPTIONS, type FaculdadeUnidade } from '../../core/models/faculdade-unidade';
import { SeoService } from '../../core/seo/seo.service';

type CadastroState = 'idle' | 'error' | 'loading' | 'success';
type ResendState = 'idle' | 'loading' | 'sent' | 'error';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-cadastro',
  imports: [RouterLink, UiButtonComponent, UiInputComponent, UiSelectComponent, BrandPanelComponent],
  templateUrl: './cadastro.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CadastroComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.seo.update({
      title: 'Criar conta grátis',
      description:
        'Crie sua conta grátis no BoraMed e treine para provas de medicina com simulados autorais, questões comentadas e revisão por desempenho.',
      path: '/cadastro',
    });
  }

  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly faculdadeUnidade = signal<FaculdadeUnidade | null>(null);
  protected readonly faculdadeUnidadeOptions = FACULDADE_UNIDADE_OPTIONS;
  protected readonly state = signal<CadastroState>('idle');
  protected readonly fieldErrors = signal<Partial<Record<string, string>>>({});
  protected readonly resendState = signal<ResendState>('idle');
  protected readonly resendCooldown = signal(0);

  protected handleFaculdadeUnidadeChange(value: string | number | null): void {
    this.faculdadeUnidade.set(typeof value === 'string' ? (value as FaculdadeUnidade) : null);
  }

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.fieldErrors.set({});

    const parsed = signupSchema.safeParse({
      fullName: this.fullName(),
      email: this.email(),
      password: this.password(),
      confirmPassword: this.confirmPassword(),
      faculdadeUnidade: this.faculdadeUnidade(),
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (!errors[field]) errors[field] = issue.message;
      }
      this.fieldErrors.set(errors);
      this.state.set('error');
      return;
    }

    this.state.set('loading');
    const result = await this.auth.signup(parsed.data);

    if (result.ok) {
      if (result.needsConfirmation) {
        this.toast.success('Conta criada! Verifique seu e-mail para ativar o acesso.');
        this.state.set('success');
        // O signup já disparou um e-mail; o Supabase bloqueia novo envio por ~60s.
        // Espelhar essa janela no botão evita um 429 imediato ao clicar em reenviar.
        this.startCooldown();
      } else {
        this.toast.success('Conta criada com sucesso!');
        void this.router.navigate(['/dashboard']);
      }
    } else {
      const errors: Record<string, string> = {};
      if (result.error === 'EMAIL_IN_USE') {
        errors['email'] = 'E-mail já cadastrado.';
      } else if (result.error === 'WEAK_PASSWORD') {
        errors['password'] = 'Senha não atende aos requisitos mínimos.';
      } else if (result.error === 'RATE_LIMITED') {
        errors['email'] = 'Muitas tentativas. Aguarde alguns minutos.';
      } else {
        errors['email'] = 'Erro inesperado. Tente novamente.';
      }
      this.fieldErrors.set(errors);
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
      this.fieldErrors.set({ email: 'Erro ao entrar com Google. Tente novamente.' });
      this.state.set('error');
    }
  }
}
