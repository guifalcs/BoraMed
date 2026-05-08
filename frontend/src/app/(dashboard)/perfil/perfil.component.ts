import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Camera, LucideIconData, Trash2 } from 'lucide-angular';
import { UiAvatarComponent } from '../../shared/components/ui/avatar/ui-avatar.component';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { updateProfileSchema, changePasswordSchema } from '../../core/models/profile.schemas';

type FormStatus = 'idle' | 'loading' | 'success' | 'error';

const PERIODO_OPTIONS: SelectOption<number>[] = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}º período`,
}));

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [UiAvatarComponent, UiButtonComponent, UiInputComponent, UiIconComponent, UiSelectComponent],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilComponent {
  protected readonly cameraIcon: LucideIconData = Camera;
  protected readonly trashIcon: LucideIconData = Trash2;
  protected readonly periodoOptions = PERIODO_OPTIONS;

  // Mock data
  protected readonly hasSenha = signal(true);
  protected readonly mockEmail = 'guilherme@example.com';
  protected readonly mockAvatarUrl = signal<string | null>(null);

  // Profile form state
  protected readonly nomeCompleto = signal('Guilherme Falcão');
  protected readonly periodo = signal<number | null>(5);
  protected readonly profileStatus = signal<FormStatus>('idle');
  protected readonly profileFieldErrors = signal<Partial<Record<string, string>>>({});

  // Password form state
  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordStatus = signal<FormStatus>('idle');
  protected readonly passwordFieldErrors = signal<Partial<Record<string, string>>>({});

  // Computed errors — profile
  protected readonly nomeCompletoError = computed<string | null>(
    () => this.profileFieldErrors()['nome_completo'] ?? null,
  );
  protected readonly periodoError = computed<string | null>(
    () => this.profileFieldErrors()['periodo'] ?? null,
  );

  // Computed errors — password
  protected readonly currentPasswordError = computed<string | null>(
    () => this.passwordFieldErrors()['currentPassword'] ?? null,
  );
  protected readonly newPasswordError = computed<string | null>(
    () => this.passwordFieldErrors()['newPassword'] ?? null,
  );
  protected readonly confirmPasswordError = computed<string | null>(
    () => this.passwordFieldErrors()['confirmPassword'] ?? null,
  );

  protected handleProfileSubmit(event: SubmitEvent): void {
    event.preventDefault();
    this.profileFieldErrors.set({});

    const parsed = updateProfileSchema.safeParse({
      nome_completo: this.nomeCompleto(),
      periodo: this.periodo(),
    });

    if (!parsed.success) {
      const errors: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (!errors[field]) errors[field] = issue.message;
      }
      this.profileFieldErrors.set(errors);
      this.profileStatus.set('error');
      return;
    }

    this.profileStatus.set('loading');
    setTimeout(() => {
      this.profileStatus.set('success');
      setTimeout(() => this.profileStatus.set('idle'), 3000);
    }, 600);
  }

  protected handlePasswordSubmit(event: SubmitEvent): void {
    event.preventDefault();
    this.passwordFieldErrors.set({});

    const parsed = changePasswordSchema.safeParse({
      currentPassword: this.currentPassword(),
      newPassword: this.newPassword(),
      confirmPassword: this.confirmPassword(),
    });

    if (!parsed.success) {
      const errors: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (!errors[field]) errors[field] = issue.message;
      }
      this.passwordFieldErrors.set(errors);
      this.passwordStatus.set('error');
      return;
    }

    this.passwordStatus.set('loading');
    setTimeout(() => {
      this.passwordStatus.set('success');
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      setTimeout(() => this.passwordStatus.set('idle'), 3000);
    }, 600);
  }

  protected handlePeriodoChange(value: string | number | null): void {
    this.periodo.set(typeof value === 'number' ? value : null);
  }
}
