import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Mail, RefreshCw, Send, TestTube2 } from 'lucide-angular';
import {
  AdminCampanhaEmail,
  AdminService,
  SegmentoCampanha,
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

const MODELO_INICIAL = `<div style="font-family:Inter,'Segoe UI',sans-serif;font-size:16px;line-height:1.6;color:#0f172a;max-width:560px;">
  <p>Oi, {{primeiro_nome}}!</p>

  <p>Vi que você criou sua conta na BoraMed mas ainda não começou.</p>

  <p>
    <a href="https://boramed.com.br/planos"
       style="display:inline-block;background:#2554dc;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
      Ver os planos
    </a>
  </p>

  <p>Bons estudos,<br />Equipe BoraMed</p>
</div>`;

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

  protected readonly iconMail = Mail;
  protected readonly iconSend = Send;
  protected readonly iconTeste = TestTube2;
  protected readonly iconRefresh = RefreshCw;

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
    { token: '{{link_descadastro}}', descricao: 'Link de opt-out (rodapé automático se ausente)' },
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
