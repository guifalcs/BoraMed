import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
import type { TicketCategoria } from '../../../core/models/suporte.types';
import { CATEGORIA_LABELS, STATUS_LABELS } from '../../../core/models/suporte.types';
import { SuporteService } from '../../../core/services/suporte.service';

type Aba = 'nova' | 'solicitacoes' | 'faq';

@Component({
  selector: 'app-suporte-widget',
  standalone: true,
  imports: [FormsModule, NgClass, UiIconComponent],
  templateUrl: './suporte-widget.component.html',
  styleUrl: './suporte-widget.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuporteWidgetComponent implements OnInit {
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
  protected readonly carregando = signal(false);

  // Nova solicitação
  protected readonly novaCategoria = signal<TicketCategoria | ''>('');
  protected readonly novaTitulo = signal('');
  protected readonly novaDescricao = signal('');
  protected readonly enviando = signal(false);
  protected readonly sucessoEnvio = signal(false);
  protected readonly erroEnvio = signal('');

  // Minhas solicitações
  protected readonly tickets = this.suporteService.tickets;
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

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      await Promise.all([
        this.suporteService.carregarMeusTickets(),
        this.suporteService.carregarFaq(),
      ]);
    }
  }

  protected toggleAberto(): void {
    this.aberto.update(v => !v);
  }

  protected fechar(): void {
    this.aberto.set(false);
  }

  protected setAba(aba: Aba): void {
    this.abaAtiva.set(aba);
    this.sucessoEnvio.set(false);
    this.erroEnvio.set('');
  }

  protected async enviarSolicitacao(): Promise<void> {
    if (!this.podeSalvar()) return;
    this.enviando.set(true);
    this.erroEnvio.set('');
    const result = await this.suporteService.criarTicket(
      this.novaTitulo().trim(),
      this.novaDescricao().trim(),
      this.novaCategoria() as TicketCategoria,
    );
    this.enviando.set(false);
    if (result.ok) {
      this.sucessoEnvio.set(true);
      this.novaCategoria.set('');
      this.novaTitulo.set('');
      this.novaDescricao.set('');
      await this.suporteService.carregarMeusTickets();
    } else {
      this.erroEnvio.set('Não foi possível enviar. Tente novamente.');
    }
  }

  protected novaForm(): void {
    this.sucessoEnvio.set(false);
    this.erroEnvio.set('');
  }

  protected toggleTicket(id: string): void {
    this.ticketExpandido.update(v => v === id ? null : id);
    this.novaMensagem.set('');
  }

  protected async enviarMensagem(ticketId: string): Promise<void> {
    const msg = this.novaMensagem().trim();
    if (!msg) return;
    this.enviandoMensagem.set(true);
    await this.suporteService.enviarMensagem(ticketId, msg);
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
