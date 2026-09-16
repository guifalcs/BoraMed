import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BarChart3, Copy, Pencil, Power, Trash2 } from 'lucide-angular';
import { AdminService } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { AdminPaginationComponent } from '../../shared/components/admin-pagination/admin-pagination.component';
import { SEGMENTOS_ACESSO } from '../../core/models/subscription.types';
import type { SegmentoAcesso } from '../../core/models/subscription.types';
import type { AdminPesquisa } from '../../core/models/pesquisa.types';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin-pesquisas',
  standalone: true,
  imports: [RouterLink, UiIconComponent, UiConfirmDialogComponent, AdminPaginationComponent],
  templateUrl: './admin-pesquisas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPesquisasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly pesquisas = signal<AdminPesquisa[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly processando = signal<string | null>(null);
  protected readonly paraDeletar = signal<AdminPesquisa | null>(null);

  protected readonly pagina = signal(0);
  protected readonly pesquisasPagina = computed(() => {
    const ini = this.pagina() * PAGE_SIZE;
    return this.pesquisas().slice(ini, ini + PAGE_SIZE);
  });

  protected readonly pageSize = PAGE_SIZE;
  protected readonly iconEditar = Pencil;
  protected readonly iconResultados = BarChart3;
  protected readonly iconPower = Power;
  protected readonly iconCopiar = Copy;
  protected readonly iconTrash = Trash2;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarPesquisas();
    if (result.ok) {
      this.pesquisas.set(result.data);
      this.pagina.set(0);
    } else {
      this.toast.error('Erro ao carregar pesquisas.');
    }
    this.isLoading.set(false);
  }

  protected async toggleAtiva(pesquisa: AdminPesquisa): Promise<void> {
    if (!pesquisa.ativa && pesquisa.total_perguntas === 0) {
      this.toast.error('Adicione ao menos uma pergunta antes de publicar.');
      return;
    }

    this.processando.set(pesquisa.id);
    const result = await this.adminService.toggleAtivaPesquisa(pesquisa.id, !pesquisa.ativa);
    if (result.ok) {
      this.pesquisas.update((lista) =>
        lista.map((p) => (p.id === pesquisa.id ? { ...p, ativa: !pesquisa.ativa } : p)),
      );
      this.toast.success(pesquisa.ativa ? 'Pesquisa despublicada.' : 'Pesquisa no ar.');
    } else {
      this.toast.error('Erro ao atualizar pesquisa.');
    }
    this.processando.set(null);
  }

  protected async duplicar(pesquisa: AdminPesquisa): Promise<void> {
    this.processando.set(pesquisa.id);
    const result = await this.adminService.duplicarPesquisa(pesquisa.id);
    this.processando.set(null);
    if (result.ok) {
      this.toast.success('Cópia criada como rascunho.');
      await this.carregar();
    } else {
      this.toast.error('Erro ao duplicar pesquisa.');
    }
  }

  protected solicitarDelete(pesquisa: AdminPesquisa): void {
    this.paraDeletar.set(pesquisa);
  }

  protected cancelarDelete(): void {
    this.paraDeletar.set(null);
  }

  protected async confirmarDelete(): Promise<void> {
    const pesquisa = this.paraDeletar();
    if (!pesquisa) return;
    this.paraDeletar.set(null);
    const result = await this.adminService.deletarPesquisa(pesquisa.id);
    if (result.ok) {
      this.pesquisas.update((lista) => lista.filter((p) => p.id !== pesquisa.id));
      this.toast.success('Pesquisa removida.');
    } else {
      this.toast.error('Erro ao remover pesquisa.');
    }
  }

  protected mensagemDelete(): string {
    const pesquisa = this.paraDeletar();
    if (!pesquisa) return '';
    return pesquisa.total_respostas > 0
      ? `Esta pesquisa tem ${pesquisa.total_respostas} resposta(s). Apagá-la apaga também as respostas, sem volta. Continuar?`
      : 'Esta pesquisa será removida permanentemente. Continuar?';
  }

  protected segmentoLabel(segmento: SegmentoAcesso): string {
    return SEGMENTOS_ACESSO.find((s) => s.valor === segmento)?.label ?? segmento;
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  }
}
