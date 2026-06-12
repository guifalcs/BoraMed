import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
  computed,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChevronDown,
  ChevronUp,
  LifeBuoy,
  MessageCircle,
  Send,
  X,
} from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type {
  SuporteFaq,
  SuporteMensagem,
  SuporteTicketComMensagens,
  TicketCategoria,
} from '../../../core/models/suporte.types';
import { CATEGORIA_LABELS, STATUS_LABELS } from '../../../core/models/suporte.types';
import { SuporteService } from '../../../core/services/suporte.service';

type Aba = 'nova' | 'solicitacoes' | 'faq';

// MOCKED data - will be replaced in ETAPA 4


@Component({
  selector: 'app-suporte-widget',
  standalone: true,
  imports: [FormsModule, NgClass, UiIconComponent],
  templateUrl: './suporte-widget.component.html',
  styleUrl: './suporte-widget.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuporteWidgetComponent {
  private readonly suporteService = inject(SuporteService);

  protected readonly iconLifeBuoy = LifeBuoy;
  protected readonly iconX = X;
  protected readonly iconSend = Send;
  protected readonly iconMessage = MessageCircle;
  protected readonly iconDown = ChevronDown;
  protected readonly iconUp = ChevronUp;

  protected readonly categoriaLabels = CATEGORIA_LABELS;
  protected readonly statusLabels = STATUS_LABELS;

  protected readonly aberto = signal(false);
  protected readonly abaAtiva = signal<Aba>('nova');

  // Nova solicitação
  protected readonly novaCategoria = signal<TicketCategoria | ''>('');
  protected readonly novaTitulo = signal('');
  protected readonly novaDescricao = signal('');
  protected readonly enviando = signal(false);
  protected readonly sucessoEnvio = signal(false);

  // Minhas solicitações
  protected readonly tickets = signal<SuporteTicketComMensagens[]>([]);
  protected readonly ticketExpandido = signal<string | null>(null);
  protected readonly novaMensagem = signal('');
  protected readonly enviandoMensagem = signal(false);

  // FAQ
  protected readonly faqItems = this.suporteService.faqItems;
  protected readonly faqExpandido = signal<string | null>(null);

  protected readonly podeSalvar = computed(() =>
    this.novaCategoria() !== '' &&
    this.novaTitulo().trim().length >= 5 &&
    this.novaDescricao().trim().length >= 10
  );

  protected readonly categorias: { value: TicketCategoria; label: string }[] = [
    { value: 'problema_tecnico', label: CATEGORIA_LABELS.problema_tecnico },
    { value: 'duvida_conteudo', label: CATEGORIA_LABELS.duvida_conteudo },
    { value: 'assinatura_pagamento', label: CATEGORIA_LABELS.assinatura_pagamento },
    { value: 'outro', label: CATEGORIA_LABELS.outro },
  ];

  protected toggleAberto(): void {
    this.aberto.update(v => !v);
  }

  protected fechar(): void {
    this.aberto.set(false);
  }

  protected setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
    this.sucessoEnvio.set(false);
  }

  protected async enviarSolicitacao(): Promise<void> {
    if (!this.podeSalvar()) return;
    this.enviando.set(true);
    // Simulate API call
    await new Promise(r => setTimeout(r, 800));
    this.enviando.set(false);
    this.sucessoEnvio.set(true);
    this.novaCategoria.set('');
    this.novaTitulo.set('');
    this.novaDescricao.set('');
  }

  protected novaForm(): void {
    this.sucessoEnvio.set(false);
  }

  protected toggleTicket(id: string): void {
    this.ticketExpandido.update(v => v === id ? null : id);
    this.novaMensagem.set('');
  }

  protected async enviarMensagem(ticketId: string): Promise<void> {
    const msg = this.novaMensagem().trim();
    if (!msg) return;
    this.enviandoMensagem.set(true);
    await new Promise(r => setTimeout(r, 400));
    // Add mocked message
    this.tickets.update(tickets =>
      tickets.map(t => t.id === ticketId
        ? {
            ...t,
            mensagens: [
              ...t.mensagens,
              {
                id: Math.random().toString(36).slice(2),
                ticket_id: ticketId,
                autor_id: 'u1',
                mensagem: msg,
                is_admin: false,
                criado_em: new Date().toISOString(),
              } satisfies SuporteMensagem,
            ],
          }
        : t
      )
    );
    this.novaMensagem.set('');
    this.enviandoMensagem.set(false);
  }

  protected toggleFaq(id: string): void {
    this.faqExpandido.update(v => v === id ? null : id);
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  protected statusClass(status: string): string {
    if (status === 'aberto') return 'badge--aberto';
    if (status === 'em_andamento') return 'badge--andamento';
    return 'badge--resolvido';
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.fechar();
  }
}
