import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminDisciplina } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { AdminPaginationComponent } from '../../shared/components/admin-pagination/admin-pagination.component';
import { Pencil, Trash2 } from 'lucide-angular';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin-disciplinas',
  standalone: true,
  imports: [FormsModule, UiConfirmDialogComponent, UiIconComponent, AdminPaginationComponent],
  templateUrl: './admin-disciplinas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisciplinasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
  protected readonly pagina = signal(0);
  protected readonly disciplinasPagina = computed(() => {
    const inicio = this.pagina() * PAGE_SIZE;
    return this.disciplinas().slice(inicio, inicio + PAGE_SIZE);
  });
  protected readonly isLoading = signal(true);
  protected readonly criando = signal(false);
  protected readonly processando = signal<string | null>(null);

  protected readonly novoSigla = signal('');
  protected readonly novoNome = signal('');
  protected readonly novoPeriodo = signal<number | null>(null);

  protected readonly editandoId = signal<string | null>(null);
  protected readonly editSigla = signal('');
  protected readonly editNome = signal('');
  protected readonly editPeriodo = signal<number | null>(null);

  protected readonly disciplinaParaDeletar = signal<AdminDisciplina | null>(null);
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarDisciplinas();
    if (result.ok) {
      this.disciplinas.set(result.data);
      this.pagina.set(0);
    } else {
      this.toast.error('Erro ao carregar disciplinas.');
    }
    this.isLoading.set(false);
  }

  protected mudarPagina(pagina: number): void {
    const totalPaginas = Math.max(1, Math.ceil(this.disciplinas().length / PAGE_SIZE));
    this.pagina.set(Math.max(0, Math.min(pagina, totalPaginas - 1)));
  }

  async criar(): Promise<void> {
    if (!this.novoSigla().trim() || !this.novoPeriodo()) return;
    this.criando.set(true);
    const result = await this.adminService.criarDisciplina({
      sigla: this.novoSigla().trim().toUpperCase(),
      nome: this.novoNome().trim() || null,
      periodo: this.novoPeriodo()!,
    });
    if (result.ok) {
      this.disciplinas.update((lista) => [...lista, result.data].sort((a, b) =>
        a.periodo !== b.periodo ? a.periodo - b.periodo : a.sigla.localeCompare(b.sigla)
      ));
      this.novoSigla.set('');
      this.novoNome.set('');
      this.novoPeriodo.set(null);
      this.toast.success('Disciplina criada.');
    } else {
      this.toast.error('Erro ao criar disciplina.');
    }
    this.criando.set(false);
  }

  iniciarEdicao(d: AdminDisciplina): void {
    this.editandoId.set(d.id);
    this.editSigla.set(d.sigla);
    this.editNome.set(d.nome ?? '');
    this.editPeriodo.set(d.periodo);
  }

  async salvarEdicao(d: AdminDisciplina): Promise<void> {
    if (!this.editSigla().trim() || !this.editPeriodo()) return;
    this.processando.set(d.id);
    const result = await this.adminService.atualizarDisciplina(d.id, {
      sigla: this.editSigla().trim().toUpperCase(),
      nome: this.editNome().trim() || null,
      periodo: this.editPeriodo()!,
    });
    if (result.ok) {
      this.disciplinas.update((lista) =>
        lista.map((item) => (item.id === d.id ? result.data : item)).sort((a, b) =>
          a.periodo !== b.periodo ? a.periodo - b.periodo : a.sigla.localeCompare(b.sigla)
        )
      );
      this.editandoId.set(null);
      this.toast.success('Disciplina atualizada.');
    } else {
      this.toast.error('Erro ao atualizar disciplina.');
    }
    this.processando.set(null);
  }

  protected solicitarDelete(d: AdminDisciplina): void {
    this.disciplinaParaDeletar.set(d);
  }

  protected cancelarDelete(): void {
    this.disciplinaParaDeletar.set(null);
  }

  async confirmarDelete(): Promise<void> {
    const d = this.disciplinaParaDeletar();
    if (!d) return;
    this.disciplinaParaDeletar.set(null);
    const result = await this.adminService.deletarDisciplina(d.id);
    if (result.ok) {
      this.disciplinas.update((lista) => lista.filter((item) => item.id !== d.id));
      this.mudarPagina(this.pagina());
      const { questoes_desvinculadas, temas_desvinculados } = result.data;
      this.toast.success(questoes_desvinculadas > 0 || temas_desvinculados > 0
        ? `Disciplina deletada. ${questoes_desvinculadas} questão(ões) e ${temas_desvinculados} tema(s) ficaram sem disciplina.`
        : 'Disciplina deletada.');
    } else {
      this.toast.error(result.error);
    }
  }
}
