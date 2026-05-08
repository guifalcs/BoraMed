import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { signupSchema } from '../../core/models/auth.schemas';

type CadastroState = 'idle' | 'error' | 'loading' | 'success';

@Component({
  selector: 'app-cadastro',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './cadastro.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CadastroComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly state = signal<CadastroState>('idle');
  protected readonly fieldErrors = signal<Partial<Record<string, string>>>({});

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.fieldErrors.set({});

    const parsed = signupSchema.safeParse({
      fullName: this.fullName(),
      email: this.email(),
      password: this.password(),
      confirmPassword: this.confirmPassword(),
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

  protected async handleGoogleSignIn(): Promise<void> {
    this.state.set('loading');
    const result = await this.auth.signInWithGoogle();
    if (!result.ok) {
      this.fieldErrors.set({ email: 'Erro ao entrar com Google. Tente novamente.' });
      this.state.set('error');
    }
  }
}
