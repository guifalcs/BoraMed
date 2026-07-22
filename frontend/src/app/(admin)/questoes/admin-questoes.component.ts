import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminService,
  AdminQuestao,
  AdminQuestaoCompleta,
  AdminTema,
  AdminDisciplina,
  AlternativaPayload,
  QuestaoPayload,
} from '../../core/services/admin.service';
import type { Questao, QuestaoComAlternativas } from '../../core/models/questao';
import type { Tema } from '../../core/models/tema';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ChevronLeft, ChevronRight, Eye, GalleryHorizontalEnd, Pencil, RotateCcw, Trash2, X } from 'lucide-angular';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiCheckboxComponent } from '../../shared/components/ui/checkbox/ui-checkbox.component';
import { ImageUploadComponent } from '../../shared/components/image-upload/image-upload.component';
import { QuestaoCardComponent } from '../../shared/components/questao-card/questao-card.component';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const DATA_CURTA_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface AlternativaForm {
  letra: string;
  texto: string;
  correta: boolean;
  imagem_url: string | null;
}

interface QuestaoMetaItem {
  label: string;
  valor: string;
}

const LETRAS_MC = ['A', 'B', 'C', 'D', 'E'];

function alternativasIniciais(formato: string): AlternativaForm[] {
  if (formato === 'multipla_escolha') {
    return LETRAS_MC.map((letra, i) => ({ letra, texto: '', correta: i === 0, imagem_url: null }));
  }
  if (formato === 'verdadeiro_falso') {
    return [
      { letra: 'V', texto: 'Verdadeiro', correta: true, imagem_url: null },
      { letra: 'F', texto: 'Falso', correta: false, imagem_url: null },
    ];
  }
  return [];
}

