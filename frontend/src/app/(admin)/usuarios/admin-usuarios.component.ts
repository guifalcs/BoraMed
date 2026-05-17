import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
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

  protected readonly currentUserId = this.auth.user()?.id;

  protected readonly usuarios = signal<Profile[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly busca = signal('');
  protected readonly processando = signal<string | null>(null);
  protected readonly usuarioParaRevogar = signal<Profile | null>(null);

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
    return papel === 'admin' ? 'Admin' : 'Aluno';
  }

  async alterarPapel(usuario: Profile, papel: 'aluno' | 'admin'): Promise<void> {
    if (this.processando()) return;
    this.processando.set(usuario.id);
    const result = await this.adminService.alterarPapelUsuario(usuario.id, papel);
    if (result.ok) {
      this.usuarios.update((lista) =>
        lista.map((u) => (u.id === usuario.id ? { ...u, papel } : u)),
      );
      this.toast.success(`Papel de ${usuario.nome_completo ?? usuario.email} atualizado.`);
    } else {
      this.toast.error('Erro ao alterar papel.');
    }
    this.processando.set(null);
  }
}
