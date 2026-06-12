import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Headphones,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { NotificationService } from '../../core/services/notification.service';
import { SuporteService } from '../../core/services/suporte.service';
import type {
  AdminTicketDetalhe,
  TicketStatus,
} from '../../core/models/suporte.types';
import { CATEGORIA_LABELS, STATUS_LABELS } from '../../core/models/suporte.types';

type PainelAtivo = 'tickets' | 'faq';
type FiltroStatus = 'todos' | TicketStatus;

@Component({
  selector: 'app-admin-suporte',
  standalone: true,
  imports: [FormsModule, NgClass, UiIconComponent],
  templateUrl: './admin-suporte.component.html',
  styleUrl: './admin-suporte.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSuporteComponent implements OnInit {
  private readonly toast = inject(NotificationService);
  private readonly suporteService = inject(SuporteService);

  protected readonly iconHeadphones = Headphones;
  protected readonly iconMessage = MessageCircle;
  protected readonly iconSend = Send;
  protected readonly iconCheck = CheckCircle2;
  protected readonly iconClock = Clock;
  protected readonly iconX = X;
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconPencil = Pencil;
  protected readonly iconChevronRight = ChevronRight;

  protected readonly categoriaLabels = CATEGORIA_LABELS;
  protected readonly statusLabels = STATUS_LABELS;

  protected readonly isLoading = signal(true);
  protected readonly painelAtivo = signal<PainelAtivo>('tickets');
  protected readonly filtroStatus = signal<FiltroStatus>('todos');

  protected readonly tickets = signal<AdminTicketDetalhe[]>([]);
  protected readonly ticketSelecionado = signal<AdminTicketDetalhe | null>(null);
  protected readonly novaResposta = signal('');
  protected readonly enviandoResposta = signal(false);
  protected readonly alterandoStatus = signal(false);

  protected readonly faqItems = this.suporteService.faqItems;
  protected readonly novoFaqPergunta = signal('');
  protected readonly novoFaqResposta = signal('');
  protected readonly novoFaqCategoria = signal('');
  protected readonly criandoFaq = signal(false);
  protected readonly mostrarFormFaq = signal(false);

  protected readonly ticketsFiltrados = computed<AdminTicketDetalhe[]>(() => {
    const status = this.filtroStatus();
    const todos = this.tickets();
    if (status === 'todos') return todos;
    return todos.filter(t => t.status === status);
  });

  protected readonly contadores = computed(() => {
    const todos = this.tickets();
    return {
      todos: todos.length,
      aberto: todos.filter(t => t.status === 'aberto').length,
      em_andamento: todos.filter(t => t.status === 'em_andamento').length,
      resolvido: todos.filter(t => t.status === 'resolvido').length,
    };
  });

  protected readonly filtros: { value: FiltroStatus; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'aberto', label: 'Aberto' },
    { value: 'em_andamento', label: 'Em andamento' },
    { value: 'resolvido', label: 'Resolvido' },
  ];

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      await this.carregarTudo();
    }
  }

  private async carregarTudo(): Promise<void> {
    this.isLoading.set(true);
    const [ticketsResult] = await Promise.all([
      this.suporteService.adminListarTickets(),
      this.suporteService.adminListarFaq(),
    ]);
    if (ticketsResult.ok) {
      // Carrega detalhe completo de cada ticket para ter as mensagens
      const detalhados = await Promise.all(
        ticketsResult.data.map(async t => {
          const res = await this.suporteService.adminDetalharTicket(t.id);
          return res.ok ? res.data : { ...t, mensagens: [] };
        })
      );
      this.tickets.set(detalhados as AdminTicketDetalhe[]);
    } else {
      this.toast.error('Erro ao carregar tickets.');
    }
    this.isLoading.set(false);
  }

  protected setPainel(p: PainelAtivo): void {
    this.painelAtivo.set(p);
    this.ticketSelecionado.set(null);
  }

  protected setFiltro(f: FiltroStatus): void {
    this.filtroStatus.set(f);
    this.ticketSelecionado.set(null);
  }

  protected async selecionarTicket(ticket: AdminTicketDetalhe): Promise<void> {
    this.novaResposta.set('');
    const res = await this.suporteService.adminDetalharTicket(ticket.id);
    this.ticketSelecionado.set(res.ok ? res.data : ticket);
  }

  protected async responder(): Promise<void> {
    const ticket = this.ticketSelecionado();
    const msg = this.novaResposta().trim();
    if (!ticket || !msg) return;
    this.enviandoResposta.set(true);
    const result = await this.suporteService.adminResponder(ticket.id, msg);
    if (result.ok) {
      const ticketAtualizado: AdminTicketDetalhe = {
        ...ticket,
        mensagens: [...ticket.mensagens, result.data],
        total_mensagens: ticket.total_mensagens + 1,
        status: ticket.status === 'aberto' ? 'em_andamento' : ticket.status,
      };
      this.tickets.update(ts => ts.map(t => t.id === ticket.id ? ticketAtualizado : t));
      this.ticketSelecionado.set(ticketAtualizado);
      this.novaResposta.set('');
      this.toast.success('Resposta enviada.');
    } else {
      this.toast.error('Erro ao enviar resposta.');
    }
    this.enviandoResposta.set(false);
  }

  protected async marcarResolvido(): Promise<void> {
    const ticket = this.ticketSelecionado();
    if (!ticket) return;
    this.alterandoStatus.set(true);
    const result = await this.suporteService.adminAtualizarStatus(ticket.id, 'resolvido');
    if (result.ok) {
      const ticketAtualizado: AdminTicketDetalhe = { ...ticket, status: 'resolvido' };
      this.tickets.update(ts => ts.map(t => t.id === ticket.id ? ticketAtualizado : t));
      this.ticketSelecionado.set(ticketAtualizado);
      this.toast.success('Ticket marcado como resolvido.');
    } else {
      this.toast.error('Erro ao atualizar status.');
    }
    this.alterandoStatus.set(false);
  }

  protected async criarFaq(): Promise<void> {
    if (!this.novoFaqPergunta().trim() || !this.novoFaqResposta().trim()) return;
    this.criandoFaq.set(true);
    const result = await this.suporteService.adminCriarFaq(
      this.novoFaqPergunta().trim(),
      this.novoFaqResposta().trim(),
      this.novoFaqCategoria().trim() || null,
    );
    if (result.ok) {
      this.novoFaqPergunta.set('');
      this.novoFaqResposta.set('');
      this.novoFaqCategoria.set('');
      this.mostrarFormFaq.set(false);
      this.toast.success('FAQ criada com sucesso.');
    } else {
      this.toast.error('Erro ao criar FAQ.');
    }
    this.criandoFaq.set(false);
  }

  protected async toggleAtivoFaq(id: string): Promise<void> {
    const item = this.faqItems().find(f => f.id === id);
    const result = await this.suporteService.adminToggleFaq(id);
    if (result.ok) {
      this.toast.success(!item?.ativo ? 'FAQ ativada.' : 'FAQ desativada.');
    } else {
      this.toast.error('Erro ao atualizar FAQ.');
    }
  }

  protected async deletarFaq(id: string): Promise<void> {
    const result = await this.suporteService.adminDeletarFaq(id);
    if (result.ok) {
      this.toast.success('FAQ removida.');
    } else {
      this.toast.error('Erro ao remover FAQ.');
    }
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  protected statusClass(status: string): string {
    if (status === 'aberto') return 'badge--aberto';
    if (status === 'em_andamento') return 'badge--andamento';
    return 'badge--resolvido';
  }

  protected iniciais(nome: string | null, email: string): string {
    if (nome) {
      const partes = nome.trim().split(' ');
      return partes.length >= 2
        ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
        : partes[0].slice(0, 2).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  }
}
