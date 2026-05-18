import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminDisciplina } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';

@Component({
  selector: 'app-admin-disciplinas',
  standalone: true,
  imports: [FormsModule, UiConfirmDialogComponent],
  templateUrl: './admin-disciplinas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisciplinasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
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

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarDisciplinas();
    if (result.ok) {
      this.disciplinas.set(result.data);
    } else {
      this.toast.error('Erro ao carregar disciplinas.');
    }
    this.isLoading.set(false);
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
      this.toast.success('Disciplina deletada.');
    } else {
      this.toast.error(result.error);
    }
  }
}
