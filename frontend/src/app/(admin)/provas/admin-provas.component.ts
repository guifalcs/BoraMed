import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminProva } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-admin-provas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-provas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProvasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly provas = signal<AdminProva[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly pagina = signal(0);
  protected readonly filtroTipo = signal('');
  protected readonly busca = signal('');

  protected readonly porPagina = 50;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarProvas(this.pagina(), this.porPagina, {
      tipo: this.filtroTipo() || undefined,
      busca: this.busca() || undefined,
    });
    if (result.ok) {
      this.provas.set(result.data.provas);
      this.total.set(result.data.total);
    } else {
      this.toast.error('Erro ao carregar provas.');
    }
    this.isLoading.set(false);
  }

  async aplicarFiltros(): Promise<void> {
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

  async deletar(prova: AdminProva): Promise<void> {
    if (!confirm(`Deletar "${prova.nome}"? Isso é irreversível.`)) return;
    const result = await this.adminService.deletarProva(prova.id);
    if (result.ok) {
      this.provas.update((lista) => lista.filter((p) => p.id !== prova.id));
      this.total.update((t) => t - 1);
      this.toast.success('Prova deletada.');
    } else {
      this.toast.error('Erro ao deletar prova.');
    }
  }

  protected get totalPaginas(): number {
    return Math.ceil(this.total() / this.porPagina);
  }

  protected get paginaAtual(): number {
    return this.pagina() + 1;
  }
}
