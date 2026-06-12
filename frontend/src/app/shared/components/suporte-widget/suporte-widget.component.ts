import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterNextRender,
  inject,
  signal,
  computed,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChevronDown,
  ChevronUp,
  FileImage,
  FileVideo,
  LifeBuoy,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Send,
  X,
} from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type { SuporteAnexo, TicketCategoria } from '../../../core/models/suporte.types';
import { CATEGORIA_LABELS, STATUS_LABELS } from '../../../core/models/suporte.types';
import {
  SUPORTE_ANEXOS_ACCEPT,
  SUPORTE_ANEXOS_MAX_FILES,
  SuporteService,
} from '../../../core/services/suporte.service';

type Aba = 'nova' | 'solicitacoes' | 'faq';

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
  protected readonly iconPaperclip = Paperclip;
  protected readonly iconFileImage = FileImage;
  protected readonly iconFileVideo = FileVideo;
  protected readonly iconRefresh = RefreshCw;

  protected readonly categoriaLabels = CATEGORIA_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly anexosAccept = SUPORTE_ANEXOS_ACCEPT;
  protected readonly maxAnexos = SUPORTE_ANEXOS_MAX_FILES;

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
  protected readonly avisoEnvio = signal('');
  protected readonly novosAnexos = signal<File[]>([]);
  protected readonly erroAnexos = signal('');

  // Minhas solicitações
  protected readonly tickets = this.suporteService.tickets;
  protected readonly ticketExpandido = signal<string | null>(null);
  protected readonly novaMensagem = signal('');
  protected readonly respostaAnexos = signal<File[]>([]);
  protected readonly erroMensagem = signal('');
  protected readonly enviandoMensagem = signal(false);
  protected readonly reabrindoTicket = signal(false);

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

  constructor() {
    afterNextRender(() => {
      void Promise.all([
        this.suporteService.carregarMeusTickets(),
        this.suporteService.carregarFaq(),
      ]);
    });
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
    this.avisoEnvio.set('');
    this.erroAnexos.set('');
    this.erroMensagem.set('');
  }

  protected async enviarSolicitacao(): Promise<void> {
    if (!this.podeSalvar()) return;
    this.enviando.set(true);
    this.erroEnvio.set('');
    const result = await this.suporteService.criarTicket(
      this.novaTitulo().trim(),
      this.novaDescricao().trim(),
      this.novaCategoria() as TicketCategoria,
      this.novosAnexos(),
    );
    this.enviando.set(false);
    if (result.ok) {
      this.sucessoEnvio.set(true);
      this.avisoEnvio.set(result.warning ?? '');
      this.novaCategoria.set('');
      this.novaTitulo.set('');
      this.novaDescricao.set('');
      this.novosAnexos.set([]);
      await this.suporteService.carregarMeusTickets();
    } else {
      this.erroEnvio.set(result.error || 'Não foi possível enviar. Tente novamente.');
    }
  }

  protected novaForm(): void {
    this.sucessoEnvio.set(false);
    this.erroEnvio.set('');
    this.avisoEnvio.set('');
    this.erroAnexos.set('');
    this.novosAnexos.set([]);
  }

  protected toggleTicket(id: string): void {
    this.ticketExpandido.update(v => v === id ? null : id);
    this.novaMensagem.set('');
    this.respostaAnexos.set([]);
    this.erroMensagem.set('');
  }

  protected async enviarMensagem(ticketId: string): Promise<void> {
    const msg = this.novaMensagem().trim();
    const anexos = this.respostaAnexos();
    if (!msg && anexos.length === 0) return;
    this.enviandoMensagem.set(true);
    this.erroMensagem.set('');
    const result = await this.suporteService.enviarMensagem(
      ticketId,
      msg || 'Anexo enviado.',
      anexos,
    );
    if (result.ok) {
      this.novaMensagem.set('');
      this.respostaAnexos.set([]);
      this.erroMensagem.set(result.warning ?? '');
    } else {
      this.erroMensagem.set(result.error || 'Não foi possível enviar.');
    }
    this.enviandoMensagem.set(false);
  }

  protected async reabrirTicket(ticketId: string): Promise<void> {
    if (this.reabrindoTicket()) return;

    this.reabrindoTicket.set(true);
    this.erroMensagem.set('');
    try {
      const result = await this.suporteService.reabrirTicket(ticketId);
      if (result.ok) {
        this.novaMensagem.set('');
        this.respostaAnexos.set([]);
      } else {
        this.erroMensagem.set(result.error || 'Não foi possível reabrir o chamado.');
      }
    } catch {
      this.erroMensagem.set('Não foi possível reabrir o chamado.');
    } finally {
      this.reabrindoTicket.set(false);
    }
  }

  protected onNovosAnexosChange(event: Event): void {
    this.adicionarArquivos(event, this.novosAnexos(), (arquivos) => this.novosAnexos.set(arquivos), (erro) => this.erroAnexos.set(erro));
  }

  protected onRespostaAnexosChange(event: Event): void {
    this.adicionarArquivos(event, this.respostaAnexos(), (arquivos) => this.respostaAnexos.set(arquivos), (erro) => this.erroMensagem.set(erro));
  }

  protected removerNovoAnexo(index: number): void {
    this.novosAnexos.update((arquivos) => arquivos.filter((_, i) => i !== index));
    this.erroAnexos.set('');
  }

  protected removerRespostaAnexo(index: number): void {
    this.respostaAnexos.update((arquivos) => arquivos.filter((_, i) => i !== index));
    this.erroMensagem.set('');
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

  protected formatarTamanhoArquivo(bytes: number): string {
    return this.suporteService.formatarTamanhoArquivo(bytes);
  }

  protected anexoEhVideo(anexo: SuporteAnexo | File): boolean {
    const mimeType = 'type' in anexo ? anexo.type : anexo.mime_type;
    return mimeType.startsWith('video/');
  }

  private adicionarArquivos(
    event: Event,
    atuais: File[],
    salvar: (arquivos: File[]) => void,
    salvarErro: (erro: string) => void,
  ): void {
    const input = event.target as HTMLInputElement;
    const selecionados = Array.from(input.files ?? []);
    input.value = '';
    if (selecionados.length === 0) return;

    const validacao = this.suporteService.validarArquivos(selecionados, atuais);
    if (!validacao.ok) {
      salvarErro(validacao.error);
      return;
    }

    salvarErro('');
    salvar([...atuais, ...selecionados]);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.fechar();
  }
}
