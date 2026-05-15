import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Award, Camera, Flame, LucideIconData, Medal, Shield, Trash2, Trophy } from 'lucide-angular';
import { UiAvatarComponent } from '../../shared/components/ui/avatar/ui-avatar.component';
import { UiButtonComponent } from '../../shared/components/ui/button/ui-button.component';
import { UiInputComponent } from '../../shared/components/ui/input/ui-input.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { updateProfileSchema, changePasswordSchema } from '../../core/models/profile.schemas';
import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { GamificacaoService } from '../../core/services/gamificacao.service';
import { ConquistaService } from '../../core/services/conquista.service';
import { NotificationService } from '../../core/services/notification.service';
import type { TipoUsuario } from '../../core/models/auth.types';

type FormStatus = 'idle' | 'loading' | 'success' | 'error';

const TIPO_USUARIO_OPTIONS: SelectOption<string>[] = [
  { value: 'estudante_medicina', label: 'Estudante de Medicina' },
  { value: 'medico',             label: 'Médico' },
  { value: 'residente',          label: 'Residente' },
  { value: 'cursinho',           label: 'Cursinho / Pré-vestibular' },
  { value: 'ensino_medio',       label: 'Ensino Médio' },
  { value: 'outro',              label: 'Outro' },
];

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
  private readonly profileService = inject(ProfileService);
  protected readonly auth = inject(AuthService);
  private readonly gamificacaoService = inject(GamificacaoService);
  private readonly conquistaService = inject(ConquistaService);
  private readonly toast = inject(NotificationService);

  protected readonly cameraIcon: LucideIconData = Camera;
  protected readonly trashIcon: LucideIconData = Trash2;
  protected readonly medalIcon: LucideIconData = Medal;
  protected readonly trophyIcon: LucideIconData = Trophy;
  protected readonly flameIcon: LucideIconData = Flame;
  protected readonly shieldIcon: LucideIconData = Shield;
  protected readonly awardIcon: LucideIconData = Award;
  protected readonly tipoUsuarioOptions = TIPO_USUARIO_OPTIONS;
  protected readonly periodoOptions = PERIODO_OPTIONS;

  // Derived from services
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly avatarUrl = computed(() => this.profileService.profile()?.avatar_url ?? null);
  protected readonly isProfileLoading = this.profileService.isLoading;
  protected readonly isAvatarLoading = signal(false);
  protected readonly isGamificacaoLoading = signal(true);
  protected readonly gamificacaoStats = this.gamificacaoService.stats;
  protected readonly conquistas = this.conquistaService.conquistas;
  protected readonly progressoNivel = computed(() => {
    const stats = this.gamificacaoStats();
    const xpInicioNivel = stats.nivel * stats.nivel * 100;
    const xpProximoNivel = (stats.nivel + 1) * (stats.nivel + 1) * 100;
    const faixa = xpProximoNivel - xpInicioNivel;
    const progresso = faixa > 0 ? ((stats.xp_total - xpInicioNivel) / faixa) * 100 : 0;
    return Math.max(0, Math.min(100, progresso));
  });
  protected readonly xpParaProximoNivel = computed(() => {
    const proximoNivel = this.gamificacaoStats().nivel + 1;
    return Math.max((proximoNivel * proximoNivel * 100) - this.gamificacaoStats().xp_total, 0);
  });
  protected readonly hasSenha = computed(
    () => this.auth.user()?.app_metadata?.['providers']?.includes('email') ?? false,
  );

  // Profile form state
  protected readonly nomeCompleto = signal('');
  protected readonly tipoUsuario = signal<TipoUsuario | null>(null);
  protected readonly periodo = signal<number | null>(null);
  protected readonly competirPublico = signal(true);
  protected readonly competirPublicoStatus = signal<FormStatus>('idle');
  protected readonly showPeriodo = computed(() => this.tipoUsuario() === 'estudante_medicina');
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
  protected readonly tipoUsuarioError = computed<string | null>(
    () => this.profileFieldErrors()['tipo_usuario'] ?? null,
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

  constructor() {
    void this.loadGamificacao();

    effect(() => {
      const p = this.profileService.profile();
      if (p) {
        this.nomeCompleto.set(p.nome_completo ?? '');
        this.tipoUsuario.set(p.tipo_usuario);
        this.periodo.set(p.tipo_usuario === 'estudante_medicina' ? p.periodo : null);
        this.competirPublico.set(p.competir_publico);
      }
    });
  }

  private async loadGamificacao(): Promise<void> {
    await Promise.all([
      this.gamificacaoService.getMeuXp(),
      this.conquistaService.listarMinhasConquistas(),
    ]);
    this.isGamificacaoLoading.set(false);
  }

  protected handleProfileSubmit(event: SubmitEvent): void {
    event.preventDefault();
    this.profileFieldErrors.set({});

    const parsed = updateProfileSchema.safeParse({
      nome_completo: this.nomeCompleto(),
      tipo_usuario: this.tipoUsuario(),
      periodo: this.showPeriodo() ? this.periodo() : null,
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
    void this.profileService.updateProfile(parsed.data).then((result) => {
      if (result.ok) {
        this.toast.success('Dados salvos com sucesso!');
        this.profileStatus.set('success');
        setTimeout(() => this.profileStatus.set('idle'), 3000);
      } else {
        this.toast.error(result.error);
        this.profileStatus.set('error');
      }
    });
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
    void this.profileService.changePassword(parsed.data).then((result) => {
      if (result.ok) {
        this.toast.success('Senha alterada com sucesso!');
        this.currentPassword.set('');
        this.newPassword.set('');
        this.confirmPassword.set('');
        this.passwordStatus.set('success');
        setTimeout(() => this.passwordStatus.set('idle'), 3000);
      } else {
        this.passwordFieldErrors.set({ currentPassword: result.error });
        this.passwordStatus.set('error');
      }
    });
  }

  protected handleAvatarUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toast.error('Apenas arquivos de imagem são permitidos.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('A imagem deve ter no máximo 5 MB.');
      return;
    }

    this.isAvatarLoading.set(true);
    void this.profileService.uploadAvatar(file).then((result) => {
      if (result.ok) {
        this.toast.success('Foto de perfil atualizada!');
      } else {
        this.toast.error(result.error);
      }
      input.value = '';
      this.isAvatarLoading.set(false);
    });
  }

  protected handleRemoveAvatar(): void {
    this.isAvatarLoading.set(true);
    void this.profileService.removeAvatar().then((result) => {
      if (result.ok) {
        this.toast.success('Foto de perfil removida.');
      } else {
        this.toast.error(result.error);
      }
      this.isAvatarLoading.set(false);
    });
  }

  protected handleTipoUsuarioChange(value: string | number | null): void {
    const tipo = typeof value === 'string' ? (value as TipoUsuario) : null;
    this.tipoUsuario.set(tipo);
    if (tipo !== 'estudante_medicina') {
      this.periodo.set(null);
    }
  }

  protected handlePeriodoChange(value: string | number | null): void {
    this.periodo.set(typeof value === 'number' ? value : null);
  }

  protected handleCompetirPublicoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    this.competirPublico.set(checked);
    this.competirPublicoStatus.set('loading');

    void this.profileService.updateCompetirPublico(checked).then((result) => {
      if (result.ok) {
        this.toast.success('Privacidade competitiva atualizada.');
        this.competirPublicoStatus.set('success');
        setTimeout(() => this.competirPublicoStatus.set('idle'), 2500);
      } else {
        this.competirPublico.set(!checked);
        this.toast.error(result.error);
        this.competirPublicoStatus.set('error');
      }
    });
  }

  protected formatNumber(value: number): string {
    return new Intl.NumberFormat('pt-BR').format(value);
  }
}
