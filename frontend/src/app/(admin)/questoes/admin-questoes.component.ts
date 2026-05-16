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
  AdminTema,
  AlternativaPayload,
  QuestaoPayload,
} from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

interface AlternativaForm {
  letra: string;
  texto: string;
  correta: boolean;
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
  imports: [FormsModule, SlicePipe],
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

  // ---- Campos do formulário ----
  protected readonly fEnunciado = signal('');
  protected readonly fEnunciadoApoio = signal('');
  protected readonly fFormato = signal('multipla_escolha');
  protected readonly fStatus = signal('rascunho');
  protected readonly fDificuldade = signal<number | null>(null);
  protected readonly fDisciplina = signal('');
  protected readonly fPeriodo = signal<number | null>(null);
  protected readonly fProvaId = signal<string | null>(null);
  protected readonly fOrdemNaProva = signal<number | null>(null);
  protected readonly fExplicacao = signal('');
  protected readonly fReferencia = signal('');
  protected readonly fFonte = signal('');
  protected readonly fRevisado = signal(false);
  protected readonly fAptoDesafio = signal(true);
  protected readonly fRespostaCorreta = signal('');
  protected readonly fAlternativas = signal<AlternativaForm[]>(alternativasIniciais('multipla_escolha'));
  protected readonly fTemas = signal<string[]>([]);
  protected readonly fTemaBusca = signal('');

  // ---- Dados para selects ----
  protected readonly provasDisponiveis = signal<{ id: string; nome: string; ano: number }[]>([]);
  protected readonly temasDisponiveis = signal<AdminTema[]>([]);

  protected readonly mostrarAlternativas = computed(
    () => this.fFormato() === 'multipla_escolha' || this.fFormato() === 'verdadeiro_falso',
  );

  protected readonly temasVisiveis = computed(() => {
    const q = this.fTemaBusca().toLowerCase();
    if (!q) return this.temasDisponiveis();
    return this.temasDisponiveis().filter((t) => t.nome.toLowerCase().includes(q));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.carregar(), this.carregarDropdowns()]);
  }

  private async carregarDropdowns(): Promise<void> {
    const [provasRes, temasRes] = await Promise.all([
      this.adminService.listarProvasSimples(),
      this.adminService.listarTemas(),
    ]);
    if (provasRes.ok) this.provasDisponiveis.set(provasRes.data);
    if (temasRes.ok) this.temasDisponiveis.set(temasRes.data);
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

  async deletar(questao: AdminQuestao): Promise<void> {
    if (!confirm('Deletar questão? Esta ação é irreversível.')) return;
    const result = await this.adminService.deletarQuestao(questao.id);
    if (result.ok) {
      this.questoes.update((lista) => lista.filter((q) => q.id !== questao.id));
      this.total.update((t) => t - 1);
      this.toast.success('Questão deletada.');
    } else {
      this.toast.error('Erro ao deletar questão.');
    }
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
    this.questaoEditandoId.set(null);
    this.modoDrawer.set('criar');
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
    this.fStatus.set(d.status ?? 'rascunho');
    this.fDificuldade.set(d.dificuldade ?? null);
    this.fDisciplina.set(d.disciplina ?? '');
    this.fPeriodo.set(d.periodo ?? null);
    this.fProvaId.set(d.prova_id ?? null);
    this.fOrdemNaProva.set(d.ordem_na_prova ?? null);
    this.fExplicacao.set(d.explicacao ?? '');
    this.fReferencia.set(d.referencia ?? '');
    this.fFonte.set(d.fonte ?? '');
    this.fRevisado.set(d.revisado ?? false);
    this.fAptoDesafio.set(d.apto_desafio_diario ?? true);
    this.fRespostaCorreta.set(d.resposta_correta_texto ?? '');
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
    this.modoDrawer.set('fechado');
  }

  // ---- Formulário: mutações ----

  protected onFormatoChange(formato: string): void {
    this.fFormato.set(formato);
    this.fAlternativas.set(alternativasIniciais(formato));
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

    this.salvando.set(true);

    const questaoPayload: QuestaoPayload = {
      enunciado: this.fEnunciado().trim(),
      enunciado_apoio: this.fEnunciadoApoio().trim() || null,
      formato: this.fFormato(),
      status: this.fStatus(),
      dificuldade: this.fDificuldade(),
      disciplina: this.fDisciplina().trim() || null,
      periodo: this.fPeriodo(),
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
    this.fStatus.set('rascunho');
    this.fDificuldade.set(null);
    this.fDisciplina.set('');
    this.fPeriodo.set(null);
    this.fProvaId.set(null);
    this.fOrdemNaProva.set(null);
    this.fExplicacao.set('');
    this.fReferencia.set('');
    this.fFonte.set('');
    this.fRevisado.set(false);
    this.fAptoDesafio.set(true);
    this.fRespostaCorreta.set('');
    this.fAlternativas.set(alternativasIniciais('multipla_escolha'));
    this.fTemas.set([]);
    this.fTemaBusca.set('');
  }
}