@Component({
  selector: 'app-admin-questoes',
  standalone: true,
  imports: [
    FormsModule,
    SlicePipe,
    UiSelectComponent,
    UiConfirmDialogComponent,
    UiIconComponent,
    UiCheckboxComponent,
    ImageUploadComponent,
    QuestaoCardComponent,
    MarkdownComponent,
  ],
  templateUrl: './admin-questoes.component.html',
  providers: [provideMarkdown()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuestoesComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);

  // ---- Lista ----
  protected readonly questoes = signal<AdminQuestao[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly pagina = signal(0);
  protected readonly filtroStatus = signal('');
  protected readonly filtroTipo = signal('');
  protected readonly filtroFormato = signal('');
  // Agrupamento abertas × fechadas ('' | 'abertas' | 'fechadas').
  protected readonly filtroGrupoFormato = signal('');
  // Fila de revisão de conversão ('' | 'pendente').
  protected readonly filtroRevisao = signal('');
  protected readonly filtroDisciplina = signal('');
  protected readonly filtroAutor = signal('');
  protected readonly filtroDataDe = signal('');
  protected readonly filtroDataAte = signal('');
  // Só questões com imagem anexada.
  protected readonly filtroComImagem = signal(false);
  protected readonly busca = signal('');
  protected readonly processando = signal<string | null>(null);
  protected readonly porPagina = 50;

  // ---- Contadores (abertas × fechadas + pendentes de revisão de conversão) ----
  protected readonly contadores = signal<{
    total: number;
    fechadas: number;
    abertas: number;
    pendentesRevisao: number;
  } | null>(null);

  // ---- Autores (filtro "quem criou") ----
  protected readonly autoresDisponiveis = signal<{ id: string; nome_completo: string | null; email: string | null }[]>([]);

  protected readonly temFiltrosAtivos = computed(
    () =>
      !!this.filtroStatus() ||
      !!this.filtroTipo() ||
      !!this.filtroFormato() ||
      !!this.filtroGrupoFormato() ||
      !!this.filtroRevisao() ||
      !!this.filtroDisciplina() ||
      !!this.filtroAutor() ||
      !!this.filtroDataDe() ||
      !!this.filtroDataAte() ||
      this.filtroComImagem() ||
      !!this.busca().trim(),
  );

  // ---- Drawer ----
  protected readonly modoDrawer = signal<'fechado' | 'criar' | 'editar'>('fechado');
  protected readonly questaoEditandoId = signal<string | null>(null);
  // Grupo de equivalência da questão aberta no drawer de edição (para vincular cópias).
  private readonly grupoOriginalCarregado = signal<string | null>(null);
  // Origem de uma cópia discursiva em andamento (vincula a gêmea à fechada original).
  private readonly conversaoOrigem = signal<{ origemId: string; grupoExistente: string | null } | null>(null);
  protected readonly salvando = signal(false);
  protected readonly carregandoForm = signal(false);
  /** Quantos uploads de imagem estão em andamento no drawer (enunciado + alternativas). */
  protected readonly uploadsEmAndamento = signal(0);
  protected readonly temUploadPendente = computed(() => this.uploadsEmAndamento() > 0);

  // ---- Visualização ----
  protected readonly questaoVisualizada = signal<AdminQuestaoCompleta | null>(null);
  protected readonly carregandoVisualizacao = signal(false);

  // ---- Carrossel (preview estilo aluno) ----
  protected readonly carrosselAberto = signal(false);
  protected readonly carrosselIndice = signal(0);
  protected readonly carrosselCarregando = signal(false);
  /** Cache das questões completas já carregadas, no shape do QuestaoCardComponent. */
  private readonly carrosselCache = signal<Map<string, QuestaoComAlternativas>>(new Map());
  /** Resposta escolhida pelo admin em cada questão (id da questão → id da alternativa). Nunca persistido. */
  private readonly carrosselRespostas = signal<Map<string, string>>(new Map());
  private carrosselRequestId = 0;

  // ---- Campos do formulário ----
  protected readonly fEnunciado = signal('');
  protected readonly fEnunciadoApoio = signal('');
  protected readonly fFormato = signal('multipla_escolha');
  protected readonly fTipoQuestao = signal<'nacional' | 'processual' | 'laboratorio'>('nacional');
  protected readonly fFormatoProva = signal<string | null>(null);
  protected readonly fStatus = signal('rascunho');
  protected readonly fDisciplinaId = signal<string | null>(null);
  protected readonly fProvaId = signal<string | null>(null);
  protected readonly fOrdemNaProva = signal<number | null>(null);
  protected readonly fExplicacao = signal('');
  protected readonly fReferencia = signal('');
  protected readonly fFonte = signal('');
  protected readonly fRevisado = signal(false);
  protected readonly fAptoDesafio = signal(true);
  protected readonly fRecursoTexto = signal('');
  protected readonly fAnulada = signal(false);
  protected readonly fRespostaCorreta = signal('');
  protected readonly fRespostaModelo = signal('');
  protected readonly fPontosChave = signal<string[]>([]);
  protected readonly fPontoChaveNovo = signal('');
  protected readonly fCriterios = signal('');
  protected readonly fAlternativas = signal<AlternativaForm[]>(alternativasIniciais('multipla_escolha'));
  protected readonly fImagemUrl = signal<string | null>(null);
  protected readonly fImagemLegenda = signal('');
  protected readonly fTemas = signal<string[]>([]);
  protected readonly fTemaBusca = signal('');

  // ---- Dados para selects ----
  protected readonly provasDisponiveis = signal<{ id: string; nome: string }[]>([]);
  protected readonly temasDisponiveis = signal<AdminTema[]>([]);
  protected readonly disciplinasDisponiveis = signal<AdminDisciplina[]>([]);

  // ---- Opções dos selects ----
  protected readonly opcoesStatusFiltro: SelectOption[] = [
    { value: '', label: 'Todos os status' },
    { value: 'ativa', label: 'Ativa' },
    { value: 'rascunho', label: 'Rascunho' },
    { value: 'em_revisao', label: 'Em revisão' },
    { value: 'arquivada', label: 'Arquivada' },
  ];

  protected readonly opcoesFormato: SelectOption[] = [
    { value: 'multipla_escolha', label: 'Múltipla escolha' },
    { value: 'verdadeiro_falso', label: 'Verdadeiro / Falso' },
    { value: 'resposta_aberta_curta', label: 'Discursiva' },
  ];

  protected readonly opcoesTipoQuestao: SelectOption[] = [
    { value: 'nacional', label: 'Nacional' },
    { value: 'processual', label: 'Processual' },
    { value: 'laboratorio', label: 'Laboratório' },
  ];

  // ---- Opções dos filtros (com opção "Todos") ----
  protected readonly opcoesTipoFiltro: SelectOption[] = [
    { value: '', label: 'Todos os tipos' },
    ...this.opcoesTipoQuestao,
  ];

  protected readonly opcoesFormatoFiltro: SelectOption[] = [
    { value: '', label: 'Todos os formatos' },
    ...this.opcoesFormato,
  ];

  protected readonly opcoesDisciplinaFiltro = computed<SelectOption[]>(() => [
    { value: '', label: 'Todas as disciplinas' },
    ...this.disciplinasDisponiveis().map((d) => ({
      value: d.id,
      label: `${d.sigla}${d.nome ? ' — ' + d.nome : ''} (P${d.periodo})`,
    })),
  ]);

  protected readonly opcoesAutorFiltro = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos os autores' },
    ...this.autoresDisponiveis().map((a) => ({
      value: a.id,
      label: a.nome_completo?.trim() || a.email?.trim() || 'Sem nome',
    })),
  ]);

  protected readonly opcoesStatusForm: SelectOption[] = [
    { value: 'rascunho', label: 'Rascunho' },
    { value: 'ativa', label: 'Ativa' },
    { value: 'em_revisao', label: 'Em revisão' },
    { value: 'arquivada', label: 'Arquivada' },
  ];

  protected readonly opcoesDisciplina = computed<SelectOption[]>(() => [
    { value: '', label: 'Sem disciplina' },
    ...this.disciplinasDisponiveis().map((d) => ({
      value: d.id,
      label: `${d.sigla}${d.nome ? ' — ' + d.nome : ''} (P${d.periodo})`,
    })),
  ]);

  protected readonly opcoesFormatoProva = computed<SelectOption[]>(() => {
    if (this.fTipoQuestao() === 'nacional') {
      return [
        { value: '', label: 'Sem subtipo' },
        { value: 'N1', label: 'N1' },
        { value: 'N2', label: 'N2' },
        { value: 'integradora', label: 'Integradora' },
        { value: 'teste_progresso', label: 'Teste de Progresso' },
      ];
    }
    return [];
  });

  protected readonly iconChevronLeft = ChevronLeft;
  protected readonly iconChevronRight = ChevronRight;
  protected readonly iconEye = Eye;
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;
  protected readonly iconX = X;
  protected readonly iconCarrossel = GalleryHorizontalEnd;
  protected readonly iconRefazer = RotateCcw;

  /** URL original da imagem ao abrir o drawer; usada para limpeza no storage */
  private _urlAntesDeEditar: string | null = null;
  /** Imagens das alternativas presentes ao abrir o editor (para limpeza do storage). */
  private _altUrlsAntesDeEditar: string[] = [];
  /** Índice da alternativa com o uploader de imagem aberto (sem imagem ainda). */
  protected readonly altUploadAberto = signal<number | null>(null);
  private visualizacaoRequestId = 0;

  // ---- Confirm dialog ----
  protected readonly questaoParaDeletar = signal<AdminQuestao | null>(null);

  protected readonly mostrarAlternativas = computed(
    () => this.fFormato() === 'multipla_escolha' || this.fFormato() === 'verdadeiro_falso',
  );

  protected readonly ehDiscursiva = computed(() => this.fFormato() === 'resposta_aberta_curta');

  protected readonly visualizacaoAberta = computed(
    () => this.carregandoVisualizacao() || this.questaoVisualizada() !== null,
  );

  protected readonly questaoPreview = computed<QuestaoComAlternativas | null>(() => {
    const questao = this.questaoVisualizada();
    if (!questao) return null;
    return this.toQuestaoComAlternativas(questao);
  });

  /** Converte a questão administrativa completa no shape consumido pelo QuestaoCardComponent. */
  private toQuestaoComAlternativas(questao: AdminQuestaoCompleta): QuestaoComAlternativas {
    const disciplina = this.disciplinasDisponiveis().find((d) => d.id === questao.disciplina_id);

    return {
      id: questao.id,
      codigo_externo: questao.codigo_externo ?? null,
      enunciado_apoio: questao.enunciado_apoio ?? null,
      enunciado: questao.enunciado,
      imagem_url: questao.imagem_url ?? null,
      imagem_legenda: questao.imagem_legenda ?? null,
      formato: this.questaoFormato(questao.formato),
      tipo_questao: questao.tipo_questao,
      resposta_correta_texto: questao.resposta_correta_texto ?? null,
      respostas_aceitas: questao.respostas_aceitas ?? null,
      resposta_modelo: questao.resposta_modelo ?? null,
      pontos_chave: questao.pontos_chave ?? [],
      criterios_correcao: questao.criterios_correcao ?? null,
      recurso_texto: questao.recurso_texto ?? null,
      anulada: questao.anulada ?? false,
      explicacao: questao.explicacao ?? null,
      explicacao_alternativas: questao.explicacao_alternativas ?? null,
      referencia: questao.referencia ?? null,
      disciplina: disciplina?.sigla ?? null,
      periodo: disciplina?.periodo ?? null,
      prova_id: questao.prova_id ?? null,
      ordem_na_prova: questao.ordem_na_prova ?? null,
      fonte: questao.fonte ?? null,
      vezes_respondida: questao.vezes_respondida ?? 0,
      vezes_acertada: questao.vezes_acertada ?? 0,
      taxa_acerto: questao.taxa_acerto ?? null,
      status: this.questaoStatus(questao.status),
      revisado: questao.revisado ?? false,
      autor_id: questao.autor_id ?? null,
      revisor_id: questao.revisor_id ?? null,
      aprovada_em: questao.aprovada_em ?? null,
      publicada_em: questao.publicada_em ?? null,
      origem_geracao: questao.origem_geracao ?? 'manual',
      nivel_bloom: questao.nivel_bloom ?? null,
      formato_prova: this.questaoFormatoProva(questao.formato_prova),
      criado_em: questao.criado_em,
      atualizado_em: questao.atualizado_em,
      alternativas: questao.alternativas.map((alternativa, index) => ({
        id: alternativa.id ?? `${questao.id}-alternativa-${index}`,
        questao_id: questao.id,
        letra: alternativa.letra,
        texto: alternativa.texto,
        correta: alternativa.correta,
        ordem: alternativa.ordem,
        imagem_url: alternativa.imagem_url ?? null,
      })),
      temas: this.temasDaQuestao(questao.temas),
    };
  }

  protected readonly temasVisualizacao = computed(() => {
    const questao = this.questaoVisualizada();
    if (!questao || questao.temas.length === 0) return 'Sem temas vinculados';
    return this.temasDaQuestao(questao.temas).map((tema) => tema.nome).join(', ');
  });

  protected readonly gabaritoVisualizacao = computed(() => {
    const questao = this.questaoVisualizada();
    if (!questao) return '—';
    if (questao.formato === 'resposta_aberta_curta') {
      return questao.resposta_modelo || 'Sem resposta modelo';
    }
    const corretas = questao.alternativas
      .filter((alternativa) => alternativa.correta)
      .map((alternativa) => alternativa.letra);
    return corretas.length > 0 ? corretas.join(', ') : questao.resposta_correta_texto || 'Sem gabarito';
  });

  protected readonly metadadosVisualizacao = computed<QuestaoMetaItem[]>(() => {
    const questao = this.questaoVisualizada();
    if (!questao) return [];

    return [
      { label: 'Status', valor: this.statusLabel(questao.status) },
      { label: 'Tipo', valor: this.tipoQuestaoLabel(questao.tipo_questao) },
      { label: 'Formato', valor: this.formatoLabel(questao.formato) },
      { label: 'Subtipo', valor: questao.formato_prova || 'Sem subtipo' },
      { label: 'Disciplina', valor: this.disciplinaDisplay(questao.disciplina_id) },
      { label: 'Temas', valor: this.temasVisualizacao() },
      { label: 'Prova vinculada', valor: questao.prova?.nome ?? 'Nenhuma' },
      { label: 'Ordem na prova', valor: questao.ordem_na_prova != null ? String(questao.ordem_na_prova) : '—' },
      { label: 'Gabarito', valor: this.gabaritoVisualizacao() },
      { label: 'Revisada', valor: questao.revisado ? 'Sim' : 'Não' },
      { label: 'Apta para desafio diário', valor: questao.apto_desafio_diario ? 'Sim' : 'Não' },
      { label: 'Anulada', valor: questao.anulada ? 'Sim — fora das métricas' : 'Não' },
      { label: 'Recurso', valor: (questao.recurso_texto ?? '').trim() ? 'Cadastrado' : 'Nenhum' },
      { label: 'Taxa de acerto', valor: questao.taxa_acerto != null ? `${questao.taxa_acerto}%` : 'Sem dados' },
      { label: 'Respostas', valor: String(questao.vezes_respondida ?? 0) },
      { label: 'Fonte', valor: questao.fonte || '—' },
      { label: 'Referência', valor: questao.referencia || '—' },
      { label: 'Criada em', valor: this.dataLabel(questao.criado_em) },
      { label: 'Atualizada em', valor: this.dataLabel(questao.atualizado_em) },
    ];
  });

  protected readonly opcoesProva = computed(() => [
    { value: '', label: 'Nenhuma' },
    ...this.provasDisponiveis().map((p) => ({ value: p.id, label: p.nome })),
  ]);

  protected readonly temasVisiveis = computed(() => {
    const q = this.fTemaBusca().toLowerCase();
    if (!q) return this.temasDisponiveis();
    return this.temasDisponiveis().filter((t) => t.nome.toLowerCase().includes(q));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.carregar(), this.carregarDropdowns()]);
  }

  private async carregarDropdowns(): Promise<void> {
    const [provasRes, temasRes, disciplinasRes, autoresRes] = await Promise.all([
      this.adminService.listarProvasSimples(),
      this.adminService.listarTemas(),
      this.adminService.listarDisciplinas(),
      this.adminService.listarAutores(),
    ]);
    if (provasRes.ok) this.provasDisponiveis.set(provasRes.data);
    if (temasRes.ok) this.temasDisponiveis.set(temasRes.data);
    if (disciplinasRes.ok) this.disciplinasDisponiveis.set(disciplinasRes.data);
    if (autoresRes.ok) this.autoresDisponiveis.set(autoresRes.data);
  }

  // ---- Operações da lista ----

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarQuestoes(this.pagina(), this.porPagina, {
      status: this.filtroStatus() || undefined,
      busca: this.busca() || undefined,
      tipoQuestao: this.filtroTipo() || undefined,
      formato: this.filtroFormato() || undefined,
      grupoFormato: this.filtroGrupoFormato() || undefined,
      revisaoConversao: this.filtroRevisao() || undefined,
      disciplinaId: this.filtroDisciplina() || undefined,
      autorId: this.filtroAutor() || undefined,
      dataDe: this.filtroDataDe() || undefined,
      dataAte: this.filtroDataAte() || undefined,
      comImagem: this.filtroComImagem() || undefined,
    });
    if (result.ok) {
      this.questoes.set(result.data.questoes);
      this.total.set(result.data.total);
    } else {
      this.toast.error('Erro ao carregar questões.');
    }
    this.isLoading.set(false);
    void this.atualizarContadores();
  }

  private async atualizarContadores(): Promise<void> {
    const res = await this.adminService.contarQuestoesPorFormato();
    if (res.ok) this.contadores.set(res.data);
  }

  async aplicarFiltros(): Promise<void> {
    this.pagina.set(0);
    await this.carregar();
  }

  async limparFiltros(): Promise<void> {
    this.filtroStatus.set('');
    this.filtroTipo.set('');
    this.filtroFormato.set('');
    this.filtroGrupoFormato.set('');
    this.filtroRevisao.set('');
    this.filtroDisciplina.set('');
    this.filtroAutor.set('');
    this.filtroDataDe.set('');
    this.filtroDataAte.set('');
    this.filtroComImagem.set(false);
    this.busca.set('');
    await this.aplicarFiltros();
  }

  /** Quick-filter: só as convertidas aguardando revisão do sócio. */
  async filtrarPendentesRevisao(): Promise<void> {
    this.filtroRevisao.set(this.filtroRevisao() === 'pendente' ? '' : 'pendente');
    await this.aplicarFiltros();
  }

  /** Alterna o agrupamento abertas × fechadas (chip do topo). */
  async filtrarGrupoFormato(valor: 'abertas' | 'fechadas'): Promise<void> {
    this.filtroGrupoFormato.set(this.filtroGrupoFormato() === valor ? '' : valor);
    await this.aplicarFiltros();
  }

  /** Marca uma questão convertida como já revisada pelo sócio (limpa a flag da fila). */
  async marcarRevisada(questao: AdminQuestao): Promise<void> {
    if (this.processando()) return;
    this.processando.set(questao.id);
    const result = await this.adminService.marcarRevisaoConversao(questao.id, 'revisada');
    if (result.ok) {
      this.questoes.update((lista) =>
        lista.map((q) => (q.id === questao.id ? { ...q, revisao_conversao: 'revisada' } : q)),
      );
      // Se o filtro atual é "pendentes", a questão sai da lista visível.
      if (this.filtroRevisao() === 'pendente') {
        this.questoes.update((lista) => lista.filter((q) => q.id !== questao.id));
      }
      void this.atualizarContadores();
      this.toast.success('Marcada como revisada.');
    } else {
      this.toast.error('Erro ao marcar como revisada.');
    }
    this.processando.set(null);
  }

  async paginaAnterior(): Promise<void> {
    if (this.pagina() === 0) return;
    this.pagina.update((p) => p - 1);
    await this.carregar();
  }

  async proximaPagina(): Promise<void> {
    if ((this.pagina() + 1) * this.porPagina >= this.total()) return;
    this.pagina.update((p) => p + 1);
    await this.carregar();
  }

  async alterarStatus(questao: AdminQuestao, status: string): Promise<void> {
    if (this.processando()) return;
    this.processando.set(questao.id);
    const result = await this.adminService.atualizarQuestao(questao.id, { status });
    if (result.ok) {
      this.questoes.update((lista) =>
        lista.map((q) => (q.id === questao.id ? { ...q, status } : q)),
      );
      this.toast.success('Status atualizado.');
    } else {
      this.toast.error('Erro ao atualizar status.');
    }
    this.processando.set(null);
  }

  protected solicitarDelete(questao: AdminQuestao): void {
    this.questaoParaDeletar.set(questao);
  }

  protected cancelarDelete(): void {
    this.questaoParaDeletar.set(null);
  }

  async confirmarDelete(): Promise<void> {
    const questao = this.questaoParaDeletar();
    if (!questao) return;
    this.questaoParaDeletar.set(null);
    const result = await this.adminService.deletarQuestao(questao.id);
    if (result.ok) {
      this.questoes.update((lista) => lista.filter((q) => q.id !== questao.id));
      this.total.update((t) => t - 1);
      this.toast.success(result.data.modo === 'soft'
        ? 'Questão removida do banco. As respostas já dadas por alunos seguem visíveis no histórico deles.'
        : 'Questão deletada.');
    } else {
      this.toast.error(result.error);
    }
  }

  protected formatoLabel(formato: string): string {
    const map: Record<string, string> = {
      multipla_escolha: 'Múltipla',
      verdadeiro_falso: 'V / F',
      resposta_aberta_curta: 'Discursiva',
      discursiva: 'Discursiva',
    };
    return map[formato] ?? formato;
  }

  protected taxaAcertoClass(taxa: number): string {
    if (taxa < 40) return 'taxa-badge--baixa';
    if (taxa < 70) return 'taxa-badge--media';
    return 'taxa-badge--alta';
  }

  protected tipoQuestaoLabel(tipo: string): string {
    const map: Record<string, string> = {
      nacional: 'Nacional',
      processual: 'Processual',
      laboratorio: 'Laboratório',
    };
    return map[tipo] ?? tipo;
  }

  protected statusLabel(status: string): string {
    const map: Record<string, string> = {
      ativa: 'Ativa',
      rascunho: 'Rascunho',
      em_revisao: 'Em revisão',
      arquivada: 'Arquivada',
      publicada: 'Publicada',
    };
    return map[status] ?? status;
  }

  protected temRecurso(q: AdminQuestao): boolean {
    return (q.recurso_texto ?? '').trim().length > 0;
  }

  protected disciplinaSiglaFor(id: string | null | undefined): string {
    if (!id) return '';
    return this.disciplinasDisponiveis().find((d) => d.id === id)?.sigla ?? '';
  }

  protected disciplinaDisplay(id: string | null | undefined): string {
    if (!id) return 'Sem disciplina';
    const disciplina = this.disciplinasDisponiveis().find((d) => d.id === id);
    if (!disciplina) return 'Disciplina não encontrada';
    return `${disciplina.sigla}${disciplina.nome ? ' — ' + disciplina.nome : ''} (P${disciplina.periodo})`;
  }

  protected autorNome(id: string | null | undefined): string {
    if (!id) return '—';
    const autor = this.autoresDisponiveis().find((a) => a.id === id);
    return autor?.nome_completo?.trim() || autor?.email?.trim() || 'Desconhecido';
  }

  protected dataLabel(data: string | null | undefined): string {
    if (!data) return '—';
    return DATE_FMT.format(new Date(data));
  }

  protected dataCurta(data: string | null | undefined): string {
    if (!data) return '—';
    return DATA_CURTA_FMT.format(new Date(data));
  }

  private temasDaQuestao(ids: string[]): Tema[] {
    return ids
      .map((id) => this.temasDisponiveis().find((tema) => tema.id === id))
      .filter((tema): tema is AdminTema => tema !== undefined)
      .map((tema) => {
        const disciplina = this.disciplinasDisponiveis().find((d) => d.id === tema.disciplina_id);
        return {
          id: tema.id,
          nome: tema.nome,
          disciplina_id: tema.disciplina_id,
          disciplina: disciplina?.sigla ?? null,
          periodo: disciplina?.periodo ?? null,
          parent_id: null,
          criado_em: tema.criado_em,
        };
      });
  }

  private questaoFormato(formato: string): Questao['formato'] {
    if (
      formato === 'multipla_escolha' ||
      formato === 'resposta_aberta_curta' ||
      formato === 'verdadeiro_falso' ||
      formato === 'associacao'
    ) {
      return formato;
    }
    return 'multipla_escolha';
  }

  private questaoStatus(status: string): Questao['status'] {
    if (
      status === 'ativa' ||
      status === 'rascunho' ||
      status === 'arquivada' ||
      status === 'em_revisao' ||
      status === 'publicada'
    ) {
      return status;
    }
    return 'rascunho';
  }

  private questaoFormatoProva(formato: string | null): Questao['formato_prova'] {
    if (
      formato === 'N1' ||
      formato === 'N2' ||
      formato === 'integradora' ||
      formato === 'teste_progresso' ||
      formato === 'nacional' ||
      formato === 'processual' ||
      formato === 'laboratorio'
    ) {
      return formato;
    }
    return null;
  }

  protected get totalPaginas(): number {
    return Math.ceil(this.total() / this.porPagina);
  }

  protected get paginaAtual(): number {
    return this.pagina() + 1;
  }

  // ---- Drawer: abrir/fechar ----

  protected abrirCriar(): void {
    this.resetForm();
    this._urlAntesDeEditar = null;
    this.questaoEditandoId.set(null);
    this.conversaoOrigem.set(null);
    this.modoDrawer.set('criar');
  }

  protected async abrirVisualizar(q: AdminQuestao): Promise<void> {
    const requestId = ++this.visualizacaoRequestId;
    this.questaoVisualizada.set(null);
    this.carregandoVisualizacao.set(true);

    const result = await this.adminService.buscarQuestaoCompleta(q.id);
    if (requestId !== this.visualizacaoRequestId) return;

    if (!result.ok) {
      this.toast.error('Erro ao carregar visualização da questão.');
      this.carregandoVisualizacao.set(false);
      return;
    }

    this.questaoVisualizada.set(result.data);
    this.carregandoVisualizacao.set(false);
  }

  protected fecharVisualizacao(): void {
    this.visualizacaoRequestId++;
    this.carregandoVisualizacao.set(false);
    this.questaoVisualizada.set(null);
  }

  // ---- Carrossel ----

  protected readonly carrosselTotal = computed(() => this.questoes().length);

  /** Item da lista (AdminQuestao) na posição atual do carrossel. */
  protected readonly carrosselQuestaoLista = computed(() => this.questoes()[this.carrosselIndice()] ?? null);

  /** Questão completa (com alternativas) já carregada para a posição atual, ou null se ainda carregando. */
  protected readonly carrosselQuestao = computed<QuestaoComAlternativas | null>(() => {
    const item = this.carrosselQuestaoLista();
    if (!item) return null;
    return this.carrosselCache().get(item.id) ?? null;
  });

  /** Alternativa escolhida pelo admin na questão atual. */
  protected readonly carrosselRespostaAtual = computed<string | null>(() => {
    const item = this.carrosselQuestaoLista();
    if (!item) return null;
    return this.carrosselRespostas().get(item.id) ?? null;
  });

  /** Id da alternativa correta — só revelado depois que o admin responde (igual ao modo estudo do aluno). */
  protected readonly carrosselCorretaAtual = computed<string | null>(() => {
    const questao = this.carrosselQuestao();
    if (!questao) return null;
    if (this.carrosselRespostaAtual() === null) return null;
    return questao.alternativas.find((a) => a.correta)?.id ?? null;
  });

  protected readonly carrosselRespondida = computed(() => this.carrosselRespostaAtual() !== null);

  /** Disciplina exibida no cabeçalho do carrossel. */
  protected readonly carrosselDisciplina = computed(() => {
    const item = this.carrosselQuestaoLista();
    if (!item) return '';
    return this.disciplinaSiglaFor(item.disciplina_id);
  });

  protected async abrirCarrossel(): Promise<void> {
    if (this.questoes().length === 0) {
      this.toast.error('Nenhuma questão para visualizar.');
      return;
    }
    // Estado limpo a cada abertura — nada é persistido entre sessões.
    this.carrosselCache.set(new Map());
    this.carrosselRespostas.set(new Map());
    this.carrosselIndice.set(0);
    this.carrosselAberto.set(true);
    await this.carrosselGarantirCarregada(0);
  }

  protected fecharCarrossel(): void {
    this.carrosselRequestId++;
    this.carrosselAberto.set(false);
    this.carrosselCarregando.set(false);
  }

  protected async carrosselAnterior(): Promise<void> {
    if (this.carrosselIndice() === 0) return;
    const novo = this.carrosselIndice() - 1;
    this.carrosselIndice.set(novo);
    await this.carrosselGarantirCarregada(novo);
  }

  protected async carrosselProximo(): Promise<void> {
    if (this.carrosselIndice() >= this.carrosselTotal() - 1) return;
    const novo = this.carrosselIndice() + 1;
    this.carrosselIndice.set(novo);
    await this.carrosselGarantirCarregada(novo);
  }

  /** Registra a resposta do admin (feedback estático, sem métricas). Trava após responder, como no modo estudo. */
  protected carrosselResponder(alternativaId: string): void {
    const item = this.carrosselQuestaoLista();
    if (!item) return;
    if (this.carrosselRespostas().has(item.id)) return;
    this.carrosselRespostas.update((m) => new Map(m).set(item.id, alternativaId));
  }

  /** Limpa a resposta da questão atual para o admin refazer o fluxo. */
  protected carrosselRefazer(): void {
    const item = this.carrosselQuestaoLista();
    if (!item) return;
    this.carrosselRespostas.update((m) => {
      const next = new Map(m);
      next.delete(item.id);
      return next;
    });
  }

  /** Carrega a questão completa da posição indicada, com cache e proteção contra corrida de navegação. */
  private async carrosselGarantirCarregada(indice: number): Promise<void> {
    const item = this.questoes()[indice];
    if (!item || this.carrosselCache().has(item.id)) {
      this.carrosselCarregando.set(false);
      return;
    }

    const requestId = ++this.carrosselRequestId;
    this.carrosselCarregando.set(true);

    const result = await this.adminService.buscarQuestaoCompleta(item.id);
    if (requestId !== this.carrosselRequestId) return;

    if (result.ok) {
      this.carrosselCache.update((m) => new Map(m).set(item.id, this.toQuestaoComAlternativas(result.data)));
    } else {
      this.toast.error('Erro ao carregar questão do carrossel.');
    }
    this.carrosselCarregando.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  protected onCarrosselKeydown(event: KeyboardEvent): void {
    if (!this.carrosselAberto()) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      void this.carrosselProximo();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      void this.carrosselAnterior();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.fecharCarrossel();
    }
  }

  protected async abrirEditar(q: AdminQuestao): Promise<void> {
    this.resetForm();
    this.questaoEditandoId.set(q.id);
    this.modoDrawer.set('editar');
    this.carregandoForm.set(true);

    const result = await this.adminService.buscarQuestaoCompleta(q.id);
    if (!result.ok) {
      this.toast.error('Erro ao carregar questão.');
      this.modoDrawer.set('fechado');
      this.carregandoForm.set(false);
      return;
    }

    const d = result.data;
    this.fEnunciado.set(d.enunciado ?? '');
    this.fEnunciadoApoio.set(d.enunciado_apoio ?? '');
    this.fFormato.set(d.formato ?? 'multipla_escolha');
    this.fTipoQuestao.set(d.tipo_questao ?? 'nacional');
    this.fFormatoProva.set(d.formato_prova ?? null);
    this.fStatus.set(d.status ?? 'rascunho');
    this.fDisciplinaId.set(d.disciplina_id ?? null);
    this.fProvaId.set(d.prova_id ?? null);
    this.fOrdemNaProva.set(d.ordem_na_prova ?? null);
    this.fExplicacao.set(d.explicacao ?? '');
    this.fReferencia.set(d.referencia ?? '');
    this.fFonte.set(d.fonte ?? '');
    this.fRevisado.set(d.revisado ?? false);
    this.fAptoDesafio.set(d.apto_desafio_diario ?? true);
    this.fRecursoTexto.set(d.recurso_texto ?? '');
    this.fAnulada.set(d.anulada ?? false);
    this.fRespostaCorreta.set(d.resposta_correta_texto ?? '');
    this.fRespostaModelo.set(d.resposta_modelo ?? '');
    this.fPontosChave.set(d.pontos_chave ?? []);
    this.fCriterios.set(d.criterios_correcao ?? '');
    this.fImagemUrl.set(d.imagem_url ?? null);
    this._urlAntesDeEditar = d.imagem_url ?? null;
    this.fImagemLegenda.set(d.imagem_legenda ?? '');
    this.fTemas.set(d.temas ?? []);
    this.grupoOriginalCarregado.set(d.grupo_equivalencia_id ?? null);

    if (d.alternativas.length > 0) {
      this.fAlternativas.set(
        d.alternativas.map((a) => ({
          letra: a.letra,
          texto: a.texto,
          correta: a.correta,
          imagem_url: a.imagem_url ?? null,
        })),
      );
    } else {
      this.fAlternativas.set(alternativasIniciais(d.formato));
    }
    this._altUrlsAntesDeEditar = d.alternativas
      .map((a) => a.imagem_url)
      .filter((u): u is string => !!u);

    this.carregandoForm.set(false);
  }

  protected fecharDrawer(): void {
    if (this.salvando()) return;
    // Apaga upload de sessão se o usuário cancelou com imagem diferente da original
    const sessionUrl = this.fImagemUrl();
    if (sessionUrl && sessionUrl !== this._urlAntesDeEditar) {
      this.adminService.deletarArquivoStorage(sessionUrl);
    }
    // Idem para imagens de alternativas enviadas nesta sessão
    for (const alt of this.fAlternativas()) {
      if (alt.imagem_url && !this._altUrlsAntesDeEditar.includes(alt.imagem_url)) {
        this.adminService.deletarArquivoStorage(alt.imagem_url);
      }
    }
    this.modoDrawer.set('fechado');
  }

  // ---- Formulário: mutações ----

  protected onFormatoChange(formato: string): void {
    // Trocar o formato descarta as alternativas do form: apaga do storage os
    // uploads feitos nesta sessão (os originais só são apagados no salvar).
    for (const alt of this.fAlternativas()) {
      if (alt.imagem_url && !this._altUrlsAntesDeEditar.includes(alt.imagem_url)) {
        this.adminService.deletarArquivoStorage(alt.imagem_url);
      }
    }
    this.altUploadAberto.set(null);
    this.fFormato.set(formato);
    this.fAlternativas.set(alternativasIniciais(formato));
  }

  /** Conversão fechada→aberta (reversível: alternativas são preservadas no banco). */
  protected readonly podeConverterParaDiscursiva = computed(
    () => this.modoDrawer() === 'editar' && this.mostrarAlternativas(),
  );

  /** Resposta modelo/pontos-chave sugeridos a partir da alternativa correta + explicação. */
  private gabaritoAbertoSugerido(): { respostaModelo: string; pontosChave: string[] } {
    const correta = this.fAlternativas().find((a) => a.correta)?.texto.trim();
    const respostaModelo = this.fRespostaModelo().trim()
      || [correta, this.fExplicacao().trim()].filter(Boolean).join('\n\n');
    const pontosChave = this.fPontosChave().length > 0
      ? this.fPontosChave()
      : correta ? [correta] : [];
    return { respostaModelo, pontosChave };
  }

  protected converterParaDiscursiva(): void {
    if (!this.podeConverterParaDiscursiva()) return;

    const sugerido = this.gabaritoAbertoSugerido();
    this.fRespostaModelo.set(sugerido.respostaModelo);
    this.fPontosChave.set(sugerido.pontosChave);

    this.fFormato.set('resposta_aberta_curta');
    this.toast.success(
      'Convertida para discursiva. Revise a resposta modelo e os pontos-chave antes de salvar — as alternativas ficam preservadas caso queira reverter.',
    );
  }

  /**
   * Prepara o formulário como uma NOVA questão discursiva a partir da atual
   * (sem alterar a original). Só cria no banco quando o admin clicar em Salvar.
   */
  protected criarCopiaDiscursiva(): void {
    if (!this.podeConverterParaDiscursiva() || this.salvando()) return;

    const sugerido = this.gabaritoAbertoSugerido();
    const tinhaImagem = !!this.fImagemUrl();

    // Vincula a gêmea à fechada original: reaproveita o grupo existente ou marca
    // para o save() criar um novo (e carimbar a original também). Garante que o
    // aluno nunca receba as duas no mesmo simulado e alimenta o rodízio por grupo.
    const origemId = this.questaoEditandoId();
    if (origemId) {
      this.conversaoOrigem.set({ origemId, grupoExistente: this.grupoOriginalCarregado() });
    }

    // Passa a criar em vez de editar: o save() fará INSERT e definirá o autor.
    this.questaoEditandoId.set(null);
    this.modoDrawer.set('criar');
    this.fFormato.set('resposta_aberta_curta');
    this.fStatus.set('rascunho');
    this.fRespostaModelo.set(sugerido.respostaModelo);
    this.fPontosChave.set(sugerido.pontosChave);
    this.fAlternativas.set([]);

    // A imagem não é copiada: as duas questões compartilhariam o mesmo arquivo no
    // storage, e a limpeza ao trocar/remover a imagem de uma apagaria a da outra.
    this.fImagemUrl.set(null);
    this.fImagemLegenda.set('');
    // Zera a referência de limpeza para o save() não apagar a imagem da original.
    this._urlAntesDeEditar = null;
    this._altUrlsAntesDeEditar = [];

    this.toast.success(
      tinhaImagem
        ? 'Cópia discursiva preenchida (a imagem não é copiada — anexe de novo se precisar). Revise e clique em Salvar.'
        : 'Cópia discursiva preenchida. Revise a resposta modelo e clique em Salvar para criar.',
    );
  }

  protected onTipoQuestaoChange(tipo: string): void {
    // O subtipo (formato_prova) só se aplica a questões nacionais (N1/N2/integradora/teste_progresso),
    // que é o único tipo com dropdown de "Subtipo da prova". Para processual e laboratório
    // não há subtipo — manter qualquer valor aqui viola a constraint questao_formato_prova_check
    // do banco (apenas 'N1', 'N2', 'integradora', 'teste_progresso') e faz o INSERT falhar.
    if (tipo !== 'nacional') {
      this.fFormatoProva.set(null);
    }
  }

  protected marcarCorreta(index: number): void {
    this.fAlternativas.update((alts) =>
      alts.map((a, i) => ({ ...a, correta: i === index })),
    );
  }

  protected atualizarTextoAlternativa(index: number, texto: string): void {
    this.fAlternativas.update((alts) =>
      alts.map((a, i) => (i === index ? { ...a, texto } : a)),
    );
  }

  /** Contabiliza uploads ativos vindos de cada <app-image-upload> para travar o salvar. */
  protected onUploadingChange(ativo: boolean): void {
    this.uploadsEmAndamento.update((n) => Math.max(0, ativo ? n + 1 : n - 1));
  }

  protected abrirUploadAlternativa(index: number): void {
    this.altUploadAberto.set(index);
  }

  protected atualizarImagemAlternativa(index: number, url: string | null): void {
    this.fAlternativas.update((alts) =>
      alts.map((a, i) => (i === index ? { ...a, imagem_url: url } : a)),
    );
    if (!url && this.altUploadAberto() === index) {
      this.altUploadAberto.set(null);
    }
  }

  protected adicionarPontoChave(): void {
    const texto = this.fPontoChaveNovo().trim();
    if (!texto) return;
    this.fPontosChave.update((itens) => [...itens, texto]);
    this.fPontoChaveNovo.set('');
  }

  protected removerPontoChave(index: number): void {
    this.fPontosChave.update((itens) => itens.filter((_, i) => i !== index));
  }

  protected atualizarPontoChave(index: number, texto: string): void {
    this.fPontosChave.update((itens) => itens.map((p, i) => (i === index ? texto : p)));
  }

  protected toggleTema(temaId: string): void {
    this.fTemas.update((ids) =>
      ids.includes(temaId) ? ids.filter((t) => t !== temaId) : [...ids, temaId],
    );
  }

  protected isTemaSelected(temaId: string): boolean {
    return this.fTemas().includes(temaId);
  }

  // ---- Salvar ----

  protected async salvar(): Promise<void> {
    if (this.salvando()) return;

    if (this.temUploadPendente()) {
      this.toast.error('Aguarde o upload da imagem terminar antes de salvar.');
      return;
    }

    if (!this.fEnunciado().trim()) {
      this.toast.error('Enunciado é obrigatório.');
      return;
    }
    const alternativas: AlternativaPayload[] = this.mostrarAlternativas()
      ? this.fAlternativas()
          .filter((a) => a.texto.trim() || a.imagem_url)
          .map((a, i) => ({
            letra: a.letra,
            texto: a.texto.trim(),
            correta: a.correta,
            ordem: i + 1,
            imagem_url: a.imagem_url,
          }))
      : [];

    if (this.mostrarAlternativas()) {
      if (this.fFormato() === 'multipla_escolha') {
        // Fechadas: A–D são obrigatórias; a E é opcional e só vira alternativa
        // (e aparece para o aluno) se tiver texto ou imagem.
        const preenchidas = new Set(alternativas.map((a) => a.letra));
        const faltando = ['A', 'B', 'C', 'D'].filter((l) => !preenchidas.has(l));
        if (faltando.length > 0) {
          this.toast.error(
            `Preencha as alternativas ${faltando.join(', ')}. Só a alternativa E é opcional.`,
          );
          return;
        }
      } else if (alternativas.length < 2) {
        this.toast.error('Preencha ao menos duas alternativas.');
        return;
      }
      if (!alternativas.some((a) => a.correta)) {
        this.toast.error('Marque ao menos uma alternativa preenchida como correta.');
        return;
      }
    }
    if (this.ehDiscursiva() && !this.fRespostaModelo().trim()) {
      this.toast.error('Questões discursivas exigem resposta modelo.');
      return;
    }
    if (this.fTipoQuestao() === 'laboratorio' && !this.fImagemUrl()) {
      this.toast.error('Questões de laboratório exigem imagem.');
      return;
    }

    this.salvando.set(true);

    const questaoPayload: QuestaoPayload = {
      enunciado: this.fEnunciado().trim(),
      enunciado_apoio: this.fEnunciadoApoio().trim() || null,
      imagem_url: this.fImagemUrl(),
      imagem_legenda: this.fImagemUrl() ? (this.fImagemLegenda().trim() || null) : null,
      formato: this.fFormato(),
      tipo_questao: this.fTipoQuestao(),
      formato_prova: this.fFormatoProva() || null,
      status: this.fStatus(),
      disciplina_id: this.fDisciplinaId() || null,
      prova_id: this.fProvaId() || null,
      ordem_na_prova: this.fOrdemNaProva(),
      explicacao: this.fExplicacao().trim() || null,
      referencia: this.fReferencia().trim() || null,
      fonte: this.fFonte().trim() || null,
      resposta_correta_texto: this.fRespostaCorreta().trim() || null,
      resposta_modelo: this.ehDiscursiva() ? this.fRespostaModelo().trim() : null,
      pontos_chave: this.ehDiscursiva()
        ? this.fPontosChave().map((p) => p.trim()).filter(Boolean)
        : [],
      criterios_correcao: this.ehDiscursiva() ? (this.fCriterios().trim() || null) : null,
      recurso_texto: this.fRecursoTexto().trim() || null,
      anulada: this.fAnulada(),
      revisado: this.fRevisado(),
      apto_desafio_diario: this.fAptoDesafio(),
    };

    const temaIds = this.fTemas();
    const modo = this.modoDrawer();

    let result: { ok: boolean; error?: string };

    if (modo === 'criar') {
      questaoPayload.autor_id = this.auth.user()?.id ?? null;

      // Cópia discursiva (gêmea): compartilha grupo de equivalência com a original.
      const conv = this.conversaoOrigem();
      if (conv) {
        const grupo = conv.grupoExistente ?? crypto.randomUUID();
        questaoPayload.grupo_equivalencia_id = grupo;
        // Se a original ainda não estava em nenhum grupo, vincula-a agora (par simétrico).
        if (!conv.grupoExistente) {
          const patch = await this.adminService.atualizarQuestao(conv.origemId, {
            grupo_equivalencia_id: grupo,
          });
          if (!patch.ok) {
            this.toast.error('Não foi possível vincular a questão original ao grupo.');
            this.salvando.set(false);
            return;
          }
        }
      }

      result = await this.adminService.criarQuestaoCompleta(questaoPayload, alternativas, temaIds);
    } else {
      result = await this.adminService.atualizarQuestaoCompleta(
        this.questaoEditandoId()!,
        questaoPayload,
        alternativas,
        temaIds,
      );
    }

    if (result.ok) {
      // Apaga arquivo original do storage se foi substituído ou removido
      const urlSalva = this.fImagemUrl();
      if (this._urlAntesDeEditar && this._urlAntesDeEditar !== urlSalva) {
        this.adminService.deletarArquivoStorage(this._urlAntesDeEditar);
      }
      // Idem para imagens de alternativas substituídas/removidas. Em discursiva
      // as alternativas são preservadas no banco (conversão reversível), então
      // as imagens delas também não podem ser apagadas.
      if (!this.ehDiscursiva()) {
        const urlsSalvas = new Set(
          alternativas.map((a) => a.imagem_url).filter((u): u is string => !!u),
        );
        for (const url of this._altUrlsAntesDeEditar) {
          if (!urlsSalvas.has(url)) {
            this.adminService.deletarArquivoStorage(url);
          }
        }
      }
      this.toast.success(modo === 'criar' ? 'Questão criada.' : 'Questão atualizada.');
      this.modoDrawer.set('fechado');
      await this.carregar();
    } else {
      this.toast.error(
        result.error ? `Erro ao salvar questão: ${result.error}` : 'Erro ao salvar questão.',
      );
    }

    this.salvando.set(false);
  }

  // ---- Reset ----

  private resetForm(): void {
    this.fEnunciado.set('');
    this.fEnunciadoApoio.set('');
    this.fFormato.set('multipla_escolha');
    this.fTipoQuestao.set('nacional');
    this.fFormatoProva.set(null);
    this.fStatus.set('rascunho');
    this.fDisciplinaId.set(null);
    this.fProvaId.set(null);
    this.fOrdemNaProva.set(null);
    this.fExplicacao.set('');
    this.fReferencia.set('');
    this.fFonte.set('');
    this.fRevisado.set(false);
    this.fAptoDesafio.set(true);
    this.fRecursoTexto.set('');
    this.fAnulada.set(false);
    this.fRespostaCorreta.set('');
    this.fRespostaModelo.set('');
    this.fPontosChave.set([]);
    this.fPontoChaveNovo.set('');
    this.fCriterios.set('');
    this.fAlternativas.set(alternativasIniciais('multipla_escolha'));
    this._altUrlsAntesDeEditar = [];
    this.altUploadAberto.set(null);
    this.fImagemUrl.set(null);
    this.fImagemLegenda.set('');
    this.fTemas.set([]);
    this.fTemaBusca.set('');
    this.grupoOriginalCarregado.set(null);
    this.conversaoOrigem.set(null);
    this.uploadsEmAndamento.set(0);
  }
}
