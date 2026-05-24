import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Send, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-angular';
import { AdminService, AdminNotificacao } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import type { Profile } from '../../core/models/auth.types';

const PAGE_SIZE = 20;

type NotifTipo = 'sistema' | 'conquista' | 'info' | 'aviso';

@Component({
  selector: 'app-admin-notificacoes',
  standalone: true,
  imports: [FormsModule, UiIconComponent, UiSelectComponent],
  templateUrl: './admin-notificacoes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotificacoesComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly elRef = inject(ElementRef);

  protected readonly historico = signal<AdminNotificacao[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly enviando = signal(false);

  protected readonly tipo = signal<NotifTipo>('info');
  protected readonly titulo = signal('');
  protected readonly mensagem = signal('');

  // autocomplete de usuário
  protected readonly buscaTexto = signal('');
  protected readonly resultados = signal<Profile[]>([]);
  protected readonly buscando = signal(false);
  protected readonly dropdownAberto = signal(false);
  protected readonly usuarioSelecionado = signal<Profile | null>(null);

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
  protected readonly iconX = X;
  protected readonly iconPrev = ChevronLeft;
  protected readonly iconNext = ChevronRight;

  protected readonly tiposDisponiveis: SelectOption[] = [
    { value: 'info', label: 'Info' },
    { value: 'sistema', label: 'Sistema' },
    { value: 'aviso', label: 'Aviso' },
    { value: 'conquista', label: 'Conquista' },
  ];

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    await this.carregarHistorico();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.dropdownAberto.set(false);
    }
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

  onBuscaInput(valor: string): void {
    this.buscaTexto.set(valor);
    this.usuarioSelecionado.set(null);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    if (!valor.trim()) {
      this.resultados.set([]);
      this.dropdownAberto.set(false);
      return;
    }

    this.debounceTimer = setTimeout(() => this.buscarUsuarios(valor), 300);
  }

  private async buscarUsuarios(termo: string): Promise<void> {
    this.buscando.set(true);
    const result = await this.adminService.listarUsuarios(termo);
    if (result.ok) {
      this.resultados.set(result.data.slice(0, 10));
      this.dropdownAberto.set(result.data.length > 0);
    }
    this.buscando.set(false);
  }

  selecionarUsuario(usuario: Profile): void {
    this.usuarioSelecionado.set(usuario);
    this.buscaTexto.set(usuario.nome_completo ?? usuario.email);
    this.dropdownAberto.set(false);
    this.resultados.set([]);
  }

  limparUsuario(): void {
    this.usuarioSelecionado.set(null);
    this.buscaTexto.set('');
    this.resultados.set([]);
    this.dropdownAberto.set(false);
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
    );

    if (result.ok) {
      const destino = userId ? `1 usuário` : `${result.data} usuários`;
      this.toast.success(`Notificação enviada para ${destino}.`);
      this.titulo.set('');
      this.mensagem.set('');
      this.limparUsuario();
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
