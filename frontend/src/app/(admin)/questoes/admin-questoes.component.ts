import {
  ChangeDetectionStrategy,
  Component,
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
import { ChevronLeft, ChevronRight, Eye, Pencil, Trash2, X } from 'lucide-angular';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiCheckboxComponent } from '../../shared/components/ui/checkbox/ui-checkbox.component';
import { ImageUploadComponent } from '../../shared/components/image-upload/image-upload.component';
import { QuestaoCardComponent } from '../../shared/components/questao-card/questao-card.component';

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

interface AlternativaForm {
  letra: string;
  texto: string;
  correta: boolean;
}

interface QuestaoMetaItem {
  label: string;
  valor: string;
}

const LETRAS_MC = ['A', 'B', 'C', 'D', 'E'];

function alternativasIniciais(formato: string): AlternativaForm[] {
  if (formato === 'multipla_escolha') {
    return LETRAS_MC.map((letra, i) => ({ letra, texto: '', correta: i === 0 }));
  }
  if (formato === 'verdadeiro_falso') {
    return [
      { letra: 'V', texto: 'Verdadeiro', correta: true },
      { letra: 'F', texto: 'Falso', correta: false },
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
  ],
  templateUrl: './admin-questoes.component.html',
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
  protected readonly busca = signal('');
  protected readonly processando = signal<string | null>(null);
  protected readonly porPagina = 50;

  // ---- Drawer ----
  protected readonly modoDrawer = signal<'fechado' | 'criar' | 'editar'>('fechado');
  protected readonly questaoEditandoId = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly carregandoForm = signal(false);

  // ---- Visualização ----
  protected readonly questaoVisualizada = signal<AdminQuestaoCompleta | null>(null);
  protected readonly carregandoVisualizacao = signal(false);

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
  protected readonly fRespostaCorreta = signal('');
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
  ];

  protected readonly opcoesTipoQuestao: SelectOption[] = [
    { value: 'nacional', label: 'Nacional' },
    { value: 'processual', label: 'Processual' },
    { value: 'laboratorio', label: 'Laboratório' },
  ];

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

  /** URL original da imagem ao abrir o drawer; usada para limpeza no storage */
  private _urlAntesDeEditar: string | null = null;
  private visualizacaoRequestId = 0;

  // ---- Confirm dialog ----
  protected readonly questaoParaDeletar = signal<AdminQuestao | null>(null);

  protected readonly mostrarAlternativas = computed(
    () => this.fFormato() === 'multipla_escolha' || this.fFormato() === 'verdadeiro_falso',
  );

  protected readonly visualizacaoAberta = computed(
    () => this.carregandoVisualizacao() || this.questaoVisualizada() !== null,
  );

  protected readonly questaoPreview = computed<QuestaoComAlternativas | null>(() => {
    const questao = this.questaoVisualizada();
    if (!questao) return null;

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
        imagem_url: null,
      })),
      temas: this.temasDaQuestao(questao.temas),
    };
  });

  protected readonly temasVisualizacao = computed(() => {
    const questao = this.questaoVisualizada();
    if (!questao || questao.temas.length === 0) return 'Sem temas vinculados';
    return this.temasDaQuestao(questao.temas).map((tema) => tema.nome).join(', ');
  });

  protected readonly gabaritoVisualizacao = computed(() => {
    const questao = this.questaoVisualizada();
    if (!questao) return '—';
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
    const [provasRes, temasRes, disciplinasRes] = await Promise.all([
      this.adminService.listarProvasSimples(),
      this.adminService.listarTemas(),
      this.adminService.listarDisciplinas(),
    ]);
    if (provasRes.ok) this.provasDisponiveis.set(provasRes.data);
    if (temasRes.ok) this.temasDisponiveis.set(temasRes.data);
    if (disciplinasRes.ok) this.disciplinasDisponiveis.set(disciplinasRes.data);
  }

  // ---- Operações da lista ----

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarQuestoes(this.pagina(), this.porPagina, {
      status: this.filtroStatus() || undefined,
      busca: this.busca() || undefined,
    });
    if (result.ok) {
      this.questoes.set(result.data.questoes);
      this.total.set(result.data.total);
    } else {
      this.toast.error('Erro ao carregar questões.');
    }
    this.isLoading.set(false);
  }

  async aplicarFiltros(): Promise<void> {
    this.pagina.set(0);
    await this.carregar();
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
      this.toast.success('Questão deletada.');
    } else {
      this.toast.error(result.error);
    }
  }

  protected formatoLabel(formato: string): string {
    const map: Record<string, string> = {
      multipla_escolha: 'Múltipla',
      verdadeiro_falso: 'V / F',
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

  protected dataLabel(data: string | null | undefined): string {
    if (!data) return '—';
    return DATE_FMT.format(new Date(data));
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
    this.fRespostaCorreta.set(d.resposta_correta_texto ?? '');
    this.fImagemUrl.set(d.imagem_url ?? null);
    this._urlAntesDeEditar = d.imagem_url ?? null;
    this.fImagemLegenda.set(d.imagem_legenda ?? '');
    this.fTemas.set(d.temas ?? []);

    if (d.alternativas.length > 0) {
      this.fAlternativas.set(
        d.alternativas.map((a) => ({ letra: a.letra, texto: a.texto, correta: a.correta })),
      );
    } else {
      this.fAlternativas.set(alternativasIniciais(d.formato));
    }

    this.carregandoForm.set(false);
  }

  protected fecharDrawer(): void {
    if (this.salvando()) return;
    // Apaga upload de sessão se o usuário cancelou com imagem diferente da original
    const sessionUrl = this.fImagemUrl();
    if (sessionUrl && sessionUrl !== this._urlAntesDeEditar) {
      this.adminService.deletarArquivoStorage(sessionUrl);
    }
    this.modoDrawer.set('fechado');
  }

  // ---- Formulário: mutações ----

  protected onFormatoChange(formato: string): void {
    this.fFormato.set(formato);
    this.fAlternativas.set(alternativasIniciais(formato));
  }

  protected onTipoQuestaoChange(tipo: string): void {
    this.fFormatoProva.set(tipo === 'laboratorio' ? 'laboratorio' : null);
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

    if (!this.fEnunciado().trim()) {
      this.toast.error('Enunciado é obrigatório.');
      return;
    }
    if (this.mostrarAlternativas() && !this.fAlternativas().some((a) => a.correta)) {
      this.toast.error('Marque ao menos uma alternativa como correta.');
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
      revisado: this.fRevisado(),
      apto_desafio_diario: this.fAptoDesafio(),
    };

    const alternativas: AlternativaPayload[] = this.mostrarAlternativas()
      ? this.fAlternativas()
          .filter((a) => a.texto.trim())
          .map((a, i) => ({ letra: a.letra, texto: a.texto.trim(), correta: a.correta, ordem: i + 1 }))
      : [];

    const temaIds = this.fTemas();
    const modo = this.modoDrawer();

    let result: { ok: boolean };

    if (modo === 'criar') {
      questaoPayload.autor_id = this.auth.user()?.id ?? null;
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
      this.toast.success(modo === 'criar' ? 'Questão criada.' : 'Questão atualizada.');
      this.modoDrawer.set('fechado');
      await this.carregar();
    } else {
      this.toast.error('Erro ao salvar questão.');
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
    this.fRespostaCorreta.set('');
    this.fAlternativas.set(alternativasIniciais('multipla_escolha'));
    this.fImagemUrl.set(null);
    this.fImagemLegenda.set('');
    this.fTemas.set([]);
    this.fTemaBusca.set('');
  }
}
