import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pencil, Trash2 } from 'lucide-angular';
import {
  AdminService,
  AdminComissaoCompetencia,
  AdminComissaoDetalhe,
  AdminComissaoVenda,
  AdminCupom,
  AdminPlanoOpcao,
  AdminUsuarioBusca,
  ComissaoStatus,
  CupomTipo,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import {
  SelectOption,
  UiSelectComponent,
} from '../../shared/components/ui/select/ui-select.component';
import { AdminPaginationComponent } from '../../shared/components/admin-pagination/admin-pagination.component';
import type { FaculdadeUnidade } from '../../core/models/faculdade-unidade';
import { faculdadeUnidadeLabel, formatarCentavos } from '../../shared/utils/admin-labels.util';

const PAGE_SIZE = 20;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Estado do formulário de cupom (criação e edição usam o mesmo). */
interface CupomForm {
  id: string | null;
  codigo: string;
  descricao: string;
  tipo: CupomTipo;
  /** Percentual quando tipo = 'percentual'; reais quando 'fixo'. */
  valor: number | null;
  planoId: string;
  ativo: boolean;
  expiraEm: string;
  maxUsos: number | null;
  maxPorUsuario: number | null;
  responsavelUserId: string | null;
  responsavelUserLabel: string;
  responsavelNome: string;
  comissaoAtiva: boolean;
  pctIpatinga: number | null;
  pctFora: number | null;
  planosAvancado: boolean;
  planosEssencial: boolean;
}

function formVazio(): CupomForm {
  return {
    id: null,
    codigo: '',
    descricao: '',
    tipo: 'percentual',
    valor: null,
    planoId: '',
    ativo: true,
    expiraEm: '',
    maxUsos: null,
    maxPorUsuario: null,
    responsavelUserId: null,
    responsavelUserLabel: '',
    responsavelNome: '',
    comissaoAtiva: false,
    pctIpatinga: null,
    pctFora: null,
    planosAvancado: true,
    planosEssencial: true,
  };
}

/** Ação de comissão que pede confirmação e aceita observação. */
interface AcaoComissao {
  tipo: 'fechar' | 'pagar' | 'reabrir' | 'recalcular';
  cupomId: string;
  competencia: string;
  codigo: string;
}

@Component({
  selector: 'app-admin-cupons',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiConfirmDialogComponent,
    UiIconComponent,
    UiSelectComponent,
    AdminPaginationComponent,
  ],
  templateUrl: './admin-cupons.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCuponsComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;

  protected readonly aba = signal<'cupons' | 'comissoes'>('cupons');

  // ══════════════════════════ Cupons ══════════════════════════

  protected readonly cupons = signal<AdminCupom[]>([]);
  protected readonly planos = signal<AdminPlanoOpcao[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly salvando = signal(false);
  protected readonly formAberto = signal(false);
  protected readonly form = signal<CupomForm>(formVazio());
  protected readonly cupomParaExcluir = signal<AdminCupom | null>(null);
  protected readonly pagina = signal(0);

  protected readonly cuponsPagina = computed(() => {
    const inicio = this.pagina() * PAGE_SIZE;
    return this.cupons().slice(inicio, inicio + PAGE_SIZE);
  });

  protected readonly opcoesTipo: SelectOption[] = [
    { value: 'percentual', label: 'Percentual (%)' },
    { value: 'fixo', label: 'Valor fixo (R$)' },
  ];

  protected readonly opcoesPlano = computed<SelectOption[]>(() => [
    { value: '', label: 'Qualquer plano' },
    ...this.planos()
      .filter((p) => p.ativo)
      .map((p) => ({ value: p.id, label: p.nome })),
  ]);

  // Busca de responsável com conta na plataforma.
  protected readonly buscaUsuario = signal('');
  protected readonly sugestoesUsuario = signal<AdminUsuarioBusca[]>([]);
  private buscaTimer: ReturnType<typeof setTimeout> | null = null;

  // ══════════════════════════ Comissões ══════════════════════════

  protected readonly competencias = signal<AdminComissaoCompetencia[]>([]);
  protected readonly carregandoComissoes = signal(false);
  protected readonly filtroCupomId = signal('');
  protected readonly filtroStatus = signal<'' | ComissaoStatus>('');
  protected readonly filtroAno = signal('');
  protected readonly paginaComissoes = signal(0);

  /** Competência expandida e o detalhe carregado dela. */
  protected readonly expandida = signal<string | null>(null);
  protected readonly detalhe = signal<AdminComissaoDetalhe | null>(null);
  protected readonly carregandoDetalhe = signal(false);

  protected readonly acao = signal<AcaoComissao | null>(null);
  protected readonly observacaoAcao = signal('');
  protected readonly processandoAcao = signal(false);

  protected readonly opcoesFiltroCupom = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos os cupons' },
    ...this.cupons().map((c) => ({ value: c.id, label: c.codigo })),
  ]);

  protected readonly opcoesFiltroStatus: SelectOption[] = [
    { value: '', label: 'Todos os status' },
    { value: 'aberta', label: 'Aberta' },
    { value: 'fechada', label: 'Fechada (a pagar)' },
    { value: 'paga', label: 'Paga' },
  ];

  /**
   * Anos já vistos em alguma carga. Acumulativo de propósito: se viesse só dos
   * dados atuais, filtrar por um ano apagaria os outros anos da própria lista.
   */
  private readonly anosConhecidos = signal<string[]>([]);

  protected readonly opcoesFiltroAno = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos os anos' },
    ...this.anosConhecidos().map((a) => ({ value: a, label: a })),
  ]);

  protected readonly competenciasPagina = computed(() => {
    const inicio = this.paginaComissoes() * PAGE_SIZE;
    return this.competencias().slice(inicio, inicio + PAGE_SIZE);
  });

  protected readonly totaisComissoes = computed(() => {
    const lista = this.competencias();
    const soma = (filtro: (c: AdminComissaoCompetencia) => boolean) =>
      lista.filter(filtro).reduce(
        (t, c) => t + (c.status === 'aberta' ? c.comissao_centavos : (c.fechado_comissao_centavos ?? 0)),
        0,
      );
    return {
      aberto: soma((c) => c.status === 'aberta'),
      aPagar: soma((c) => c.status === 'fechada'),
      pago: soma((c) => c.status === 'paga'),
      divergentes: lista.filter((c) => c.divergente).length,
    };
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.carregarCupons(), this.carregarPlanos()]);
  }

  protected async trocarAba(aba: 'cupons' | 'comissoes'): Promise<void> {
    this.aba.set(aba);
    // A aba de comissões carrega sozinha: não existe "gerar relatório".
    if (aba === 'comissoes' && this.competencias().length === 0) {
      await this.carregarComissoes();
    }
  }

  // ─────────────────────────── Cupons ───────────────────────────

  private async carregarCupons(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarCupons();
    if (result.ok) {
      this.cupons.set(result.data);
      this.pagina.set(0);
    } else {
      this.toast.error('Erro ao carregar cupons.');
    }
    this.isLoading.set(false);
  }

  private async carregarPlanos(): Promise<void> {
    const result = await this.adminService.listarPlanosOpcoes();
    if (result.ok) this.planos.set(result.data);
  }

  protected mudarPagina(pagina: number): void {
    const totalPaginas = Math.max(1, Math.ceil(this.cupons().length / PAGE_SIZE));
    this.pagina.set(Math.max(0, Math.min(pagina, totalPaginas - 1)));
  }

  protected abrirNovo(): void {
    this.form.set(formVazio());
    this.buscaUsuario.set('');
    this.sugestoesUsuario.set([]);
    this.formAberto.set(true);
  }

  protected abrirEdicao(c: AdminCupom): void {
    this.form.set({
      id: c.id,
      codigo: c.codigo,
      descricao: c.descricao ?? '',
      tipo: c.tipo,
      // Desconto fixo é guardado em centavos e editado em reais.
      valor: c.tipo === 'fixo' ? c.valor / 100 : c.valor,
      planoId: c.plano_id ?? '',
      ativo: c.ativo,
      expiraEm: c.expira_em ? c.expira_em.slice(0, 10) : '',
      maxUsos: c.max_usos,
      maxPorUsuario: c.max_por_usuario,
      responsavelUserId: c.responsavel_user_id,
      responsavelUserLabel: c.responsavel_user_id
        ? `${c.responsavel_user_nome ?? 'Sem nome'} · ${c.responsavel_user_email ?? ''}`
        : '',
      responsavelNome: c.responsavel_nome ?? '',
      comissaoAtiva: c.comissao_ativa,
      pctIpatinga: Number(c.comissao_pct_ipatinga),
      pctFora: Number(c.comissao_pct_fora),
      planosAvancado: c.comissao_planos_avancado,
      planosEssencial: c.comissao_planos_essencial,
    });
    this.buscaUsuario.set('');
    this.sugestoesUsuario.set([]);
    this.formAberto.set(true);
  }

  protected fecharForm(): void {
    this.formAberto.set(false);
  }

  protected atualizarForm<K extends keyof CupomForm>(campo: K, valor: CupomForm[K]): void {
    this.form.update((f) => ({ ...f, [campo]: valor }));
  }

  protected onBuscaUsuario(termo: string): void {
    this.buscaUsuario.set(termo);
    if (this.buscaTimer) clearTimeout(this.buscaTimer);
    if (termo.trim().length < 2) {
      this.sugestoesUsuario.set([]);
      return;
    }
    this.buscaTimer = setTimeout(async () => {
      const result = await this.adminService.buscarUsuariosCupom(termo.trim());
      this.sugestoesUsuario.set(result.ok ? result.data : []);
    }, 300);
  }

  protected selecionarResponsavel(u: AdminUsuarioBusca): void {
    this.form.update((f) => ({
      ...f,
      responsavelUserId: u.id,
      responsavelUserLabel: `${u.nome_completo ?? 'Sem nome'} · ${u.email}`,
    }));
    this.buscaUsuario.set('');
    this.sugestoesUsuario.set([]);
  }

  protected limparResponsavelUsuario(): void {
    this.form.update((f) => ({ ...f, responsavelUserId: null, responsavelUserLabel: '' }));
  }

  protected async salvar(): Promise<void> {
    const f = this.form();
    if (!f.codigo.trim() || !f.valor) {
      this.toast.error('Código e valor do desconto são obrigatórios.');
      return;
    }
    this.salvando.set(true);
    const result = await this.adminService.salvarCupom({
      id: f.id,
      codigo: f.codigo.trim().toUpperCase(),
      descricao: f.descricao.trim() || null,
      tipo: f.tipo,
      // Fixo entra em centavos; percentual é o número puro.
      valor: f.tipo === 'fixo' ? Math.round(f.valor * 100) : Math.round(f.valor),
      plano_id: f.planoId || null,
      ativo: f.ativo,
      // Fim do dia escolhido: o cupom vale durante toda a data de expiração.
      expira_em: f.expiraEm ? `${f.expiraEm}T23:59:59` : null,
      max_usos: f.maxUsos || null,
      max_por_usuario: f.maxPorUsuario || null,
      responsavel_user_id: f.responsavelUserId,
      responsavel_nome: f.responsavelNome.trim() || null,
      comissao_ativa: f.comissaoAtiva,
      comissao_pct_ipatinga: f.pctIpatinga ?? 0,
      comissao_pct_fora: f.pctFora ?? 0,
      comissao_planos_avancado: f.planosAvancado,
      comissao_planos_essencial: f.planosEssencial,
    });
    this.salvando.set(false);
    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }
    this.toast.success(f.id ? 'Cupom atualizado.' : 'Cupom criado.');
    this.formAberto.set(false);
    await this.carregarCupons();
  }

  protected async alternarAtivo(c: AdminCupom): Promise<void> {
    const result = await this.adminService.salvarCupom({
      id: c.id,
      codigo: c.codigo,
      descricao: c.descricao,
      tipo: c.tipo,
      valor: c.valor,
      plano_id: c.plano_id,
      ativo: !c.ativo,
      expira_em: c.expira_em,
      max_usos: c.max_usos,
      max_por_usuario: c.max_por_usuario,
      responsavel_user_id: c.responsavel_user_id,
      responsavel_nome: c.responsavel_nome,
      comissao_ativa: c.comissao_ativa,
      comissao_pct_ipatinga: Number(c.comissao_pct_ipatinga),
      comissao_pct_fora: Number(c.comissao_pct_fora),
      comissao_planos_avancado: c.comissao_planos_avancado,
      comissao_planos_essencial: c.comissao_planos_essencial,
    });
    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }
    this.toast.success(c.ativo ? 'Cupom desativado.' : 'Cupom ativado.');
    await this.carregarCupons();
  }

  protected solicitarExclusao(c: AdminCupom): void {
    this.cupomParaExcluir.set(c);
  }

  protected cancelarExclusao(): void {
    this.cupomParaExcluir.set(null);
  }

  protected async confirmarExclusao(): Promise<void> {
    const c = this.cupomParaExcluir();
    if (!c) return;
    this.cupomParaExcluir.set(null);
    const result = await this.adminService.excluirCupom(c.id);
    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }
    this.toast.success(
      result.data.excluido
        ? 'Cupom excluído.'
        : `Cupom já usado em ${result.data.usos} checkout(s): foi desativado em vez de excluído, para preservar o histórico.`,
    );
    await this.carregarCupons();
  }

  // ─────────────────────────── Comissões ───────────────────────────

  protected async carregarComissoes(): Promise<void> {
    this.carregandoComissoes.set(true);
    const result = await this.adminService.listarComissoesCompetencias(
      this.filtroCupomId() || null,
      this.filtroStatus() || null,
      this.filtroAno() ? Number(this.filtroAno()) : null,
    );
    this.carregandoComissoes.set(false);
    if (!result.ok) {
      this.toast.error('Erro ao carregar as comissões.');
      return;
    }
    this.competencias.set(result.data);
    this.paginaComissoes.set(0);
    this.anosConhecidos.update((anos) =>
      [...new Set([...anos, ...result.data.map((c) => c.competencia.slice(0, 4))])].sort((a, b) =>
        b.localeCompare(a),
      ),
    );
    // Se a competência aberta saiu do filtro, fecha o detalhe.
    const aberta = this.expandida();
    if (aberta && !result.data.some((c) => this.chave(c) === aberta)) {
      this.expandida.set(null);
      this.detalhe.set(null);
    }
  }

  protected mudarPaginaComissoes(pagina: number): void {
    const totalPaginas = Math.max(1, Math.ceil(this.competencias().length / PAGE_SIZE));
    this.paginaComissoes.set(Math.max(0, Math.min(pagina, totalPaginas - 1)));
  }

  protected chave(c: AdminComissaoCompetencia): string {
    return `${c.cupom_id}:${c.competencia}`;
  }

  protected async alternarDetalhe(c: AdminComissaoCompetencia): Promise<void> {
    const chave = this.chave(c);
    if (this.expandida() === chave) {
      this.expandida.set(null);
      this.detalhe.set(null);
      return;
    }
    this.expandida.set(chave);
    this.detalhe.set(null);
    this.carregandoDetalhe.set(true);
    const result = await this.adminService.getComissaoDetalhe(c.cupom_id, c.competencia);
    this.carregandoDetalhe.set(false);
    if (!result.ok) {
      this.toast.error(result.error);
      this.expandida.set(null);
      return;
    }
    this.detalhe.set(result.data);
  }

  protected pedirAcao(tipo: AcaoComissao['tipo'], c: AdminComissaoCompetencia): void {
    this.observacaoAcao.set(c.observacao ?? '');
    this.acao.set({ tipo, cupomId: c.cupom_id, competencia: c.competencia, codigo: c.codigo });
  }

  protected cancelarAcao(): void {
    this.acao.set(null);
    this.observacaoAcao.set('');
  }

  protected async confirmarAcao(): Promise<void> {
    const a = this.acao();
    if (!a) return;
    this.processandoAcao.set(true);
    const obs = this.observacaoAcao().trim() || null;

    const result =
      a.tipo === 'reabrir'
        ? await this.adminService.reabrirComissao(a.cupomId, a.competencia)
        : a.tipo === 'pagar'
          ? await this.adminService.marcarComissaoPaga(a.cupomId, a.competencia, obs)
          : await this.adminService.fecharComissao(a.cupomId, a.competencia, obs);

    this.processandoAcao.set(false);
    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }

    const mensagens: Record<AcaoComissao['tipo'], string> = {
      fechar: 'Competência fechada. O valor está congelado para repasse.',
      recalcular: 'Valor do fechamento atualizado com as vendas atuais.',
      pagar: 'Repasse marcado como pago.',
      reabrir: 'Competência reaberta. O valor volta a ser recalculado.',
    };
    this.toast.success(mensagens[a.tipo]);
    this.acao.set(null);
    this.observacaoAcao.set('');
    await this.carregarComissoes();
  }

  /** Abre o documento A4 em nova aba; o "Salvar como PDF" do navegador faz o resto. */
  protected emitirPdf(c: AdminComissaoCompetencia): void {
    window.open(`/imprimir/comissao/${c.cupom_id}/${c.competencia}`, '_blank');
  }

  // ─────────────────────────── Formatação ───────────────────────────

  protected valor(centavos: number | null | undefined): string {
    return formatarCentavos(centavos ?? 0);
  }

  protected dataBr(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  protected competenciaLabel(competencia: string): string {
    const [ano, mes] = competencia.split('-').map(Number);
    return `${MESES[mes - 1]} de ${ano}`;
  }

  /** Valor que vale para o repasse: congelado quando fechado, ao vivo quando aberto. */
  protected valorVigente(c: AdminComissaoCompetencia): number {
    return c.status === 'aberta' ? c.comissao_centavos : (c.fechado_comissao_centavos ?? 0);
  }

  protected statusLabel(c: AdminComissaoCompetencia): string {
    if (c.status === 'paga') return 'Paga';
    if (c.status === 'fechada') return 'A pagar';
    return c.em_andamento ? 'Em andamento' : 'Aberta';
  }

  protected statusClasse(c: AdminComissaoCompetencia): string {
    if (c.status === 'paga') return 'bg-green-100 text-green-700';
    if (c.status === 'fechada') return 'bg-blue-100 text-blue-700';
    return c.em_andamento ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700';
  }

  protected tituloAcao(tipo: AcaoComissao['tipo']): string {
    const mapa: Record<AcaoComissao['tipo'], string> = {
      fechar: 'Fechar competência',
      recalcular: 'Recalcular fechamento',
      pagar: 'Marcar repasse como pago',
      reabrir: 'Reabrir competência',
    };
    return mapa[tipo];
  }

  protected textoAcao(a: AcaoComissao): string {
    const mes = this.competenciaLabel(a.competencia);
    const mapa: Record<AcaoComissao['tipo'], string> = {
      fechar: `Congelar o valor de ${mes} do cupom ${a.codigo}. Vendas que entrarem depois não mudam este valor, mas aparecem como divergência.`,
      recalcular: `Atualizar o valor congelado de ${mes} do cupom ${a.codigo} com as vendas atuais.`,
      pagar: `Registrar o repasse de ${mes} do cupom ${a.codigo} como pago hoje.`,
      reabrir: `Descartar o fechamento de ${mes} do cupom ${a.codigo}. O valor volta a ser recalculado e a marca de pagamento é perdida.`,
    };
    return mapa[a.tipo];
  }

  protected unidadeLabel(v: AdminComissaoVenda): string {
    if (!v.unidade) return 'Não informada';
    return faculdadeUnidadeLabel(v.unidade as FaculdadeUnidade);
  }

  protected descontoLabel(c: AdminCupom): string {
    return c.tipo === 'percentual' ? `${c.valor}%` : formatarCentavos(c.valor);
  }

  protected comissaoResumo(c: AdminCupom): string {
    if (!c.comissao_ativa) return 'Sem comissão';
    const ipa = Number(c.comissao_pct_ipatinga);
    const fora = Number(c.comissao_pct_fora);
    const faixas = ipa === fora ? `${ipa}% geral` : `${ipa}% Ipatinga · ${fora}% fora`;
    const tiers = [
      c.comissao_planos_avancado ? 'Avançado' : null,
      c.comissao_planos_essencial ? 'Essencial' : null,
    ].filter(Boolean);
    return `${faixas} · ${tiers.length === 2 ? 'todos os planos' : (tiers[0] ?? 'nenhum plano')}`;
  }

  protected responsavelLabel(c: AdminCupom): string {
    if (c.responsavel_user_id) {
      return c.responsavel_user_nome ?? c.responsavel_user_email ?? 'Usuário';
    }
    return c.responsavel_nome ?? '—';
  }

  protected motivoLabel(motivo: string | null): string {
    const mapa: Record<string, string> = {
      comissao_desativada: 'Comissão desativada no cupom',
      tier_nao_elegivel: 'Plano fora da regra de comissão',
      percentual_zero: 'Percentual zerado para esta faixa',
      unidade_nao_informada: 'Unidade do aluno não informada',
    };
    return motivo ? (mapa[motivo] ?? motivo) : '';
  }
}
