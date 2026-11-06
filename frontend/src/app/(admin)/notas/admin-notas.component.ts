import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Bell, Calculator, Copy, Pencil, Plus, Send, Trash2, Undo2, Users } from 'lucide-angular';
import { NotasService } from '../../core/services/notas.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import type { AdminNotasRegulamentoResumo } from '../../core/models/notas';

/** Publicar pode tirar do ar o regulamento atual do período: confirmamos antes. */
interface PublicacaoPendente {
  alvo: AdminNotasRegulamentoResumo;
  substitui: AdminNotasRegulamentoResumo | null;
}

@Component({
  selector: 'app-admin-notas',
  standalone: true,
  imports: [RouterLink, UiIconComponent, UiConfirmDialogComponent],
  templateUrl: './admin-notas.component.html',
  styleUrl: './admin-notas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotasComponent implements OnInit {
  private readonly service = inject(NotasService);
  private readonly toast = inject(NotificationService);

  protected readonly lista = signal<AdminNotasRegulamentoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly processando = signal<string | null>(null);
  protected readonly paraExcluir = signal<AdminNotasRegulamentoResumo | null>(null);
  protected readonly paraPublicar = signal<PublicacaoPendente | null>(null);
  protected readonly paraDespublicar = signal<AdminNotasRegulamentoResumo | null>(null);

  /** Uma lista só: por período e, dentro dele, publicado → rascunho → arquivado. */
  protected readonly ordenados = computed(() => {
    const ordemStatus = { publicado: 0, rascunho: 1, arquivado: 2 } as const;
    return [...this.lista()].sort(
      (a, b) => a.periodo - b.periodo || ordemStatus[a.status] - ordemStatus[b.status] || b.semestre.localeCompare(a.semestre),
    );
  });

  protected readonly kpis = computed(() => {
    const l = this.lista();
    return {
      periodosNoAr: l.filter((r) => r.status === 'publicado').length,
      rascunhos: l.filter((r) => r.status === 'rascunho').length,
      // Só os no ar: cada aluno lança apenas no publicado do próprio período,
      // então a soma não conta a mesma pessoa duas vezes.
      alunosComNotas: l.filter((r) => r.status === 'publicado').reduce((s, r) => s + r.alunos_com_notas, 0),
    };
  });

  protected readonly iconPlus = Plus;
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;
  protected readonly iconCopy = Copy;
  protected readonly iconSend = Send;
  protected readonly iconUndo = Undo2;
  protected readonly iconUsers = Users;
  protected readonly iconAvisar = Bell;
  protected readonly iconVazio = Calculator;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    const r = await this.service.adminListar();
    if (r.ok) this.lista.set(r.data);
    else this.toast.error('Erro ao carregar as dimensões de nota.');
    this.carregando.set(false);
  }

  protected nome(r: AdminNotasRegulamentoResumo): string {
    return r.titulo || `${r.periodo}º período · ${r.semestre}`;
  }

  protected adesao(r: AdminNotasRegulamentoResumo): number {
    return r.alunos_no_periodo ? Math.round((r.alunos_com_notas / r.alunos_no_periodo) * 100) : 0;
  }

  protected pedirPublicacao(r: AdminNotasRegulamentoResumo): void {
    if (r.status === 'publicado') {
      this.paraDespublicar.set(r);
      return;
    }
    const substitui = this.lista().find((x) => x.periodo === r.periodo && x.status === 'publicado' && x.id !== r.id) ?? null;
    this.paraPublicar.set({ alvo: r, substitui });
  }

  protected mensagemPublicar(p: PublicacaoPendente): string {
    const aviso = p.alvo.notificado_em
      ? 'Os alunos já foram avisados antes; não sai nova notificação.'
      : `Os alunos do ${p.alvo.periodo}º período recebem um aviso no sino.`;
    return p.substitui
      ? `"${this.nome(p.substitui)}" sai do ar e vai para arquivados; os alunos passam a ver este. ${aviso}`
      : aviso;
  }

  protected async confirmarPublicacao(): Promise<void> {
    const p = this.paraPublicar();
    this.paraPublicar.set(null);
    if (p) await this.publicar(p.alvo, true);
  }

  protected async confirmarDespublicar(): Promise<void> {
    const r = this.paraDespublicar();
    this.paraDespublicar.set(null);
    if (r) await this.publicar(r, false);
  }

  private async publicar(r: AdminNotasRegulamentoResumo, publicar: boolean): Promise<void> {
    this.processando.set(r.id);
    const res = await this.service.adminPublicar(r.id, publicar, publicar);
    this.processando.set(null);
    if (!res.ok) {
      this.toast.error(res.error);
      return;
    }
    if (publicar) {
      const extra = res.data.notificados ? ` ${res.data.notificados} aluno(s) avisados.` : '';
      this.toast.success(`No ar para o ${r.periodo}º período.${extra}`);
    } else {
      this.toast.success('Saiu do ar. Os alunos do período deixam de ver as dimensões.');
    }
    await this.carregar();
  }

  /** Publicado sem aviso (ex.: veio por migration): avisa os alunos agora. */
  protected async avisarAlunos(r: AdminNotasRegulamentoResumo): Promise<void> {
    this.processando.set(r.id);
    const res = await this.service.adminPublicar(r.id, true, true);
    this.processando.set(null);
    if (!res.ok) {
      this.toast.error(res.error);
      return;
    }
    this.toast.success(
      res.data.notificados
        ? `${res.data.notificados} aluno(s) do ${r.periodo}º período avisados no sino.`
        : `Nenhum aluno do ${r.periodo}º período para avisar ainda.`,
    );
    await this.carregar();
  }

  protected mensagemExcluir(r: AdminNotasRegulamentoResumo): string {
    return r.alunos_com_notas
      ? `${r.alunos_com_notas} aluno(s) lançaram notas aqui, e elas serão apagadas junto. Não dá para desfazer.`
      : 'O regulamento e toda a estrutura de eixos e itens serão apagados. Não dá para desfazer.';
  }

  protected async confirmarExclusao(): Promise<void> {
    const r = this.paraExcluir();
    this.paraExcluir.set(null);
    if (!r) return;
    const res = await this.service.adminExcluir(r.id);
    if (res.ok) {
      this.lista.update((l) => l.filter((x) => x.id !== r.id));
      this.toast.success('Regulamento excluído.');
    } else {
      this.toast.error(res.error);
    }
  }
}
