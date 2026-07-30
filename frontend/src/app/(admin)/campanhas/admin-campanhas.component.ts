import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  Eye,
  Mail,
  Monitor,
  RefreshCw,
  Send,
  Smartphone,
  TestTube2,
  Users,
} from 'lucide-angular';
import {
  AdminCampanhaEmail,
  AdminDestinatarioCampanha,
  AdminService,
  PreviaCampanhaEmail,
  SegmentoCampanha,
  StatusDestinatarioCampanha,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import {
  SelectOption,
  UiSelectComponent,
} from '../../shared/components/ui/select/ui-select.component';

/** Rótulos dos segmentos. As chaves espelham `SegmentoCampanha`. */
const ROTULO_SEGMENTO: Record<SegmentoCampanha, string> = {
  sem_assinatura_ativa: 'Criou conta e não assina hoje',
  nunca_assinou: 'Nunca assinou',
  ex_assinantes: 'Ex-assinantes (assinou e saiu)',
  todos: 'Todos os alunos',
};

/**
 * Espera depois da última tecla antes de pedir a prévia. A renderização é uma
 * chamada à edge function — sem isto seria uma por caractere digitado.
 */
const DEBOUNCE_PREVIA_MS = 700;

/** Página do modal de destinatários. O teto da RPC é 500. */
const PAGINA_DESTINATARIOS = 200;

/** Filtros do modal. `null` = todos. */
const FILTROS_DESTINATARIO: readonly { valor: StatusDestinatarioCampanha | null; rotulo: string }[] =
  [
    { valor: null, rotulo: 'Todos' },
    { valor: 'enviado', rotulo: 'Enviados' },
    { valor: 'falhou', rotulo: 'Falhas' },
    { valor: 'cancelado', rotulo: 'Descadastrados' },
    { valor: 'pendente', rotulo: 'Pendentes' },
  ];

/** Larguras de simulação: ~600px é o padrão de e-mail; 375px é o iPhone base. */
const LARGURA_PREVIA = { desktop: 640, mobile: 375 } as const;

type ModoPrevia = keyof typeof LARGURA_PREVIA;

/**
 * Conteúdo inicial do card. NÃO é o e-mail inteiro: o header com a logo, o card
 * e o rodapé vêm do envelope da marca, aplicado no envio
 * (`_shared/campanha-email.ts`). Os estilos inline abaixo são os mesmos dos
 * templates de auth — título centralizado, texto em #64748b, botão em gradiente.
 */
const MODELO_INICIAL = `<h2 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:800;line-height:1.25;text-align:center;letter-spacing:-0.4px;">
  Sua conta está te esperando
</h2>

<p style="margin:0 0 14px;color:#64748b;font-size:15px;line-height:1.65;">
  Oi, {{primeiro_nome}}! Vi que você criou sua conta na BoraMed mas ainda não
  começou a estudar.
</p>

<p style="margin:0 0 14px;color:#64748b;font-size:15px;line-height:1.65;">
  São mais de <strong style="color:#0f172a;">2.800 questões</strong> comentadas,
  simulados personalizados e flashcards — tudo organizado por período.
</p>

<!-- Botão: tabela + gradiente com fallback, igual aos e-mails de auth. -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
  <tr>
    <td align="center" style="padding:26px 0 8px;">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="border-radius:10px;background:linear-gradient(135deg,#2451d8 0%,#1e40af 100%);mso-padding-alt:0;box-shadow:0 4px 14px rgba(36,81,216,0.35);">
            <a href="https://www.boramedoficial.com.br/#planos"
               style="display:block;padding:15px 40px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;text-align:center;letter-spacing:-0.1px;white-space:nowrap;">
              Ver os planos
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:18px 0 0;color:#64748b;font-size:15px;line-height:1.65;">
  Bons estudos,<br />Equipe BoraMed
</p>`;

@Component({
  selector: 'app-admin-campanhas',
  standalone: true,
  imports: [FormsModule, UiIconComponent, UiSelectComponent],
  templateUrl: './admin-campanhas.component.html',
  styleUrl: './admin-campanhas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCampanhasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly nome = signal('');
  protected readonly assunto = signal('');
  protected readonly html = signal(MODELO_INICIAL);
  protected readonly segmento = signal<SegmentoCampanha>('sem_assinatura_ativa');
  protected readonly emailTeste = signal('');

  protected readonly totalPublico = signal<number | null>(null);
  protected readonly contando = signal(false);
  protected readonly enviandoTeste = signal(false);
  protected readonly disparando = signal(false);
  protected readonly retomandoId = signal<string | null>(null);

  /**
   * Confirmação explícita antes do disparo. Campanha é irreversível: uma vez
   * na caixa de entrada, não volta.
   */
  protected readonly confirmandoDisparo = signal(false);

  protected readonly historico = signal<AdminCampanhaEmail[]>([]);
  protected readonly carregandoHistorico = signal(true);

  // ---- Prévia ----
  protected readonly previa = signal<PreviaCampanhaEmail | null>(null);
  protected readonly carregandoPrevia = signal(false);
  protected readonly erroPrevia = signal<string | null>(null);
  protected readonly mostrarPrevia = signal(true);
  protected readonly modoPrevia = signal<ModoPrevia>('desktop');

  protected readonly larguraPrevia = computed(() => LARGURA_PREVIA[this.modoPrevia()]);

  /**
   * O HTML vem da própria edge function, mas passa pelo `bypassSecurityTrust`
   * porque o sanitizer do Angular removeria os `style=` inline — justamente o
   * que dá o layout do e-mail. Seguro porque o destino é um `<iframe sandbox>`
   * sem `allow-scripts` nem `allow-same-origin`: nada ali executa nem alcança a
   * sessão do admin.
   */
  protected readonly previaSrcdoc = computed<SafeHtml | null>(() => {
    const html = this.previa()?.html;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  // ---- Modal de destinatários ----
  /** Campanha aberta no modal. `null` = modal fechado. */
  protected readonly campanhaAberta = signal<AdminCampanhaEmail | null>(null);
  protected readonly destinatarios = signal<AdminDestinatarioCampanha[]>([]);
  protected readonly totalDestinatarios = signal(0);
  protected readonly carregandoDestinatarios = signal(false);
  protected readonly filtroDestinatario = signal<StatusDestinatarioCampanha | null>(null);
  protected readonly filtrosDestinatario = FILTROS_DESTINATARIO;

  protected readonly temMaisDestinatarios = computed(
    () => this.destinatarios().length < this.totalDestinatarios(),
  );

  protected readonly iconMail = Mail;
  protected readonly iconSend = Send;
  protected readonly iconTeste = TestTube2;
  protected readonly iconRefresh = RefreshCw;
  protected readonly iconEye = Eye;
  protected readonly iconDesktop = Monitor;
  protected readonly iconMobile = Smartphone;
  protected readonly iconUsers = Users;

  constructor() {
    // Re-renderiza sozinho enquanto o admin escreve, com debounce. Fica no
    // effect (e não no ngModelChange) para cobrir também assunto e remetente
    // sem espalhar chamadas por vários handlers.
    effect((onCleanup) => {
      const assunto = this.assunto();
      const html = this.html();
      if (!this.mostrarPrevia() || !html.trim()) return;

      const timer = setTimeout(() => void this.atualizarPrevia(assunto, html), DEBOUNCE_PREVIA_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected readonly segmentosDisponiveis: SelectOption[] = (
    Object.keys(ROTULO_SEGMENTO) as SegmentoCampanha[]
  ).map((value) => ({ value, label: ROTULO_SEGMENTO[value] }));

  /**
   * Tokens de personalização, expostos como DADO e não escritos direto no
   * template — no HTML do Angular `{{...}}` seria interpretado como binding.
   */
  protected readonly variaveis: readonly { token: string; descricao: string }[] = [
    { token: '{{primeiro_nome}}', descricao: 'Primeiro nome ("Maria")' },
    { token: '{{nome}}', descricao: 'Nome completo' },
    { token: '{{email}}', descricao: 'E-mail do destinatário' },
    {
      token: '{{link_descadastro}}',
      descricao: 'Link de opt-out — só aparece se você colocar no conteúdo',
    },
  ];

  protected readonly formularioValido = computed(
    () =>
      this.nome().trim().length > 0 &&
      this.assunto().trim().length > 0 &&
      this.html().trim().length > 0,
  );

  protected readonly ocupado = computed(
    () => this.enviandoTeste() || this.disparando() || this.retomandoId() !== null,
  );

  async ngOnInit(): Promise<void> {
    await Promise.all([this.contarPublico(), this.carregarHistorico()]);
  }

  protected rotuloSegmento(valor: string): string {
    return ROTULO_SEGMENTO[valor as SegmentoCampanha] ?? valor;
  }

  protected async onSegmentoChange(valor: string): Promise<void> {
    this.segmento.set(valor as SegmentoCampanha);
    this.confirmandoDisparo.set(false);
    await this.contarPublico();
  }

  async contarPublico(): Promise<void> {
    this.contando.set(true);
    const resultado = await this.adminService.contarPublicoCampanha(this.segmento());
    if (resultado.ok) {
      this.totalPublico.set(resultado.data);
    } else {
      this.totalPublico.set(null);
      this.toast.error('Não foi possível contar o público.');
    }
    this.contando.set(false);
  }

  async carregarHistorico(): Promise<void> {
    this.carregandoHistorico.set(true);
    const resultado = await this.adminService.listarCampanhasEmail(50);
    if (resultado.ok) {
      this.historico.set(resultado.data);
    } else {
      this.toast.error('Erro ao carregar o histórico de campanhas.');
    }
    this.carregandoHistorico.set(false);
  }

  /**
   * Sequência das requisições de prévia. Digitação rápida gera chamadas
   * concorrentes; sem isto, uma resposta atrasada sobrescreveria o HTML mais
   * novo e o preview mostraria um estado que o textarea já não tem.
   */
  private previaSeq = 0;

  private async atualizarPrevia(assunto: string, html: string): Promise<void> {
    const seq = ++this.previaSeq;
    this.carregandoPrevia.set(true);

    const resultado = await this.adminService.previaCampanhaEmail(assunto, html);
    if (seq !== this.previaSeq) return; // resposta velha: a nova manda

    if (resultado.ok) {
      this.previa.set(resultado.data);
      this.erroPrevia.set(null);
    } else {
      this.erroPrevia.set(resultado.error);
    }
    this.carregandoPrevia.set(false);
  }

  protected alternarPrevia(): void {
    this.mostrarPrevia.update((valor) => !valor);
  }

  /** Retentativa manual — usada no estado de erro da prévia. */
  protected async recarregarPrevia(): Promise<void> {
    if (!this.html().trim()) return;
    await this.atualizarPrevia(this.assunto(), this.html());
  }

  async enviarTeste(): Promise<void> {
    if (!this.assunto().trim() || !this.html().trim()) {
      this.toast.error('Preencha assunto e corpo antes de testar.');
      return;
    }
    this.enviandoTeste.set(true);
    const resultado = await this.adminService.enviarCampanhaTeste(
      this.assunto().trim(),
      this.html(),
      this.emailTeste().trim() || null,
    );
    if (resultado.ok) {
      this.toast.success(`Teste enviado para ${resultado.data.destino ?? 'você'}.`);
    } else {
      this.toast.error(resultado.error);
    }
    this.enviandoTeste.set(false);
  }

  protected pedirConfirmacao(): void {
    if (!this.formularioValido()) {
      this.toast.error('Preencha nome, assunto e corpo do e-mail.');
      return;
    }
    if (!this.totalPublico()) {
      this.toast.error('Nenhum destinatário nesse segmento.');
      return;
    }
    this.confirmandoDisparo.set(true);
  }

  protected cancelarConfirmacao(): void {
    this.confirmandoDisparo.set(false);
  }

  async dispararAgora(): Promise<void> {
    this.confirmandoDisparo.set(false);
    this.disparando.set(true);

    const resultado = await this.adminService.dispararCampanhaEmail(
      this.nome().trim(),
      this.assunto().trim(),
      this.html(),
      this.segmento(),
    );

    if (resultado.ok) {
      const { enviados, falhas = 0, pendentes = 0, status } = resultado.data;
      if (status === 'falhou') {
        this.toast.error(
          'Nenhum e-mail saiu — confira a chave do Resend e o domínio do remetente.',
        );
      } else if (pendentes > 0) {
        this.toast.success(
          `${enviados} enviados. ${pendentes} ficaram pendentes — use "Retomar" no histórico.`,
        );
      } else if (falhas > 0) {
        this.toast.success(`${enviados} enviados, ${falhas} falharam.`);
      } else {
        this.toast.success(`Campanha enviada para ${enviados} pessoas.`);
      }
      this.nome.set('');
      await Promise.all([this.carregarHistorico(), this.contarPublico()]);
    } else {
      this.toast.error(resultado.error);
    }

    this.disparando.set(false);
  }

  async retomar(campanha: AdminCampanhaEmail): Promise<void> {
    this.retomandoId.set(campanha.id);
    const resultado = await this.adminService.retomarCampanhaEmail(campanha.id);
    if (resultado.ok) {
      this.toast.success(`Retomada: ${resultado.data.enviados} enviados agora.`);
      await this.carregarHistorico();
    } else {
      this.toast.error(resultado.error);
    }
    this.retomandoId.set(null);
  }

  // ---- Modal de destinatários ----

  async abrirDestinatarios(campanha: AdminCampanhaEmail): Promise<void> {
    this.campanhaAberta.set(campanha);
    this.filtroDestinatario.set(null);
    this.destinatarios.set([]);
    this.totalDestinatarios.set(0);
    await this.carregarDestinatarios();
  }

  protected fecharDestinatarios(): void {
    this.campanhaAberta.set(null);
    // Não guarda a lista: são e-mails de pessoas reais, não vale manter em
    // memória depois de fechar.
    this.destinatarios.set([]);
    this.totalDestinatarios.set(0);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.campanhaAberta()) this.fecharDestinatarios();
  }

  async filtrarDestinatarios(status: StatusDestinatarioCampanha | null): Promise<void> {
    if (this.filtroDestinatario() === status) return;
    this.filtroDestinatario.set(status);
    this.destinatarios.set([]);
    await this.carregarDestinatarios();
  }

  /** Próxima página, anexando ao que já está na tela. */
  async carregarMaisDestinatarios(): Promise<void> {
    await this.carregarDestinatarios(this.destinatarios().length);
  }

  private async carregarDestinatarios(offset = 0): Promise<void> {
    const campanha = this.campanhaAberta();
    if (!campanha) return;

    this.carregandoDestinatarios.set(true);
    const resultado = await this.adminService.listarDestinatariosCampanha(
      campanha.id,
      this.filtroDestinatario(),
      PAGINA_DESTINATARIOS,
      offset,
    );

    if (resultado.ok) {
      this.destinatarios.update((atual) =>
        offset === 0 ? resultado.data.itens : [...atual, ...resultado.data.itens],
      );
      // Página vazia não zera o total já conhecido — só a primeira página manda.
      if (offset === 0 || resultado.data.total > 0) {
        this.totalDestinatarios.set(resultado.data.total);
      }
    } else {
      this.toast.error(resultado.error);
    }
    this.carregandoDestinatarios.set(false);
  }

  protected rotuloStatusDestinatario(status: StatusDestinatarioCampanha): string {
    const rotulos: Record<StatusDestinatarioCampanha, string> = {
      enviado: 'Enviado',
      falhou: 'Falhou',
      cancelado: 'Descadastrado',
      pendente: 'Pendente',
    };
    return rotulos[status] ?? status;
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
