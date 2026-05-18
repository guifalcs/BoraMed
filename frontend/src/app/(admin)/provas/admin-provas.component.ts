import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, X, ArrowLeft, ArrowRight, AlertTriangle, Bot, Copy } from 'lucide-angular';
import {
  AdminService, AdminProva, AdminFaculdade, AdminDisciplina,
  AdminQuestaoSimples, ProvaInput, QuestaoPayload, AlternativaPayload,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiSelectComponent, SelectOption } from '../../shared/components/ui/select/ui-select.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { PROMPT_QUESTOES } from '../importar/admin-importar.component';

// Reuse same parse types and logic as admin-importar
interface AlternativaParseada { letra: string; texto: string; correta: boolean; }
interface QuestaoParseada {
  enunciado: string;
  alternativas: AlternativaParseada[];
  formato: 'multipla_escolha' | 'verdadeiro_falso';
  disciplina_id: string | null;
  disciplinaDisplay: string;
  explicacao: string | null;
  fonte: string | null;
  valida: boolean;
  erros: string[];
}

type Etapa = 'detalhes' | 'metodo' | 'importar_input' | 'importar_preview' | 'importando' | 'selecionar' | 'vinculando' | 'concluido';

// Same parse functions as admin-importar (copy them here)
function parseBlocos(markdown: string, disciplinas: AdminDisciplina[]): QuestaoParseada[] {
  return markdown.split(/^---$/m).map((b) => b.trim()).filter((b) => b.length > 0).map((b) => parseQuestaoBloco(b, disciplinas));
}

function parseQuestaoBloco(bloco: string, disciplinas: AdminDisciplina[]): QuestaoParseada {
  const erros: string[] = [];
  const linhas = bloco.split('\n');
  type Secao = 'nenhuma' | 'enunciado' | 'alternativas' | 'explicacao';
  let secao: Secao = 'nenhuma';
  const enunciadoLinhas: string[] = [];
  const alternativaLinhas: string[] = [];
  let gabaritoLetra: string | null = null;
  let disciplinaSigla: string | null = null;
  const explicacaoLinhas: string[] = [];
  let fonte: string | null = null;
  for (const linha of linhas) {
    const t = linha.trim();
    if (t.toUpperCase() === 'ENUNCIADO') { secao = 'enunciado'; continue; }
    if (t.toUpperCase() === 'ALTERNATIVAS') { secao = 'alternativas'; continue; }
    const mGabarito = t.match(/^GABARITO:\s*([A-Ea-e])/i);
    if (mGabarito) { gabaritoLetra = mGabarito[1].toUpperCase(); secao = 'nenhuma'; continue; }
    const mDisciplina = t.match(/^DISCIPLINA:\s*(.+)/i);
    if (mDisciplina) { disciplinaSigla = mDisciplina[1].trim(); secao = 'nenhuma'; continue; }
    const mFonte = t.match(/^FONTE:\s*(.+)/i);
    if (mFonte) { fonte = mFonte[1].trim(); secao = 'nenhuma'; continue; }
    const mExplicacao = t.match(/^EXPLICACAO:\s*(.*)/i);
    if (mExplicacao) { secao = 'explicacao'; if (mExplicacao[1].trim()) explicacaoLinhas.push(mExplicacao[1]); continue; }
    if (secao === 'enunciado') { enunciadoLinhas.push(linha); continue; }
    if (secao === 'alternativas') { alternativaLinhas.push(linha); continue; }
    if (secao === 'explicacao' && t) { explicacaoLinhas.push(linha); }
  }
  const enunciado = enunciadoLinhas.join('\n').trim();
  if (!enunciado) erros.push('Enunciado ausente');
  const alternativas: AlternativaParseada[] = [];
  for (const linha of alternativaLinhas) {
    const m = linha.match(/^([A-Ea-e])\)\s*(.*)/);
    if (m) { const texto = m[2].replace('✓', '').trim(); alternativas.push({ letra: m[1].toUpperCase(), texto, correta: m[2].includes('✓') }); }
  }
  if (gabaritoLetra) alternativas.forEach((a) => (a.correta = a.letra === gabaritoLetra));
  if (alternativas.length < 2) erros.push('Mínimo de 2 alternativas');
  else if (!alternativas.some((a) => a.correta)) erros.push('Gabarito não identificado');
  const isVF = alternativas.length === 2 && alternativas.some((a) => /^verdadeiro$/i.test(a.texto)) && alternativas.some((a) => /^falso$/i.test(a.texto));
  const disciplinaObj = disciplinaSigla ? (disciplinas.find((d) => d.sigla.toLowerCase() === disciplinaSigla!.toLowerCase()) ?? null) : null;
  if (disciplinaSigla && !disciplinaObj) erros.push(`Disciplina "${disciplinaSigla}" não encontrada`);
  return { enunciado, alternativas, formato: isVF ? 'verdadeiro_falso' : 'multipla_escolha', disciplina_id: disciplinaObj?.id ?? null, disciplinaDisplay: disciplinaObj?.sigla ?? disciplinaSigla ?? '—', explicacao: explicacaoLinhas.join('\n').trim() || null, fonte, valida: erros.length === 0, erros };
}

