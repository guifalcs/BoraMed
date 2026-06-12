import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import type {
  AdminTicketDetalhe,
  AdminTicketResumo,
  SuporteFaq,
  TicketStatus,
} from '../../core/models/suporte.types';
import { CATEGORIA_LABELS, STATUS_LABELS } from '../../core/models/suporte.types';

type PainelAtivo = 'tickets' | 'faq';
type FiltroStatus = 'todos' | TicketStatus;

// MOCKED data


@Component({
  selector: 'app-admin-suporte',
  standalone: true,
  imports: [FormsModule, NgClass, UiIconComponent],
  templateUrl: './admin-suporte.component.html',
  styleUrl: './admin-suporte.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSuporteComponent {
  private readonly toast = inject(NotificationService);
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

  protected readonly painelAtivo = signal<PainelAtivo>('tickets');
  protected readonly filtroStatus = signal<FiltroStatus>('todos');

  protected readonly tickets = signal<AdminTicketDetalhe[]>([]);
  protected readonly ticketSelecionado = signal<AdminTicketDetalhe | null>(null);
  protected readonly novaResposta = signal('');
  protected readonly enviandoResposta = signal(false);
  protected readonly alterandoStatus = signal(false);

  // FAQ
  protected readonly faqItems = signal<SuporteFaq[]>([]);
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

  protected setPainel(p: PainelAtivo): void {
    this.painelAtivo.set(p);
    this.ticketSelecionado.set(null);
  }

  protected setFiltro(f: FiltroStatus): void {
    this.filtroStatus.set(f);
    this.ticketSelecionado.set(null);
  }

  protected selecionarTicket(ticket: AdminTicketDetalhe): void {
    this.ticketSelecionado.set(ticket);
    this.novaResposta.set('');
  }

  protected async responder(): Promise<void> {
    const ticket = this.ticketSelecionado();
    const msg = this.novaResposta().trim();
    if (!ticket || !msg) return;
    this.enviandoResposta.set(true);
    await new Promise(r => setTimeout(r, 500));
    const novaMensagem = {
      id: Math.random().toString(36).slice(2),
      ticket_id: ticket.id,
      autor_id: 'admin',
      mensagem: msg,
      is_admin: true,
      criado_em: new Date().toISOString(),
    };
    const ticketAtualizado: AdminTicketDetalhe = {
      ...ticket,
      mensagens: [...ticket.mensagens, novaMensagem],
      total_mensagens: ticket.total_mensagens + 1,
      status: 'em_andamento' as TicketStatus,
    };
    this.tickets.update(ts => ts.map(t => t.id === ticket.id ? ticketAtualizado : t));
    this.ticketSelecionado.set(ticketAtualizado);
    this.novaResposta.set('');
    this.enviandoResposta.set(false);
    this.toast.success('Resposta enviada.');
  }

  protected async marcarResolvido(): Promise<void> {
    const ticket = this.ticketSelecionado();
    if (!ticket) return;
    this.alterandoStatus.set(true);
    await new Promise(r => setTimeout(r, 300));
    const ticketAtualizado: AdminTicketDetalhe = { ...ticket, status: 'resolvido' as TicketStatus };
    this.tickets.update(ts => ts.map(t => t.id === ticket.id ? ticketAtualizado : t));
    this.ticketSelecionado.set(ticketAtualizado);
    this.alterandoStatus.set(false);
    this.toast.success('Ticket marcado como resolvido.');
  }

  protected async criarFaq(): Promise<void> {
    if (!this.novoFaqPergunta().trim() || !this.novoFaqResposta().trim()) return;
    this.criandoFaq.set(true);
    await new Promise(r => setTimeout(r, 400));
    const novoItem: SuporteFaq = {
      id: Math.random().toString(36).slice(2),
      pergunta: this.novoFaqPergunta().trim(),
      resposta: this.novoFaqResposta().trim(),
      categoria: this.novoFaqCategoria().trim() || null,
      ordem: this.faqItems().length + 1,
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    this.faqItems.update(items => [...items, novoItem]);
    this.novoFaqPergunta.set('');
    this.novoFaqResposta.set('');
    this.novoFaqCategoria.set('');
    this.mostrarFormFaq.set(false);
    this.criandoFaq.set(false);
    this.toast.success('FAQ criada com sucesso.');
  }

  protected toggleAtivoFaq(id: string): void {
    const item = this.faqItems().find(f => f.id === id);
    this.faqItems.update(items =>
      items.map(f => f.id === id ? { ...f, ativo: !f.ativo } : f)
    );
    this.toast.success(!item?.ativo ? 'FAQ ativada.' : 'FAQ desativada.');
  }

  protected deletarFaq(id: string): void {
    this.faqItems.update(items => items.filter(f => f.id !== id));
    this.toast.success('FAQ removida.');
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
