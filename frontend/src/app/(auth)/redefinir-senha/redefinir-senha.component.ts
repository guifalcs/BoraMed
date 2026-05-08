import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { resetPasswordSchema } from '../../core/models/auth.schemas';

type RedefinirSenhaState = 'idle' | 'error' | 'loading' | 'success';

@Component({
  selector: 'app-redefinir-senha',
  imports: [RouterLink, UiButtonComponent, UiInputComponent],
  templateUrl: './redefinir-senha.component.html',
  styleUrls: ['../auth-layout.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedefinirSenhaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(NotificationService);

  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly state = signal<RedefinirSenhaState>('idle');
  protected readonly fieldErrors = signal<Partial<Record<string, string>>>({});

  protected readonly passwordError = computed<string | null>(() => this.fieldErrors()['password'] ?? null);
  protected readonly confirmError = computed<string | null>(() => this.fieldErrors()['confirmPassword'] ?? null);

  protected async handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.fieldErrors.set({});

    const parsed = resetPasswordSchema.safeParse({
      password: this.password(),
      confirmPassword: this.confirmPassword(),
    });

    if (!parsed.success) {
      const errors: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (!errors[field]) errors[field] = issue.message;
      }
      this.fieldErrors.set(errors);
      this.state.set('error');
      return;
    }

    this.state.set('loading');
    const result = await this.auth.resetPassword(parsed.data);

    if (result.ok) {
      this.toast.success('Senha redefinida com sucesso!');
      this.state.set('success');
      setTimeout(() => void this.router.navigate(['/login']), 2000);
    } else {
      this.fieldErrors.set({ password: 'Erro ao redefinir senha. Tente novamente.' });
      this.state.set('error');
    }
  }
}