@Component({
  selector: 'app-admin-provas',
  standalone: true,
  imports: [FormsModule, UiSelectComponent, UiConfirmDialogComponent, UiIconComponent],
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

  // ── Step 1: Prova form ──
  protected readonly faculdades = signal<AdminFaculdade[]>([]);
  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
  protected readonly fNome = signal('');
  protected readonly fTipo = signal('autoral');
  protected readonly fFaculdadeId = signal('');
  protected readonly fPeriodo = signal('1');
  protected readonly fAno = signal('');
  protected readonly fSemestre = signal('');
  protected readonly fEdicao = signal('1');
  protected readonly fSubtipoNacional = signal('');
  protected readonly fTempoSugerido = signal('');

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
    { value: '', label: 'Todos os tipos' },
    { value: 'autoral', label: 'Autoral' },
    { value: 'faculdade', label: 'De faculdade' },
  ];

  // ── Select options — drawer (form) ──
  protected readonly opcoesTipoForm: SelectOption[] = [
    { value: 'autoral', label: 'Autoral' },
    { value: 'faculdade', label: 'De faculdade' },
  ];

  protected readonly opcoesSemestreForm: SelectOption[] = [
    { value: '', label: '—' },
    { value: '1', label: '1º semestre' },
    { value: '2', label: '2º semestre' },
  ];

  protected readonly opcoesSubtipoNacionalForm: SelectOption[] = [
    { value: '', label: 'Nenhum' },
    { value: 'N1', label: 'N1' },
    { value: 'N2', label: 'N2' },
    { value: 'teste_progresso', label: 'Teste de Progresso' },
  ];

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
    const [facRes, discRes] = await Promise.all([
      this.adminService.listarFaculdades(),
      this.adminService.listarDisciplinas(),
    ]);
    if (facRes.ok) this.faculdades.set(facRes.data);
    if (discRes.ok) this.disciplinas.set(discRes.data);
  }

  // ── List methods ──
  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarProvas(this.pagina(), this.porPagina, {
      tipo: this.filtroTipo() || undefined,
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
    if (result.ok) { this.provas.update((lista) => lista.filter((p) => p.id !== prova.id)); this.total.update((t) => t - 1); this.toast.success('Prova deletada.'); }
    else this.toast.error('Erro ao deletar prova.');
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
    this.fNome.set('');
    this.fTipo.set('autoral');
    this.fFaculdadeId.set(this.faculdades()[0]?.id ?? '');
    this.fPeriodo.set('1');
    this.fAno.set('');
    this.fSemestre.set('');
    this.fEdicao.set('1');
    this.fSubtipoNacional.set('');
    this.fTempoSugerido.set('');
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
      tipo: this.fTipo(),
      faculdade_id: this.fFaculdadeId(),
      periodo: Number(this.fPeriodo()),
      ano: this.fAno() ? Number(this.fAno()) : null,
      semestre: this.fSemestre() ? Number(this.fSemestre()) : null,
      edicao: this.fEdicao() ? Number(this.fEdicao()) : null,
      subtipo_nacional: this.fSubtipoNacional() || null,
      tempo_sugerido_minutos: this.fTempoSugerido() ? Number(this.fTempoSugerido()) : null,
    };
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

  protected escolherImportar(): void { this.etapa.set('importar_input'); }

  protected escolherSelecionar(): void {
    this.etapa.set('selecionar');
    void this.carregarQuestoesBanco();
  }

  // ── Import flow ──
  protected processarMarkdown(): void {
    const t = this.textoImport().trim();
    if (!t) { this.toast.error('Cole o conteúdo antes de continuar.'); return; }
    const parsed = parseBlocos(t, this.disciplinas());
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
      const payload: QuestaoPayload = { enunciado: q.enunciado, formato: q.formato, status: 'ativa', disciplina_id: q.disciplina_id, explicacao: q.explicacao, fonte: q.fonte };
      const alternativas: AlternativaPayload[] = q.alternativas.map((a, idx) => ({ letra: a.letra, texto: a.texto, correta: a.correta, ordem: idx + 1 }));
      const res = await this.adminService.criarQuestaoCompleta(payload, alternativas, []);
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

  protected tipoLabel(tipo: string): string { return this.opcoesTipo.find((o) => o.value === tipo)?.label ?? tipo; }
  protected enunciadoCurto(texto: string): string { return texto.length > 100 ? texto.slice(0, 100) + '…' : texto; }
  protected gabaritoLabel(q: QuestaoParseada): string { return q.alternativas.find((a) => a.correta)?.letra ?? '—'; }

  protected get totalPaginas(): number { return Math.ceil(this.total() / this.porPagina); }
  protected get paginaAtual(): number { return this.pagina() + 1; }
  protected get totalPaginasQuestoes(): number { return Math.ceil(this.totalQuestoesBanco() / this.porPaginaQuestoes); }
  protected get paginaAtualQuestoes(): number { return this.paginaQuestoes() + 1; }

  protected readonly promptQuestoes = PROMPT_QUESTOES;

  async copiarPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.promptQuestoes);
    this.promptCopiado.set(true);
    setTimeout(() => this.promptCopiado.set(false), 2000);
  }
}
