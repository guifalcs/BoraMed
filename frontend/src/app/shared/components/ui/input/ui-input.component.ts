import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Eye, EyeOff, LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../icon/ui-icon.component';

export type UiInputType = 'text' | 'email' | 'password';
type StrengthTone = 'weak' | 'medium' | 'strong';

interface PasswordStrength {
  label: string;
  score: number;
  tone: StrengthTone;
}

@Component({
  selector: 'app-ui-input',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './ui-input.component.html',
  styleUrl: './ui-input.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiInputComponent {
  label = input.required<string>();
  name = input.required<string>();
  value = input('');
  type = input<UiInputType>('text');
  autocomplete = input<string | null>(null);
  placeholder = input('');
  error = input<string | null>(null);
  helperText = input<string | null>(null);
  labelActionText = input<string | null>(null);
  labelActionRouterLink = input<string | null>(null);
  showPasswordToggle = input(false);
  showStrength = input(false);
  required = input(false);

  valueChange = output<string>();

  protected readonly Eye: LucideIconData = Eye;
  protected readonly EyeOff: LucideIconData = EyeOff;
  protected readonly revealPassword = signal(false);
  protected readonly strengthSteps = [1, 2, 3, 4];
  protected readonly passwordStrength = computed(() => this.calculateStrength(this.value()));
  protected readonly effectiveType = computed(() => {
    if (this.type() !== 'password') {
      return this.type();
    }

    return this.revealPassword() ? 'text' : 'password';
  });

  protected handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.valueChange.emit(inputElement.value);
  }

  protected togglePassword(): void {
    this.revealPassword.update((value) => !value);
  }

  private calculateStrength(password: string): PasswordStrength {
    const score = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;

    if (score <= 1) {
      return { label: 'Senha fraca', score: 1, tone: 'weak' };
    }

    if (score <= 3) {
      return { label: 'Senha média', score, tone: 'medium' };
    }

    return { label: 'Senha forte', score, tone: 'strong' };
  }
}
