import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
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

type Aba = 'nova' | 'solicitacoes' | 'faq';

// MOCKED data - will be replaced in ETAPA 4
const MOCK_TICKETS: SuporteTicketComMensagens[] = [
  {
    id: '1',
    user_id: 'u1',
    titulo: 'Não consigo acessar minha conta',
    descricao: 'Estou tentando fazer login mas aparece erro 403.',
    categoria: 'problema_tecnico',
    status: 'em_andamento',
    criado_em: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    atualizado_em: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    mensagens: [
      {
        id: 'm1',
        ticket_id: '1',
        autor_id: 'u1',
        mensagem: 'Estou tentando fazer login mas aparece erro 403.',
        is_admin: false,
        criado_em: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm2',
        ticket_id: '1',
        autor_id: 'admin',
        mensagem: 'Olá! Estamos verificando o problema. Pode tentar limpar os cookies do navegador?',
        is_admin: true,
        criado_em: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: '2',
    user_id: 'u1',
    titulo: 'Dúvida sobre questão de cardiologia',
    descricao: 'A alternativa correta parece estar errada.',
    categoria: 'duvida_conteudo',
    status: 'resolvido',
    criado_em: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    atualizado_em: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    mensagens: [
      {
        id: 'm3',
        ticket_id: '2',
        autor_id: 'u1',
        mensagem: 'A alternativa correta parece estar errada na questão 42.',
        is_admin: false,
        criado_em: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm4',
        ticket_id: '2',
        autor_id: 'admin',
        mensagem: 'Verificamos e a alternativa está correta. A questão segue o gabarito oficial da prova de 2023.',
        is_admin: true,
        criado_em: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

const MOCK_FAQ: SuporteFaq[] = [
  {
    id: 'f1',
    pergunta: 'Como faço para redefinir minha senha?',
    resposta: 'Acesse a página de login e clique em "Esqueci minha senha". Você receberá um e-mail com o link para redefinição.',
    categoria: 'Conta',
    ordem: 1,
    ativo: true,
    criado_em: '',
    atualizado_em: '',
  },
  {
    id: 'f2',
    pergunta: 'Como funciona o modo competitivo?',
    resposta: 'No modo competitivo você compete em tempo real com outros estudantes, respondendo questões cronometradas. Sua posição no ranking é atualizada após cada rodada.',
    categoria: 'Funcionalidades',
    ordem: 2,
    ativo: true,
    criado_em: '',
    atualizado_em: '',
  },
  {
    id: 'f3',
    pergunta: 'Posso cancelar minha assinatura a qualquer momento?',
    resposta: 'Sim. Você pode cancelar sua assinatura a qualquer momento nas configurações do perfil. O acesso continua até o fim do período pago.',
    categoria: 'Assinatura',
    ordem: 3,
    ativo: true,
    criado_em: '',
    atualizado_em: '',
  },
  {
    id: 'f4',
    pergunta: 'As questões são atualizadas com frequência?',
    resposta: 'Sim! Nosso banco de questões é atualizado constantemente com questões de provas recentes e elaboradas pela nossa equipe médica.',
    categoria: 'Conteúdo',
    ordem: 4,
    ativo: true,
    criado_em: '',
    atualizado_em: '',
  },
];

@Component({
  selector: 'app-suporte-widget',
  standalone: true,
  imports: [FormsModule, NgClass, UiIconComponent],
  templateUrl: './suporte-widget.component.html',
  styleUrl: './suporte-widget.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuporteWidgetComponent {
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
  protected readonly tickets = signal<SuporteTicketComMensagens[]>(MOCK_TICKETS);
  protected readonly ticketExpandido = signal<string | null>(null);
  protected readonly novaMensagem = signal('');
  protected readonly enviandoMensagem = signal(false);

  // FAQ
  protected readonly faqItems = signal<SuporteFaq[]>(MOCK_FAQ);
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
