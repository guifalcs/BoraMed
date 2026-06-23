import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTema, AdminDisciplina } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiCheckboxComponent } from '../../shared/components/ui/checkbox/ui-checkbox.component';
import { Pencil, Trash2 } from 'lucide-angular';

const DATA_CURTA_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface TipoProvaOpcao { value: string; label: string; }

const TIPOS_PROVA: readonly TipoProvaOpcao[] = [
  { value: 'nacional', label: 'Nacional' },
  { value: 'processual', label: 'Processual' },
  { value: 'laboratorio', label: 'Laboratório' },
] as const;

@Component({
  selector: 'app-admin-temas',
  standalone: true,
  imports: [FormsModule, UiConfirmDialogComponent, UiSelectComponent, UiIconComponent, UiCheckboxComponent],
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
  protected readonly novaDisciplinaId = signal<string | null>(null);
  protected readonly novoTiposProva = signal<string[]>([]);

  protected readonly tiposProva = TIPOS_PROVA;

  protected readonly disciplinasDisponiveis = signal<AdminDisciplina[]>([]);

  protected readonly opcoesDisciplina = computed<SelectOption[]>(() => [
    { value: '', label: 'Sem disciplina' },
    ...this.disciplinasDisponiveis().map((d) => ({
      value: d.id,
      label: `${d.sigla} (P${d.periodo})`,
    })),
  ]);

  protected readonly editandoId = signal<string | null>(null);
  protected readonly editNome = signal('');
  protected readonly editDisciplinaId = signal<string | null>(null);
  protected readonly editTiposProva = signal<string[]>([]);
  protected readonly temaParaDeletar = signal<AdminTema | null>(null);
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.carregar(), this.carregarDisciplinas()]);
  }

  private async carregarDisciplinas(): Promise<void> {
    const result = await this.adminService.listarDisciplinas();
    if (result.ok) this.disciplinasDisponiveis.set(result.data);
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
      disciplina_id: this.novaDisciplinaId(),
      parent_id: null,
      tipos_prova: this.normalizarTiposProva(this.novoTiposProva()),
    });
    if (result.ok) {
      this.temas.update((lista) => [result.data, ...lista]);
      this.novoNome.set('');
      this.novaDisciplinaId.set(null);
      this.novoTiposProva.set([]);
      this.toast.success('Tema criado.');
    } else {
      this.toast.error('Erro ao criar tema.');
    }
    this.criando.set(false);
  }

  iniciarEdicao(tema: AdminTema): void {
    this.editandoId.set(tema.id);
    this.editNome.set(tema.nome);
    this.editDisciplinaId.set(tema.disciplina_id ?? null);
    this.editTiposProva.set([...(tema.tipos_prova ?? [])]);
  }

  async salvarEdicao(tema: AdminTema): Promise<void> {
    if (!this.editNome().trim()) return;
    this.processando.set(tema.id);
    const result = await this.adminService.atualizarTema(tema.id, {
      nome: this.editNome().trim(),
      disciplina_id: this.editDisciplinaId(),
      tipos_prova: this.normalizarTiposProva(this.editTiposProva()),
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

  protected solicitarDelete(tema: AdminTema): void {
    this.temaParaDeletar.set(tema);
  }

  protected cancelarDelete(): void {
    this.temaParaDeletar.set(null);
  }

  disciplinaSiglaFor(id: string | null): string {
    if (!id) return '—';
    return this.disciplinasDisponiveis().find((d) => d.id === id)?.sigla ?? '—';
  }

  /** Lista vazia → null (tema vale para todas as provas). */
  private normalizarTiposProva(selecionados: string[]): string[] | null {
    const validos = TIPOS_PROVA.filter((t) => selecionados.includes(t.value)).map((t) => t.value);
    return validos.length === 0 ? null : validos;
  }

  protected toggleNovoTipoProva(valor: string, marcado: boolean): void {
    this.novoTiposProva.update((atual) => this.aplicarToggle(atual, valor, marcado));
  }

  protected toggleEditTipoProva(valor: string, marcado: boolean): void {
    this.editTiposProva.update((atual) => this.aplicarToggle(atual, valor, marcado));
  }

  private aplicarToggle(atual: string[], valor: string, marcado: boolean): string[] {
    if (marcado) return atual.includes(valor) ? atual : [...atual, valor];
    return atual.filter((v) => v !== valor);
  }

  protected tiposProvaLabel(tipos: string[] | null | undefined): string {
    if (!tipos || tipos.length === 0) return 'Todas as provas';
    return TIPOS_PROVA.filter((t) => tipos.includes(t.value)).map((t) => t.label).join(', ');
  }

  protected formatarData(data: string | null | undefined): string {
    if (!data) return '—';
    return DATA_CURTA_FMT.format(new Date(data));
  }

  async confirmarDelete(): Promise<void> {
    const tema = this.temaParaDeletar();
    if (!tema) return;
    this.temaParaDeletar.set(null);
    const result = await this.adminService.deletarTema(tema.id);
    if (result.ok) {
      const { questoes_desvinculadas, subtemas_realocados } = result.data;
      this.toast.success(questoes_desvinculadas > 0 || subtemas_realocados > 0
        ? `Tema deletado. ${questoes_desvinculadas} questão(ões) desvinculada(s) e ${subtemas_realocados} subtema(s) realocado(s).`
        : 'Tema deletado.');
      await this.carregar();
    } else {
      this.toast.error(result.error);
    }
  }
}
