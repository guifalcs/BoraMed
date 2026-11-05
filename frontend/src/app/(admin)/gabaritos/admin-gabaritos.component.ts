import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  FileCheck2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
} from 'lucide-angular';
import { GabaritoProvaService } from '../../core/services/gabarito-prova.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { nomeGabarito } from '../../core/utils/gabarito-prova.util';
import type { AdminGabaritoProva } from '../../core/models/gabarito-prova';

type FiltroStatus = 'todos' | 'publicado' | 'rascunho';

@Component({
  selector: 'app-admin-gabaritos',
  standalone: true,
  imports: [RouterLink, UiIconComponent, UiConfirmDialogComponent],
  templateUrl: './admin-gabaritos.component.html',
  styleUrl: './admin-gabaritos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGabaritosComponent implements OnInit {
  private readonly service = inject(GabaritoProvaService);
  private readonly toast = inject(NotificationService);

  protected readonly gabaritos = signal<AdminGabaritoProva[]>([]);
  protected readonly carregando = signal(true);
  protected readonly processando = signal<string | null>(null);
  protected readonly paraExcluir = signal<AdminGabaritoProva | null>(null);
  protected readonly filtro = signal<FiltroStatus>('todos');
  protected readonly filtros: readonly { valor: FiltroStatus; label: string }[] = [
    { valor: 'todos', label: 'Todos' },
    { valor: 'publicado', label: 'Publicados' },
    { valor: 'rascunho', label: 'Rascunhos' },
  ];

  protected readonly filtrados = computed(() => {
    const f = this.filtro();
    return f === 'todos' ? this.gabaritos() : this.gabaritos().filter((g) => g.status === f);
  });

  protected readonly kpis = computed(() => {
    const lista = this.gabaritos();
    return {
      publicados: lista.filter((g) => g.status === 'publicado').length,
      rascunhos: lista.filter((g) => g.status === 'rascunho').length,
      visualizacoes: lista.reduce((s, g) => s + g.visualizacoes, 0),
      conferidos: lista.filter((g) => g.conferido_oficial).length,
    };
  });

  protected readonly nome = nomeGabarito;
  protected readonly iconPlus = Plus;
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;
  protected readonly iconCopy = Copy;
  protected readonly iconExternal = ExternalLink;
  protected readonly iconEye = Eye;
  protected readonly iconSend = Send;
  protected readonly iconMail = Mail;
  protected readonly iconUndo = Undo2;
  protected readonly iconCheck = CheckCircle2;
  protected readonly iconVazio = FileCheck2;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    const r = await this.service.adminListar();
    if (r.ok) this.gabaritos.set(r.data);
    else this.toast.error('Erro ao carregar gabaritos.');
    this.carregando.set(false);
  }

  protected progresso(g: AdminGabaritoProva): number {
    return g.total_questoes ? Math.round((g.total_preenchidas / g.total_questoes) * 100) : 0;
  }

  protected async copiarLink(g: AdminGabaritoProva): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/gabaritos/${g.slug}`);
      this.toast.success('Link copiado. É só colar no grupo.');
    } catch {
      this.toast.error('Não consegui copiar o link.');
    }
  }

  protected async alternarPublicacao(g: AdminGabaritoProva): Promise<void> {
    this.processando.set(g.id);
    const publicar = g.status !== 'publicado';
    const r = await this.service.adminPublicar(g.id, publicar, false);
    if (r.ok) {
      this.gabaritos.update((l) =>
        l.map((x) => (x.id === g.id ? { ...x, status: r.data.status, publicado_em: r.data.publicado_em } : x)),
      );
      this.toast.success(publicar ? 'Gabarito publicado.' : 'Gabarito voltou para rascunho.');
    } else {
      this.toast.error(r.error);
    }
    this.processando.set(null);
  }

  protected async confirmarExclusao(): Promise<void> {
    const g = this.paraExcluir();
    if (!g) return;
    this.paraExcluir.set(null);
    const r = await this.service.adminExcluir(g.id);
    if (r.ok) {
      this.gabaritos.update((l) => l.filter((x) => x.id !== g.id));
      this.toast.success('Gabarito excluído.');
    } else {
      this.toast.error(r.error);
    }
  }

  protected formatarData(iso: string | null): string {
    if (!iso) return '—';
    const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
}
