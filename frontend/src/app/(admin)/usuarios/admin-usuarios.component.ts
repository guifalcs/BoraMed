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
import { RouterLink } from '@angular/router';
import {
  Ban,
  BarChart3,
  Gift,
  LogIn,
  ShieldCheck,
  ShieldMinus,
  Undo2,
  XCircle,
} from 'lucide-angular';
import { AdminService } from '../../core/services/admin.service';
import type { UsuarioAdmin } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import type { Profile } from '../../core/models/auth.types';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import {
  assinaturaStatusLabel,
  papelLabel,
  tipoUsuarioLabel,
} from '../../shared/utils/admin-labels.util';

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, UiConfirmDialogComponent, UiIconComponent],
  templateUrl: './admin-usuarios.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsuariosComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);

  protected readonly currentUserId = computed(() => this.auth.user()?.id);
  protected readonly isSuperAdmin = computed(() => this.profileService.profile()?.papel === 'super_admin');

  protected readonly usuarios = signal<UsuarioAdmin[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly busca = signal('');
  protected readonly pagina = signal(0);
  protected readonly porPagina = 50;
  protected readonly processando = signal<string | null>(null);
  protected readonly usuarioParaRevogar = signal<Profile | null>(null);
  protected readonly impersonando = signal(false);
  protected readonly usuarioParaImpersonar = signal<Profile | null>(null);
  protected readonly usuarioParaBanir = signal<Profile | null>(null);
  protected readonly usuarioParaDesbanir = signal<Profile | null>(null);
  protected readonly motivoBanimento = signal('');
  protected readonly usuarioParaCortesia = signal<UsuarioAdmin | null>(null);
  protected readonly mesesCortesia = signal(12);
  protected readonly usuarioParaRevogarCortesia = signal<UsuarioAdmin | null>(null);
  protected readonly iconPromoverAdmin = ShieldCheck;
  protected readonly iconEntrarComo = LogIn;
  protected readonly iconRevogarAdmin = ShieldMinus;
  protected readonly iconSuspender = Ban;
  protected readonly iconReativar = Undo2;
  protected readonly iconCortesia = Gift;
  protected readonly iconMetricas = BarChart3;
  protected readonly iconRevogarCortesia = XCircle;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarUsuarios(
      this.busca(),
      this.pagina(),
      this.porPagina,
    );
    if (result.ok) {
      this.usuarios.set(result.data.usuarios);
      this.total.set(result.data.total);
    } else {
      this.toast.error('Erro ao carregar usuários.');
    }
    this.isLoading.set(false);
  }

  async onBusca(valor: string): Promise<void> {
    this.busca.set(valor);
    this.pagina.set(0);
    await this.carregar();
  }

  async paginaAnterior(): Promise<void> {
    if (this.pagina() === 0) return;
    this.pagina.update((p) => p - 1);
    await this.carregar();
  }

  async proximaPagina(): Promise<void> {
    if ((this.pagina() + 1) * this.porPagina >= this.total()) return;
    this.pagina.update((p) => p + 1);
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

  protected solicitarBanir(usuario: Profile): void {
    this.motivoBanimento.set('');
    this.usuarioParaBanir.set(usuario);
  }

  protected cancelarBanir(): void {
    this.usuarioParaBanir.set(null);
    this.motivoBanimento.set('');
  }

  protected solicitarDesbanir(usuario: Profile): void {
    this.usuarioParaDesbanir.set(usuario);
  }

  protected cancelarDesbanir(): void {
    this.usuarioParaDesbanir.set(null);
  }

  async confirmarImpersonar(): Promise<void> {
    const usuario = this.usuarioParaImpersonar();
    if (!usuario) return;
    this.usuarioParaImpersonar.set(null);
    this.impersonando.set(true);

    if (usuario.banido) {
      this.toast.error('Não é possível entrar como um usuário suspenso.');
      this.impersonando.set(false);
      return;
    }

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
      result.data.target_user_id,
      result.data.target_name,
      adminName,
    );

    if (!impResult.ok) {
      this.toast.error('Erro ao entrar como usuário: ' + (impResult.error ?? ''));
      this.impersonando.set(false);
    }
  }

  protected readonly tipoUsuarioLabel = tipoUsuarioLabel;
  protected readonly papelLabel = papelLabel;
  protected readonly assinaturaStatusLabel = assinaturaStatusLabel;

  protected get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total() / this.porPagina));
  }

  protected get paginaAtual(): number {
    return this.pagina() + 1;
  }

  protected podeBanir(usuario: Profile): boolean {
    return usuario.id !== this.currentUserId() && usuario.papel !== 'super_admin' && !usuario.banido;
  }

  protected podeDesbanir(usuario: Profile): boolean {
    return usuario.banido;
  }

  async alterarPapel(usuario: Profile, papel: 'aluno' | 'admin'): Promise<void> {
    if (this.processando()) return;
    this.processando.set(usuario.id);
    const result = await this.adminService.alterarPapelUsuario(usuario.id, papel);
    if (result.ok) {
      this.usuarios.update((lista) =>
        lista.map((u) => (u.id === usuario.id ? { ...u, ...result.data } : u)),
      );
      this.toast.success(`Papel de ${usuario.nome_completo ?? usuario.email} atualizado.`);
    } else {
      this.toast.error('Erro ao alterar papel.');
    }
    this.processando.set(null);
  }

  async confirmarBanir(): Promise<void> {
    const usuario = this.usuarioParaBanir();
    if (!usuario || this.processando()) return;

    this.usuarioParaBanir.set(null);
    this.processando.set(usuario.id);

    const result = await this.adminService.banirUsuario(usuario.id, this.motivoBanimento());
    if (result.ok) {
      this.usuarios.update((lista) =>
        lista.map((u) => (u.id === usuario.id ? { ...u, ...result.data } : u)),
      );
      this.toast.success(`${usuario.nome_completo ?? usuario.email} foi suspenso.`);
    } else {
      this.toast.error('Erro ao suspender usuário: ' + result.error);
    }

    this.motivoBanimento.set('');
    this.processando.set(null);
  }

  async confirmarDesbanir(): Promise<void> {
    const usuario = this.usuarioParaDesbanir();
    if (!usuario || this.processando()) return;

    this.usuarioParaDesbanir.set(null);
    this.processando.set(usuario.id);

    const result = await this.adminService.desbanirUsuario(usuario.id);
    if (result.ok) {
      this.usuarios.update((lista) =>
        lista.map((u) => (u.id === usuario.id ? { ...u, ...result.data } : u)),
      );
      this.toast.success(`${usuario.nome_completo ?? usuario.email} foi reativado.`);
    } else {
      this.toast.error('Erro ao reativar usuário: ' + result.error);
    }

    this.processando.set(null);
  }

  // ---- Acesso de cortesia (grátis) ----

  protected temCortesiaAtiva(usuario: UsuarioAdmin): boolean {
    return !!usuario.assinatura?.cortesia && !!usuario.assinatura?.ativa;
  }

  protected solicitarCortesia(usuario: UsuarioAdmin): void {
    this.mesesCortesia.set(12);
    this.usuarioParaCortesia.set(usuario);
  }

  protected cancelarCortesia(): void {
    this.usuarioParaCortesia.set(null);
  }

  async confirmarCortesia(): Promise<void> {
    const usuario = this.usuarioParaCortesia();
    if (!usuario || this.processando()) return;
    const meses = Math.max(1, Math.floor(this.mesesCortesia()));

    this.usuarioParaCortesia.set(null);
    this.processando.set(usuario.id);

    const result = await this.adminService.liberarAcessoGratuito(usuario.id, meses);
    if (result.ok) {
      this.toast.success(
        `Acesso gratuito liberado para ${usuario.nome_completo ?? usuario.email} por ${meses} ${meses === 1 ? 'mês' : 'meses'}.`,
      );
      await this.carregar();
    } else {
      this.toast.error('Erro ao liberar acesso gratuito: ' + result.error);
    }

    this.processando.set(null);
  }

  protected solicitarRevogarCortesia(usuario: UsuarioAdmin): void {
    this.usuarioParaRevogarCortesia.set(usuario);
  }

  protected cancelarRevogarCortesia(): void {
    this.usuarioParaRevogarCortesia.set(null);
  }

  async confirmarRevogarCortesia(): Promise<void> {
    const usuario = this.usuarioParaRevogarCortesia();
    if (!usuario || this.processando()) return;

    this.usuarioParaRevogarCortesia.set(null);
    this.processando.set(usuario.id);

    const result = await this.adminService.revogarAcessoGratuito(usuario.id);
    if (result.ok) {
      this.toast.success(`Cortesia de ${usuario.nome_completo ?? usuario.email} revogada.`);
      await this.carregar();
    } else {
      this.toast.error('Erro ao revogar cortesia: ' + result.error);
    }

    this.processando.set(null);
  }
}
