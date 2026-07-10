import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, X, ArrowLeft, ArrowRight, AlertTriangle, Bot, Copy, ListChecks, Pencil, Trash2 } from 'lucide-angular';
import {
  AdminService, AdminProva, AdminProvaDetalhe, AdminFaculdade, AdminDisciplina,
  AdminTema, AdminQuestaoSimples, ProvaInput, QuestaoPayload, AlternativaPayload,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiCheckboxComponent } from '../../shared/components/ui/checkbox/ui-checkbox.component';
import { montarPromptQuestoes, parseBlocos, QuestaoParseada } from '../importar/admin-importar.component';

type Etapa = 'detalhes' | 'metodo' | 'importar_input' | 'importar_preview' | 'importando' | 'selecionar' | 'vinculando' | 'concluido';

const DATA_CURTA_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-admin-provas',
  standalone: true,
  imports: [FormsModule, UiSelectComponent, UiConfirmDialogComponent, UiIconComponent, UiCheckboxComponent],
  templateUrl: './admin-provas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProvasComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly iconCheck = Check;
  protected readonly iconX = X;
  protected readonly iconArrowLeft = ArrowLeft;
  protected readonly iconArrowRight = ArrowRight;
  protected readonly iconAlertTriangle = AlertTriangle;
  protected readonly iconBot = Bot;
  protected readonly iconCopy = Copy;
  protected readonly iconListChecks = ListChecks;
  protected readonly iconPencil = Pencil;
  protected readonly iconTrash = Trash2;

  // ── List state ──
  protected readonly provas = signal<AdminProva[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly pagina = signal(0);
  protected readonly filtroTipo = signal('');
  protected readonly busca = signal('');
  protected readonly provaParaDeletar = signal<AdminProva | null>(null);
  protected readonly porPagina = 50;

  // ── Drawer state ──
  protected readonly drawerAberto = signal(false);
  protected readonly etapa = signal<Etapa>('detalhes');
  protected readonly salvando = signal(false);
  protected readonly provaId = signal<string | null>(null);
  protected readonly promptCopiado = signal(false);
  protected readonly modoEdicao = signal(false);
  protected readonly modoQuestoes = signal(false);
  protected readonly carregandoEdicao = signal(false);
  protected readonly sincronizandoQuestoes = signal(false);
  protected readonly fPublicada = signal(false);
  protected readonly fArquivada = signal(false);

  // ── Step 1: Prova form ──
  protected readonly faculdades = signal<AdminFaculdade[]>([]);
  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
  protected readonly temasExistentes = signal<AdminTema[]>([]);
  protected readonly fNome = signal('');
  protected readonly fTipo = signal('autoral');
  protected readonly fFormato = signal('nacional');
  protected readonly fRede = signal('afya');
  protected readonly fFaculdadeId = signal('');
  protected readonly fPeriodo = signal('1');
  protected readonly fSubtipoNacional = signal('');

  // ── Import flow ──
  protected readonly textoImport = signal('');
  protected readonly questoesParseadas = signal<QuestaoParseada[]>([]);
  protected readonly progresso = signal(0);
  protected readonly totalImportar = signal(0);
  protected readonly importados = signal(0);
  protected readonly errosImportCount = signal(0);
  protected readonly expandido = signal<number | null>(null);

  protected readonly questoesValidas = computed(() => this.questoesParseadas().filter((q) => q.valida));
  protected readonly questoesInvalidas = computed(() => this.questoesParseadas().filter((q) => !q.valida));
  protected readonly progressoPct = computed(() =>
    this.totalImportar() > 0 ? Math.round((this.progresso() / this.totalImportar()) * 100) : 0,
  );

  // ── Select flow ──
  protected readonly buscaQuestoes = signal('');
  protected readonly statusFiltro = signal('ativa');
  protected readonly questoesBanco = signal<AdminQuestaoSimples[]>([]);
  protected readonly totalQuestoesBanco = signal(0);
  protected readonly paginaQuestoes = signal(0);
  protected readonly carregandoQuestoes = signal(false);
  protected readonly selecionadas = signal<Set<string>>(new Set());
  protected readonly porPaginaQuestoes = 20;

  protected readonly totalSelecionadas = computed(() => this.selecionadas().size);

  // ── Select options — lista (toolbar) ──
  protected readonly opcoesTipo: SelectOption[] = [
    { value: '', label: 'Todos os formatos' },
    { value: 'nacional', label: 'Nacional' },
    { value: 'processual', label: 'Processual' },
    { value: 'laboratorio', label: 'Laboratório' },
  ];

  // ── Select options — drawer (form) ──
  protected readonly opcoesTipoForm: SelectOption[] = [
    { value: 'autoral', label: 'Autoral' },
    { value: 'faculdade', label: 'Modelo de faculdade/rede' },
  ];

  protected readonly opcoesFormatoForm: SelectOption[] = [
    { value: 'nacional', label: 'Nacional' },
    { value: 'processual', label: 'Processual' },
    { value: 'laboratorio', label: 'Laboratório' },
  ];

  protected readonly opcoesRedeForm: SelectOption[] = [
    { value: '', label: 'Sem rede' },
    { value: 'afya', label: 'Afya' },
  ];

  protected readonly opcoesSubtipoForm = computed<SelectOption[]>(() =>
    this.fFormato() === 'nacional'
      ? [
          { value: '', label: 'Nenhum' },
          { value: 'N1', label: 'N1' },
          { value: 'N2', label: 'Integradora' },
          { value: 'teste_progresso', label: 'TPI' },
        ]
      : [],
  );

  protected readonly opcoesFaculdadeForm = computed<SelectOption[]>(() => [
    { value: '', label: 'Selecione uma faculdade…' },
    ...this.faculdades().map((f) => ({ value: f.id, label: `${f.sigla} — ${f.nome}` })),
  ]);

  protected readonly opcoesStatusQuestao: SelectOption[] = [
    { value: '', label: 'Todos os status' },
    { value: 'ativa', label: 'Ativa' },
    { value: 'rascunho', label: 'Rascunho' },
  ];

  async ngOnInit(): Promise<void> {
    await this.carregar();
    // Pre-load faculdades and disciplinas for drawer
    const [facRes, discRes, temasRes] = await Promise.all([
      this.adminService.listarFaculdades(),
      this.adminService.listarDisciplinas(),
      this.adminService.listarTemas(),
    ]);
    if (facRes.ok) this.faculdades.set(facRes.data);
    if (discRes.ok) this.disciplinas.set(discRes.data);
    if (temasRes.ok) this.temasExistentes.set(temasRes.data);
  }

  // ── List methods ──
  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarProvas(this.pagina(), this.porPagina, {
      formato: this.filtroTipo() || undefined,
      busca: this.busca() || undefined,
    });
    if (result.ok) { this.provas.set(result.data.provas); this.total.set(result.data.total); }
    else this.toast.error('Erro ao carregar provas.');
    this.isLoading.set(false);
  }

  async aplicarFiltros(): Promise<void> { this.pagina.set(0); await this.carregar(); }
  async paginaAnterior(): Promise<void> { if (this.pagina() === 0) return; this.pagina.update((p) => p - 1); await this.carregar(); }
  async proximaPagina(): Promise<void> { if ((this.pagina() + 1) * this.porPagina >= this.total()) return; this.pagina.update((p) => p + 1); await this.carregar(); }

  protected solicitarDelete(prova: AdminProva): void { this.provaParaDeletar.set(prova); }
  protected cancelarDelete(): void { this.provaParaDeletar.set(null); }

  async confirmarDelete(): Promise<void> {
    const prova = this.provaParaDeletar();
    if (!prova) return;
    this.provaParaDeletar.set(null);
    const result = await this.adminService.deletarProva(prova.id);
    if (result.ok) {
      this.provas.update((lista) => lista.filter((p) => p.id !== prova.id));
      this.total.update((t) => t - 1);
      const n = result.data.tentativas_preservadas;
      this.toast.success(n > 0
        ? `Prova deletada. ${n} tentativa${n > 1 ? 's' : ''} de alunos preservada${n > 1 ? 's' : ''} no histórico.`
        : 'Prova deletada.');
    }
    else this.toast.error(result.error);
  }

  protected onFormatoChange(valor: string): void {
    this.fFormato.set(valor || 'nacional');
    this.fSubtipoNacional.set('');
  }

  // ── Drawer methods ──
  protected abrirDrawer(): void {
    this.resetDrawer();
    this.drawerAberto.set(true);
  }

  protected fecharDrawer(): void {
    this.drawerAberto.set(false);
  }

  private resetDrawer(): void {
    this.etapa.set('detalhes');
    this.provaId.set(null);
    this.modoEdicao.set(false);
    this.modoQuestoes.set(false);
    this.carregandoEdicao.set(false);
    this.sincronizandoQuestoes.set(false);
    this.fNome.set('');
    this.fTipo.set('autoral');
    this.fFormato.set('nacional');
    this.fRede.set('afya');
    this.fFaculdadeId.set(this.faculdades()[0]?.id ?? '');
    this.fPeriodo.set('1');
    this.fSubtipoNacional.set('');
    this.fPublicada.set(false);
    this.fArquivada.set(false);
    this.textoImport.set('');
    this.questoesParseadas.set([]);
    this.progresso.set(0);
    this.totalImportar.set(0);
    this.importados.set(0);
    this.errosImportCount.set(0);
    this.expandido.set(null);
    this.buscaQuestoes.set('');
    this.statusFiltro.set('ativa');
    this.questoesBanco.set([]);
    this.totalQuestoesBanco.set(0);
    this.paginaQuestoes.set(0);
    this.selecionadas.set(new Set());
  }

  async salvarDetalhes(): Promise<void> {
    if (!this.fNome().trim()) { this.toast.error('Nome é obrigatório.'); return; }
    if (!this.fPeriodo() || Number(this.fPeriodo()) < 1) { this.toast.error('Período inválido.'); return; }
    this.salvando.set(true);
    const input: ProvaInput = {
      nome: this.fNome().trim(),
      tipo: this.fTipo() === 'faculdade' ? 'faculdade' : 'autoral',
      origem: this.fTipo(),
      formato: this.fFormato(),
      rede: this.fRede() || null,
      faculdade_id: this.fFaculdadeId(),
      periodo: Number(this.fPeriodo()),
      subtipo: this.fSubtipoNacional() || null,
      subtipo_nacional: this.fFormato() === 'nacional' ? (this.fSubtipoNacional() || null) : null,
      publicada: this.fPublicada(),
      arquivada: this.fArquivada(),
    };
    if (this.modoEdicao()) {
      const id = this.provaId();
      if (!id) return;
      const res = await this.adminService.atualizarProva(id, input);
      this.salvando.set(false);
      if (!res.ok) { this.toast.error(this.traduzirErroProva(res.error)); return; }
      this.provas.update((lista) => lista.map((p) => (p.id === id ? { ...p, ...res.data } : p)));
      this.toast.success('Prova atualizada.');
      this.fecharDrawer();
      return;
    }
    const res = await this.adminService.criarProva(input);
    this.salvando.set(false);
    if (!res.ok) {
      const msg = this.traduzirErroProva(res.error);
      this.toast.error(msg);
      return;
    }
    this.provaId.set(res.data.id);
    this.etapa.set('metodo');
  }

  async abrirDrawerEdicao(prova: AdminProva): Promise<void> {
    this.resetDrawer();
    this.modoEdicao.set(true);
    this.carregandoEdicao.set(true);
    this.drawerAberto.set(true);
    this.provaId.set(prova.id);
    const res = await this.adminService.buscarProvaParaEdicao(prova.id);
    this.carregandoEdicao.set(false);
    if (!res.ok) { this.toast.error('Não foi possível carregar os dados da prova.'); this.fecharDrawer(); return; }
    const p: AdminProvaDetalhe = res.data;
    this.fNome.set(p.nome);
    this.fTipo.set(p.origem);
    this.fFormato.set(p.formato ?? 'nacional');
    this.fRede.set(p.rede ?? '');
    this.fFaculdadeId.set(p.faculdade_id ?? '');
    this.fPeriodo.set(String(p.periodo));
    this.fSubtipoNacional.set(p.subtipo_nacional ?? '');
    this.fPublicada.set(p.publicada);
    this.fArquivada.set(p.arquivada);
  }

  async abrirDrawerQuestoes(prova: AdminProva): Promise<void> {
    this.resetDrawer();
    this.modoQuestoes.set(true);
    this.carregandoEdicao.set(true);
    this.drawerAberto.set(true);
    this.provaId.set(prova.id);
    this.fFormato.set(prova.formato ?? 'nacional');
    const [questoesRes, bancaoRes] = await Promise.all([
      this.adminService.listarIdsQuestoesVinculadas(prova.id),
      this.adminService.listarQuestoesParaVincular(0, this.porPaginaQuestoes, {
        status: this.statusFiltro() || undefined,
        tipo_questao: prova.formato === 'laboratorio' ? 'laboratorio' : undefined,
      }),
    ]);
    this.carregandoEdicao.set(false);
    if (questoesRes.ok) {
      this.selecionadas.set(new Set(questoesRes.data));
    }
    if (bancaoRes.ok) {
      this.questoesBanco.set(bancaoRes.data.questoes);
      this.totalQuestoesBanco.set(bancaoRes.data.total);
    }
    this.etapa.set('selecionar');
  }

  async sincronizarQuestoes(): Promise<void> {
    const provaId = this.provaId();
    if (!provaId) return;
    this.sincronizandoQuestoes.set(true);
    const ids = Array.from(this.selecionadas());
    const questoes = ids.map((id, i) => ({ questao_id: id, ordem: i + 1 }));
    const res = await this.adminService.sincronizarQuestoesProva(provaId, questoes);
    this.sincronizandoQuestoes.set(false);
    if (!res.ok) { this.toast.error('Não foi possível salvar as questões. Tente novamente.'); return; }
    this.provas.update((lista) => lista.map((p) => (p.id === provaId ? { ...p, qtd_questoes: ids.length } : p)));
    this.toast.success('Questões atualizadas.');
    this.fecharDrawer();
  }

  protected escolherImportar(): void {
    if (this.fFormato() === 'laboratorio') {
      this.toast.error('Questões de laboratório exigem imagem. Cadastre as questões em Questões e depois vincule aqui.');
      return;
    }
    this.etapa.set('importar_input');
  }

  protected escolherSelecionar(): void {
    this.etapa.set('selecionar');
    void this.carregarQuestoesBanco();
  }

  // ── Import flow ──
  protected processarMarkdown(): void {
    const t = this.textoImport().trim();
    if (!t) { this.toast.error('Cole o conteúdo antes de continuar.'); return; }
    const parsed = parseBlocos(t, this.disciplinas(), this.temasExistentes());
    if (parsed.length === 0) { this.toast.error('Nenhuma questão encontrada. Verifique o formato.'); return; }
    this.questoesParseadas.set(parsed);
    this.expandido.set(null);
    this.etapa.set('importar_preview');
  }

  protected toggleExpandido(i: number): void { this.expandido.update((v) => (v === i ? null : i)); }

  protected voltarParaInput(): void { this.etapa.set('importar_input'); this.expandido.set(null); }

  async importarQuestoes(): Promise<void> {
    const validas = this.questoesValidas();
    if (validas.length === 0) { this.toast.error('Nenhuma questão válida para importar.'); return; }
    const provaId = this.provaId();
    if (!provaId) return;
    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImportCount.set(0);
    this.etapa.set('importando');
    const questoesParaVincular: { questao_id: string; ordem: number }[] = [];
    for (let i = 0; i < validas.length; i++) {
      const q = validas[i];
      const payload: QuestaoPayload = {
        enunciado: q.enunciado,
        enunciado_apoio: q.enunciado_apoio,
        formato: q.formato,
        tipo_questao: q.tipo_questao ?? (this.fFormato() as 'nacional' | 'processual' | 'laboratorio'),
        status: 'ativa',
        disciplina_id: q.disciplina_id,
        explicacao: q.explicacao,
        referencia: q.referencia,
        fonte: q.fonte,
        resposta_modelo: q.resposta_modelo,
        pontos_chave: q.pontos_chave,
        criterios_correcao: q.criterios_correcao,
        origem_geracao: 'ia_assistida',
      };
      const alternativas: AlternativaPayload[] = q.alternativas.map((a, idx) => ({ letra: a.letra, texto: a.texto, correta: a.correta, ordem: idx + 1 }));
      const res = await this.adminService.criarQuestaoCompleta(payload, alternativas, q.tema_ids);
      if (res.ok) { questoesParaVincular.push({ questao_id: res.data, ordem: i + 1 }); this.importados.update((n) => n + 1); }
      else this.errosImportCount.update((n) => n + 1);
      this.progresso.update((n) => n + 1);
    }
    if (questoesParaVincular.length > 0) {
      await this.adminService.vincularQuestoesAProva(provaId, questoesParaVincular);
    }
    this.etapa.set('concluido');
  }

  // ── Select flow ──
  async carregarQuestoesBanco(): Promise<void> {
    this.carregandoQuestoes.set(true);
    const res = await this.adminService.listarQuestoesParaVincular(this.paginaQuestoes(), this.porPaginaQuestoes, {
      busca: this.buscaQuestoes() || undefined,
      status: this.statusFiltro() || undefined,
      tipo_questao: this.fFormato() === 'laboratorio' ? 'laboratorio' : undefined,
    });
    if (res.ok) { this.questoesBanco.set(res.data.questoes); this.totalQuestoesBanco.set(res.data.total); }
    this.carregandoQuestoes.set(false);
  }

  async buscarQuestoes(): Promise<void> { this.paginaQuestoes.set(0); await this.carregarQuestoesBanco(); }

  async paginaAnteriorQuestoes(): Promise<void> {
    if (this.paginaQuestoes() === 0) return;
    this.paginaQuestoes.update((p) => p - 1);
    await this.carregarQuestoesBanco();
  }

  async proximaPaginaQuestoes(): Promise<void> {
    if ((this.paginaQuestoes() + 1) * this.porPaginaQuestoes >= this.totalQuestoesBanco()) return;
    this.paginaQuestoes.update((p) => p + 1);
    await this.carregarQuestoesBanco();
  }

  protected toggleSelecionada(id: string): void {
    this.selecionadas.update((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  async vincularSelecionadas(): Promise<void> {
    const ids = Array.from(this.selecionadas());
    if (ids.length === 0) { this.toast.error('Selecione ao menos uma questão.'); return; }
    const provaId = this.provaId();
    if (!provaId) return;
    this.etapa.set('vinculando');
    const questoes = ids.map((id, i) => ({ questao_id: id, ordem: i + 1 }));
    const res = await this.adminService.vincularQuestoesAProva(provaId, questoes);
    if (!res.ok) { this.toast.error('Não foi possível vincular as questões. Tente novamente.'); this.etapa.set('selecionar'); return; }
    this.etapa.set('concluido');
  }

  protected async concluir(): Promise<void> {
    this.fecharDrawer();
    await this.carregar();
  }

  // ── Helpers ──
  private traduzirErroProva(erro: string): string {
    if (erro.includes('prova_tipo_periodo_edicao_unique') || erro.includes('duplicate') || erro.includes('unique')) {
      return 'Já existe uma prova com esse tipo, período e edição. Altere a edição ou escolha outro período.';
    }
    if (erro.includes('not-null') || erro.includes('violates not-null')) {
      return 'Preencha todos os campos obrigatórios antes de continuar.';
    }
    if (erro.includes('foreign key') || erro.includes('faculdade')) {
      return 'Faculdade inválida. Selecione uma faculdade da lista.';
    }
    return 'Não foi possível criar a prova. Tente novamente.';
  }

  protected tipoLabel(tipo: string | null): string { return this.opcoesTipo.find((o) => o.value === tipo)?.label ?? tipo ?? '—'; }
  protected formatarData(data: string | null | undefined): string { return data ? DATA_CURTA_FMT.format(new Date(data)) : '—'; }
  protected enunciadoCurto(texto: string): string { return texto.length > 100 ? texto.slice(0, 100) + '…' : texto; }
  protected gabaritoLabel(q: QuestaoParseada): string {
    if (q.formato === 'resposta_aberta_curta') return q.resposta_modelo ? 'Modelo' : '—';
    return q.alternativas.find((a) => a.correta)?.letra ?? '—';
  }

  protected get totalPaginas(): number { return Math.ceil(this.total() / this.porPagina); }
  protected get paginaAtual(): number { return this.pagina() + 1; }
  protected get totalPaginasQuestoes(): number { return Math.ceil(this.totalQuestoesBanco() / this.porPaginaQuestoes); }
  protected get paginaAtualQuestoes(): number { return this.paginaQuestoes() + 1; }

  protected readonly promptQuestoes = computed(() => montarPromptQuestoes(this.disciplinas(), this.temasExistentes()));

  async copiarPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.promptQuestoes());
    this.promptCopiado.set(true);
    setTimeout(() => this.promptCopiado.set(false), 2000);
  }
}
