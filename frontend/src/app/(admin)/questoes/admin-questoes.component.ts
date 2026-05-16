import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminQuestao } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-admin-questoes',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  templateUrl: './admin-questoes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuestoesComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly questoes = signal<AdminQuestao[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly pagina = signal(0);
  protected readonly filtroStatus = signal('');
  protected readonly busca = signal('');
  protected readonly processando = signal<string | null>(null);

  protected readonly porPagina = 50;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarQuestoes(this.pagina(), this.porPagina, {
      status: this.filtroStatus() || undefined,
      busca: this.busca() || undefined,
    });
    if (result.ok) {
      this.questoes.set(result.data.questoes);
      this.total.set(result.data.total);
    } else {
      this.toast.error('Erro ao carregar questões.');
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

  async alterarStatus(questao: AdminQuestao, status: string): Promise<void> {
    if (this.processando()) return;
    this.processando.set(questao.id);
    const result = await this.adminService.atualizarQuestao(questao.id, { status });
    if (result.ok) {
      this.questoes.update((lista) =>
        lista.map((q) => (q.id === questao.id ? { ...q, status } : q)),
      );
      this.toast.success('Status atualizado.');
    } else {
      this.toast.error('Erro ao atualizar status.');
    }
    this.processando.set(null);
  }

  async deletar(questao: AdminQuestao): Promise<void> {
    if (!confirm(`Deletar questão? Esta ação é irreversível.`)) return;
    const result = await this.adminService.deletarQuestao(questao.id);
    if (result.ok) {
      this.questoes.update((lista) => lista.filter((q) => q.id !== questao.id));
      this.total.update((t) => t - 1);
      this.toast.success('Questão deletada.');
    } else {
      this.toast.error('Erro ao deletar questão.');
    }
  }

  protected get totalPaginas(): number {
    return Math.ceil(this.total() / this.porPagina);
  }

  protected get paginaAtual(): number {
    return this.pagina() + 1;
  }
}
