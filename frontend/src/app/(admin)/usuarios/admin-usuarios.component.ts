import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import type { Profile } from '../../core/models/auth.types';

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  templateUrl: './admin-usuarios.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsuariosComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly usuarios = signal<Profile[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly busca = signal('');
  protected readonly processando = signal<string | null>(null);

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
