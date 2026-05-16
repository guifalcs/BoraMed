import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTema } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-admin-temas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-temas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTemasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly temas = signal<AdminTema[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly criando = signal(false);
  protected readonly processando = signal<string | null>(null);

  protected readonly novoNome = signal('');
  protected readonly novaDisciplina = signal('');
  protected readonly novoPeriodo = signal<number | null>(null);

  protected readonly editandoId = signal<string | null>(null);
  protected readonly editNome = signal('');
  protected readonly editDisciplina = signal('');

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarTemas();
    if (result.ok) {
      this.temas.set(result.data);
    } else {
      this.toast.error('Erro ao carregar temas.');
    }
    this.isLoading.set(false);
  }

  async criar(): Promise<void> {
    if (!this.novoNome().trim()) return;
    this.criando.set(true);
    const result = await this.adminService.criarTema({
      nome: this.novoNome().trim(),
      disciplina: this.novaDisciplina().trim() || null,
      periodo: this.novoPeriodo(),
      parent_id: null,
    });
    if (result.ok) {
      this.temas.update((lista) => [result.data, ...lista]);
      this.novoNome.set('');
      this.novaDisciplina.set('');
      this.novoPeriodo.set(null);
      this.toast.success('Tema criado.');
    } else {
      this.toast.error('Erro ao criar tema.');
    }
    this.criando.set(false);
  }

  iniciarEdicao(tema: AdminTema): void {
    this.editandoId.set(tema.id);
    this.editNome.set(tema.nome);
    this.editDisciplina.set(tema.disciplina ?? '');
  }

  async salvarEdicao(tema: AdminTema): Promise<void> {
    if (!this.editNome().trim()) return;
    this.processando.set(tema.id);
    const result = await this.adminService.atualizarTema(tema.id, {
      nome: this.editNome().trim(),
      disciplina: this.editDisciplina().trim() || null,
    });
    if (result.ok) {
      this.temas.update((lista) =>
        lista.map((t) => (t.id === tema.id ? result.data : t)),
      );
      this.editandoId.set(null);
      this.toast.success('Tema atualizado.');
    } else {
      this.toast.error('Erro ao atualizar tema.');
    }
    this.processando.set(null);
  }

  async deletar(tema: AdminTema): Promise<void> {
    if (!confirm(`Deletar tema "${tema.nome}"?`)) return;
    const result = await this.adminService.deletarTema(tema.id);
    if (result.ok) {
      this.temas.update((lista) => lista.filter((t) => t.id !== tema.id));
      this.toast.success('Tema deletado.');
    } else {
      this.toast.error('Erro ao deletar tema. Pode ter questões vinculadas.');
    }
  }
}
