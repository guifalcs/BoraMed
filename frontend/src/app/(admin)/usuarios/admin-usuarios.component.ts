import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import type { Profile } from '../../core/models/auth.types';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [FormsModule, DatePipe, UiConfirmDialogComponent],
  templateUrl: './admin-usuarios.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsuariosComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly profileService = inject(ProfileService);

  protected readonly currentUserId = this.auth.user()?.id;
  protected readonly isSuperAdmin = computed(() => this.profileService.profile()?.papel === 'super_admin');

  protected readonly usuarios = signal<Profile[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly busca = signal('');
  protected readonly processando = signal<string | null>(null);
  protected readonly usuarioParaRevogar = signal<Profile | null>(null);
  protected readonly impersonando = signal(false);
  protected readonly usuarioParaImpersonar = signal<Profile | null>(null);

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarUsuarios(this.busca());
    if (result.ok) {
      this.usuarios.set(result.data);
    } else {
      this.toast.error('Erro ao carregar usuários.');
    }
    this.isLoading.set(false);
  }

  async onBusca(valor: string): Promise<void> {
    this.busca.set(valor);
    await this.carregar();
  }

  protected solicitarRevogar(usuario: Profile): void {
    this.usuarioParaRevogar.set(usuario);
  }

  protected cancelarRevogar(): void {
    this.usuarioParaRevogar.set(null);
  }

  async confirmarRevogar(): Promise<void> {
    const usuario = this.usuarioParaRevogar();
    if (!usuario) return;
    this.usuarioParaRevogar.set(null);
    await this.alterarPapel(usuario, 'aluno');
  }

  protected solicitarImpersonar(usuario: Profile): void {
    this.usuarioParaImpersonar.set(usuario);
  }

  protected cancelarImpersonar(): void {
    this.usuarioParaImpersonar.set(null);
  }

  async confirmarImpersonar(): Promise<void> {
    const usuario = this.usuarioParaImpersonar();
    if (!usuario) return;
    this.usuarioParaImpersonar.set(null);
    this.impersonando.set(true);

    const result = await this.adminService.gerarTokenImpersonacao(usuario.id);
    if (!result.ok) {
      this.toast.error('Erro ao gerar sessão: ' + result.error);
      this.impersonando.set(false);
      return;
    }

    const adminName =
      this.profileService.profile()?.nome_completo ??
      this.auth.user()?.email ??
      'Admin';

    this.profileService.clear();
    const impResult = await this.auth.impersonar(
      result.data.token_hash,
      result.data.target_name,
      adminName,
    );

    if (!impResult.ok) {
      this.toast.error('Erro ao entrar como usuário: ' + (impResult.error ?? ''));
      this.impersonando.set(false);
    }
  }

  protected tipoUsuarioLabel(tipo: string | null): string {
    const labels: Record<string, string> = {
      estudante_medicina: 'Estudante de Medicina',
      medico: 'Médico',
      residente: 'Residente',
      cursinho: 'Cursinho',
      ensino_medio: 'Ensino Médio',
      outro: 'Outro',
    };
    return tipo ? (labels[tipo] ?? tipo) : '—';
  }

  protected papelLabel(papel: string): string {
    if (papel === 'super_admin') return 'Super Admin';
    if (papel === 'admin') return 'Admin';
    return 'Aluno';
  }

  async alterarPapel(usuario: Profile, papel: 'aluno' | 'admin'): Promise<void> {
    if (this.processando()) return;
    this.processando.set(usuario.id);
    const result = await this.adminService.alterarPapelUsuario(usuario.id, papel);
    if (result.ok) {
      this.usuarios.update((lista) =>
        lista.map((u) => (u.id === usuario.id ? result.data : u)),
      );
      this.toast.success(`Papel de ${usuario.nome_completo ?? usuario.email} atualizado.`);
    } else {
      this.toast.error('Erro ao alterar papel.');
    }
    this.processando.set(null);
  }
}
