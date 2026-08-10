import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Send, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-angular';
import { AdminService, AdminNotificacao } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import {
  AdminUserSearchComponent,
  UsuarioBusca,
} from '../../shared/components/admin-user-search/admin-user-search.component';
import { SEGMENTOS_ACESSO, type SegmentoAcesso } from '../../core/models/subscription.types';

const PAGE_SIZE = 20;

type NotifTipo = 'sistema' | 'conquista' | 'info' | 'aviso';

@Component({
  selector: 'app-admin-notificacoes',
  standalone: true,
  imports: [FormsModule, UiIconComponent, UiSelectComponent, AdminUserSearchComponent],
  templateUrl: './admin-notificacoes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotificacoesComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  private readonly userSearch = viewChild(AdminUserSearchComponent);

  protected readonly historico = signal<AdminNotificacao[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly enviando = signal(false);

  protected readonly tipo = signal<NotifTipo>('info');
  protected readonly titulo = signal('');
  protected readonly mensagem = signal('');

  protected readonly usuarioSelecionado = signal<UsuarioBusca | null>(null);

  // Público do broadcast. Ignorado quando há um usuário selecionado (envio
  // individual). Evita que aviso de assinante chegue em quem não paga.
  protected readonly segmento = signal<SegmentoAcesso>('todos');
  protected readonly opcoesSegmento: SelectOption[] = SEGMENTOS_ACESSO.map((s) => ({
    value: s.valor,
    label: `${s.label} · ${s.ajuda}`,
  }));
  protected readonly enviandoParaTodos = computed(() => this.usuarioSelecionado() === null);

  protected readonly pagina = signal(0);
  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.historico().length / PAGE_SIZE))
  );
  protected readonly historicoAtual = computed(() => {
    const ini = this.pagina() * PAGE_SIZE;
    return this.historico().slice(ini, ini + PAGE_SIZE);
  });
  protected readonly totalItens = computed(() => this.historico().length);

  protected readonly iconSend = Send;
  protected readonly iconRefresh = RefreshCw;
  protected readonly iconPrev = ChevronLeft;
  protected readonly iconNext = ChevronRight;

  protected readonly tiposDisponiveis: SelectOption[] = [
    { value: 'info', label: 'Info' },
    { value: 'sistema', label: 'Sistema' },
    { value: 'aviso', label: 'Aviso' },
    { value: 'conquista', label: 'Conquista' },
  ];

  async ngOnInit(): Promise<void> {
    await this.carregarHistorico();
  }

  async carregarHistorico(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarNotificacoesEnviadas(500);
    if (result.ok) {
      this.historico.set(result.data);
      this.pagina.set(0);
    } else {
      this.toast.error('Erro ao carregar histórico.');
    }
    this.isLoading.set(false);
  }

  protected irParaPagina(p: number): void {
    this.pagina.set(Math.max(0, Math.min(p, this.totalPaginas() - 1)));
  }

  async enviar(): Promise<void> {
    if (!this.titulo().trim()) return;
    this.enviando.set(true);

    const userId = this.usuarioSelecionado()?.id ?? null;
    const result = await this.adminService.enviarNotificacao(
      this.tipo(),
      this.titulo().trim(),
      this.mensagem().trim() || null,
      userId,
      this.segmento(),
    );

    if (result.ok) {
      const destino = userId ? `1 usuário` : `${result.data} usuários`;
      this.toast.success(`Notificação enviada para ${destino}.`);
      this.titulo.set('');
      this.mensagem.set('');
      this.usuarioSelecionado.set(null);
      this.userSearch()?.reset();
      await this.carregarHistorico();
    } else {
      this.toast.error('Erro ao enviar notificação.');
    }
    this.enviando.set(false);
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
