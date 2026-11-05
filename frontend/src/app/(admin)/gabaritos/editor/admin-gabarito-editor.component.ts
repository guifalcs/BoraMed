import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import {
  ArrowLeft,
  Bell,
  Ban,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  ExternalLink,
  HelpCircle,
  Keyboard,
  Layers,
  Mail,
  MessageSquareText,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from 'lucide-angular';
import { GabaritoProvaService } from '../../../core/services/gabarito-prova.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { UiSelectComponent, type SelectOption } from '../../../shared/components/ui/select/ui-select.component';
import type { SaidaProtegida } from '../../../core/guards/sair-sem-salvar.guard';
import {
  MAX_CADERNOS_GABARITO,
  NOME_CADERNO_UNICO,
  TIPOS_PROVA_SUGERIDOS,
  type GabaritoProvaQuestao,
  type GabaritoStatus,
  type LetraGabarito,
} from '../../../core/models/gabarito-prova';
import type { GabaritoEmailResultado } from '../../../core/models/gabarito-prova';
import {
  aplicarSequencia,
  distribuicaoLetras,
  folhaEmBranco,
  letrasDisponiveis,
  MAX_QUESTOES_GABARITO,
  NOMES_CADERNO_SUGERIDOS,
  nomeGabarito,
  nomesRepetidos,
  parseSequenciaGabarito,
  proximoNomeCaderno,
  redimensionarFolha,
  resumoFolha,
  semestreAtual,
} from '../../../core/utils/gabarito-prova.util';

const TOTAL_PADRAO = 40;

/** Um caderno em edição. `id` null = ainda não salvo; `chave` só serve para o `track` do template. */
interface CadernoEditor {
  chave: string;
  id: string | null;
  nome: string;
  folha: GabaritoProvaQuestao[];
}

let seqCaderno = 0;
function novoCaderno(nome: string, folha: GabaritoProvaQuestao[], id: string | null = null): CadernoEditor {
  return { chave: `c${++seqCaderno}`, id, nome, folha };
}

interface ResumoAviso {
  /** O admin pediu aviso nesta ação. */
  avisou: boolean;
  /** Alunos notificados no app agora. */
  app: number;
  email: GabaritoEmailResultado | null;
  emailErro: string | null;
}
const PRESETS_TOTAL = [20, 30, 40, 50, 60, 80, 100] as const;

@Component({
  selector: 'app-admin-gabarito-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, UiIconComponent, UiSelectComponent],
  templateUrl: './admin-gabarito-editor.component.html',
  styleUrls: ['../admin-gabaritos.component.css', './admin-gabarito-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGabaritoEditorComponent implements OnInit, SaidaProtegida {
  private readonly service = inject(GabaritoProvaService);
  private readonly toast = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly cartao = viewChild<ElementRef<HTMLElement>>('cartao');

  // ── Estado do cabeçalho ────────────────────────────────────────────────
  protected readonly id = signal<string | null>(null);
  protected readonly slug = signal<string | null>(null);
  protected readonly status = signal<GabaritoStatus>('rascunho');
  protected readonly notificadoEm = signal<string | null>(null);
  protected readonly tipoProva = signal<string>('N2');
  protected readonly tipoCustom = signal(false);
  protected readonly periodo = signal<number | null>(null);
  protected readonly semestre = signal(semestreAtual());
  protected readonly dataProva = signal('');
  protected readonly titulo = signal('');
  protected readonly observacao = signal('');
  protected readonly qtdAlt = signal(5);
  protected readonly conferido = signal(false);

  // ── Estado da folha ────────────────────────────────────────────────────
  /** Todos os cadernos da prova; cada um tem a sua folha. Nunca fica vazio. */
  protected readonly cadernos = signal<CadernoEditor[]>([novoCaderno(NOME_CADERNO_UNICO, folhaEmBranco(TOTAL_PADRAO))]);
  /** Caderno cuja folha aparece no cartão-resposta. */
  protected readonly cadernoIdx = signal(0);
  /** Folha do caderno ativo: é nela que o cartão, a colagem e a lateral trabalham. */
  protected readonly folha = computed(() => this.cadernos()[this.cadernoIdx()]?.folha ?? []);
  protected readonly varios = computed(() => this.cadernos().length > 1);
  protected readonly cadernoAtivo = computed<CadernoEditor | null>(() => this.cadernos()[this.cadernoIdx()] ?? null);
  /** Nome do caderno ativo, já sem espaços nas pontas ('' se não houver). */
  protected readonly nomeCadernoAtivo = computed(() => this.cadernoAtivo()?.nome.trim() ?? '');
  protected readonly novoCadernoNome = signal('');
  protected readonly ativa = signal(0);
  protected readonly expandida = signal<number | null>(null);
  protected readonly colarAberto = signal(false);
  protected readonly textoColado = signal('');

  // ── Estado de tela ─────────────────────────────────────────────────────
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly sujo = signal(false);
  protected readonly notificar = signal(true);
  protected readonly tentouSalvar = signal(false);
  protected readonly publicadoAgora = signal<ResumoAviso | null>(null);
  /** Estado do e-mail do gabarito. null = ainda não saiu. */
  protected readonly emailCampanha = signal<{ status: string | null; enviados: number } | null>(null);
  protected readonly emailPrevia = signal<SafeHtml | null>(null);
  protected readonly carregandoPrevia = signal(false);
  /** Algum canal de aviso (app ou e-mail) ainda não saiu. */
  protected readonly avisoPendente = computed(() => !this.notificadoEm() || !this.emailCampanha());

  protected readonly tiposSugeridos = TIPOS_PROVA_SUGERIDOS;
  protected readonly periodos = Array.from({ length: 12 }, (_, i) => i + 1);
  protected readonly presetsTotal = PRESETS_TOTAL;
  protected readonly semestres = (() => {
    const [ano, s] = semestreAtual().split('.').map(Number);
    const lista: string[] = [];
    let a = ano;
    let p = s;
    // Próximo, atual e três anteriores: cobre cadastro atrasado de prova antiga.
    p === 2 ? ((a = ano + 1), (p = 1)) : (p = 2);
    for (let i = 0; i < 5; i++) {
      lista.push(`${a}.${p}`);
      if (p === 1) { a -= 1; p = 2; } else { p = 1; }
    }
    return lista;
  })();

  protected readonly opcoesSemestre: SelectOption<string>[] = this.semestres.map((s) => ({ value: s, label: s }));
  protected readonly letras = computed(() => letrasDisponiveis(this.qtdAlt()));
  protected readonly resumo = computed(() => resumoFolha(this.folha()));
  protected readonly distribuicao = computed(() => distribuicaoLetras(this.folha(), this.qtdAlt()));
  /** Progresso de cada caderno (abas e lateral). */
  protected readonly progressoCadernos = computed(() =>
    this.cadernos().map((c) => {
      const r = resumoFolha(c.folha);
      return { chave: c.chave, nome: c.nome, ...r, completo: r.total > 0 && r.emAnalise === 0, pct: r.total ? Math.round((r.preenchidas / r.total) * 100) : 0 };
    }),
  );
  protected readonly nomesDuplicados = computed(() => nomesRepetidos(this.cadernos().map((c) => c.nome)));
  /** Com mais de um caderno, cada um precisa de nome próprio. Com um só, o nome não aparece. */
  protected readonly cadernosValidos = computed(
    () => !this.varios() || (this.cadernos().every((c) => !!c.nome.trim()) && this.nomesDuplicados().size === 0),
  );
  /** Atalhos de nome que ainda não estão em uso. */
  protected readonly nomesSugeridos = computed(() => {
    const usados = new Set(this.cadernos().map((c) => c.nome.trim().toLocaleLowerCase('pt-BR')));
    return NOMES_CADERNO_SUGERIDOS.filter((n) => !usados.has(n.toLocaleLowerCase('pt-BR')));
  });
  protected readonly maxDistribuicao = computed(() => Math.max(1, ...this.distribuicao().map((d) => d.total)));
  protected readonly progresso = computed(() => {
    const r = this.resumo();
    return r.total ? Math.round((r.preenchidas / r.total) * 100) : 0;
  });
  protected readonly nomeExibido = computed(() =>
    nomeGabarito({ titulo: this.titulo() || null, tipo_prova: this.tipoProva() || 'Prova', periodo: this.periodo() ?? 0 }),
  );
  protected readonly cabecalhoValido = computed(
    () =>
      !!this.tipoProva().trim() && this.periodo() !== null && /^\d{4}\.[12]$/.test(this.semestre()) && this.cadernosValidos(),
  );
  protected readonly previewColado = computed(() =>
    this.textoColado().trim() ? parseSequenciaGabarito(this.textoColado(), this.qtdAlt()) : [],
  );
  /** Metade da folha: o cartão vira duas colunas no desktop, como o papel. */
  protected readonly colunas = computed(() => {
    const f = this.folha();
    if (f.length <= 15) return [f];
    const meio = Math.ceil(f.length / 2);
    return [f.slice(0, meio), f.slice(meio)];
  });

  protected readonly iconBack = ArrowLeft;
  protected readonly iconBell = Bell;
  protected readonly iconMail = Mail;
  protected readonly iconAnular = Ban;
  protected readonly iconCheck = CheckCircle2;
  protected readonly iconPaste = ClipboardPaste;
  protected readonly iconCopy = Copy;
  protected readonly iconCadernos = Layers;
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly maxCadernos = MAX_CADERNOS_GABARITO;
  protected readonly iconExternal = ExternalLink;
  protected readonly iconAnalise = HelpCircle;
  protected readonly iconKeyboard = Keyboard;
  protected readonly iconComment = MessageSquareText;
  protected readonly iconSave = Save;
  protected readonly iconSend = Send;
  protected readonly iconUndo = Undo2;
  protected readonly iconX = X;

  async ngOnInit(): Promise<void> {
    // Rota única `gabaritos/:slug` ("novo" = criação). Depois do 1º save a URL
    // troca para o slug na MESMA rota: o componente é reaproveitado e o estado
    // da folha continua na tela, por isso só lemos o snapshot inicial.
    const slug = this.route.snapshot.paramMap.get('slug') ?? 'novo';
    if (slug === 'novo') return;
    await this.carregar(slug);
  }

  private async carregar(slug: string): Promise<void> {
    this.carregando.set(true);
    const r = await this.service.adminObter(slug);
    this.carregando.set(false);
    if (!r.ok || !r.data) {
      this.toast.error(r.ok ? 'Gabarito não encontrado.' : r.error);
      await this.router.navigateByUrl('/admin/gabaritos');
      return;
    }
    const g = r.data;
    this.id.set(g.id);
    this.slug.set(g.slug);
    this.status.set(g.status);
    this.tipoProva.set(g.tipo_prova);
    this.tipoCustom.set(!(TIPOS_PROVA_SUGERIDOS as readonly string[]).includes(g.tipo_prova));
    this.periodo.set(g.periodo);
    this.semestre.set(g.semestre);
    this.dataProva.set(g.data_prova ?? '');
    this.titulo.set(g.titulo ?? '');
    this.observacao.set(g.observacao ?? '');
    this.qtdAlt.set(g.qtd_alternativas);
    this.conferido.set(g.conferido_oficial);
    this.cadernos.set(
      g.cadernos.length
        ? g.cadernos.map((c) => novoCaderno(c.nome, c.questoes.length ? c.questoes : folhaEmBranco(TOTAL_PADRAO), c.id))
        : [novoCaderno(NOME_CADERNO_UNICO, folhaEmBranco(TOTAL_PADRAO))],
    );
    this.cadernoIdx.set(0);
    // Avisar o período é one-shot: depois da primeira vez a opção some.
    this.notificar.set(false);
    this.sujo.set(false);
    // `notificado_em` não vem no get público; a lista do admin é a fonte.
    const lista = await this.service.adminListar();
    if (lista.ok) {
      const item = lista.data.find((x) => x.id === g.id);
      this.notificadoEm.set(item?.notificado_em ?? null);
      this.emailCampanha.set(
        item?.email_campanha_id ? { status: item.email_status, enviados: item.email_enviados } : null,
      );
      this.notificar.set(!item?.notificado_em && !item?.email_campanha_id);
    }
  }

  // ── Cabeçalho ──────────────────────────────────────────────────────────

  protected escolherTipo(tipo: string | null): void {
    if (tipo === null) {
      this.tipoCustom.set(true);
      this.tipoProva.set('');
    } else {
      this.tipoCustom.set(false);
      this.tipoProva.set(tipo);
    }
    this.marcarSujo();
  }

  protected setCampo(campo: 'tipoProva' | 'semestre' | 'dataProva' | 'titulo' | 'observacao', valor: string): void {
    this[campo].set(valor);
    this.marcarSujo();
  }

  protected escolherPeriodo(p: number): void {
    this.periodo.set(p);
    this.marcarSujo();
  }

  protected escolherQtdAlt(qtd: number): void {
    if (qtd === this.qtdAlt()) return;
    const validas = letrasDisponiveis(qtd);
    const perdidas = this.cadernos()
      .flatMap((c) => c.folha)
      .filter((q) => q.resposta && !validas.includes(q.resposta)).length;
    const ultima = validas[validas.length - 1];
    if (perdidas && !confirm(`${perdidas} questão(ões) com letra depois de ${ultima} vão ficar em branco${this.varios() ? ' (somando os cadernos)' : ''}. Continuar?`)) return;
    this.qtdAlt.set(qtd);
    this.cadernos.update((cs) =>
      cs.map((c) => ({
        ...c,
        folha: c.folha.map((q) => (q.resposta && !validas.includes(q.resposta) ? { ...q, resposta: null } : q)),
      })),
    );
    this.marcarSujo();
  }

  /** @returns o total que ficou valendo (o input reflete isso se o confirm for cancelado). */
  protected alterarTotal(valor: number | string): number {
    const total = Math.max(1, Math.min(MAX_QUESTOES_GABARITO, Math.floor(Number(valor)) || 1));
    // Todos os cadernos da prova têm o mesmo número de questões.
    const atual = this.folha().length;
    if (total === atual) return total;
    // Área e comentário também são conteúdo: cortar a questão apaga os dois.
    const cortadas = this.cadernos()
      .flatMap((c) => c.folha.slice(total))
      .filter((q) => q.resposta || q.anulada || q.area || q.comentario).length;
    if (
      cortadas &&
      !confirm(
        `As questões ${total + 1} a ${atual} têm ${cortadas} com resposta, área ou comentário${this.varios() ? ' (somando os cadernos)' : ''}. Remover mesmo assim?`,
      )
    ) {
      return atual;
    }
    this.cadernos.update((cs) => cs.map((c) => ({ ...c, folha: redimensionarFolha(c.folha, total) })));
    this.ativa.update((a) => Math.min(a, total - 1));
    this.marcarSujo();
    return total;
  }

  protected onTotalInput(el: HTMLInputElement): void {
    el.value = String(this.alterarTotal(el.value));
  }

  protected alternarConferido(): void {
    this.conferido.update((v) => !v);
    this.marcarSujo();
  }

  // ── Cadernos ───────────────────────────────────────────────────────────

  protected selecionarCaderno(idx: number): void {
    if (idx === this.cadernoIdx()) return;
    this.cadernoIdx.set(idx);
    this.ativa.set(0);
    this.expandida.set(null);
    this.colarAberto.set(false);
    this.textoColado.set('');
  }

  /**
   * Acrescenta um caderno (folha em branco, mesmo nº de questões). `nome` null =
   * "Caderno B", "Caderno C"… Ao passar de 1 para 2, o primeiro deixa de ser o
   * "Caderno único" e ganha nome: "Caderno A" no caso comum, ou vazio (o admin
   * preenche) quando o novo é uma cor, para não adivinhar errado.
   */
  protected adicionarCaderno(nome: string | null): void {
    const atuais = this.cadernos();
    if (atuais.length >= MAX_CADERNOS_GABARITO) {
      this.toast.error(`Uma prova tem no máximo ${MAX_CADERNOS_GABARITO} cadernos.`);
      return;
    }
    let lista = atuais;
    if (atuais.length === 1 && atuais[0].nome === NOME_CADERNO_UNICO) {
      lista = [{ ...atuais[0], nome: nome === null ? 'Caderno A' : '' }];
    }
    const nomeNovo = (nome ?? proximoNomeCaderno(lista.map((c) => c.nome))).trim();
    if (!nomeNovo) return;
    if (lista.some((c) => c.nome.trim().toLocaleLowerCase('pt-BR') === nomeNovo.toLocaleLowerCase('pt-BR'))) {
      this.toast.error(`Já existe um caderno chamado “${nomeNovo}”.`);
      return;
    }
    this.cadernos.set([...lista, novoCaderno(nomeNovo, folhaEmBranco(this.folha().length))]);
    this.selecionarCaderno(lista.length);
    this.novoCadernoNome.set('');
    this.marcarSujo();
  }

  protected adicionarCadernoDigitado(): void {
    const nome = this.novoCadernoNome().trim();
    if (nome) this.adicionarCaderno(nome);
  }

  protected renomearCaderno(idx: number, nome: string): void {
    this.cadernos.update((cs) => cs.map((c, i) => (i === idx ? { ...c, nome } : c)));
    this.marcarSujo();
  }

  protected removerCaderno(idx: number): void {
    const cs = this.cadernos();
    if (cs.length <= 1) return;
    const c = cs[idx];
    const respondidas = resumoFolha(c.folha).preenchidas;
    const rotulo = c.nome.trim() || `caderno ${idx + 1}`;
    const aviso = respondidas
      ? `Excluir o caderno “${rotulo}” e as ${respondidas} respostas dele? Não dá para desfazer depois de salvar.`
      : `Excluir o caderno “${rotulo}”?`;
    if (!confirm(aviso)) return;
    this.cadernos.set(cs.filter((_, i) => i !== idx));
    this.cadernoIdx.update((a) => Math.min(a > idx ? a - 1 : a, cs.length - 2));
    this.ativa.set(0);
    this.expandida.set(null);
    this.marcarSujo();
  }

  // ── Folha ──────────────────────────────────────────────────────────────

  /** Altera só a folha do caderno ativo. */
  private atualizarFolha(fn: (folha: GabaritoProvaQuestao[]) => GabaritoProvaQuestao[]): void {
    const atual = this.cadernoIdx();
    this.cadernos.update((cs) => cs.map((c, i) => (i === atual ? { ...c, folha: fn(c.folha) } : c)));
  }

  protected marcar(idx: number, letra: LetraGabarito, avancar = false): void {
    this.atualizarFolha((f) =>
      f.map((q, i) => {
        if (i !== idx) return q;
        // Clicar de novo na letra marcada desmarca (volta a "em análise").
        if (!avancar && q.resposta === letra) return { ...q, resposta: null };
        return { ...q, resposta: letra, anulada: false };
      }),
    );
    this.ativa.set(avancar ? Math.min(idx + 1, this.folha().length - 1) : idx);
    this.marcarSujo();
    if (avancar) this.rolarParaAtiva();
  }

  protected alternarAnulada(idx: number, avancar = false): void {
    this.atualizarFolha((f) =>
      f.map((q, i) => (i === idx ? { ...q, anulada: avancar ? true : !q.anulada, resposta: null } : q)),
    );
    this.ativa.set(avancar ? Math.min(idx + 1, this.folha().length - 1) : idx);
    this.marcarSujo();
    if (avancar) this.rolarParaAtiva();
  }

  protected limpar(idx: number): void {
    this.atualizarFolha((f) => f.map((q, i) => (i === idx ? { ...q, resposta: null, anulada: false } : q)));
    this.marcarSujo();
  }

  protected setDetalhe(idx: number, campo: 'area' | 'comentario', valor: string): void {
    this.atualizarFolha((f) => f.map((q, i) => (i === idx ? { ...q, [campo]: valor || null } : q)));
    this.marcarSujo();
  }

  protected alternarExpandida(idx: number): void {
    this.expandida.update((e) => (e === idx ? null : idx));
  }

  protected focarLinha(idx: number): void {
    this.ativa.set(idx);
    this.cartao()?.nativeElement.focus({ preventScroll: true });
  }

  /** Digitação rápida: A–E marca e avança, X anula, ? ou espaço deixa em análise. */
  protected onTeclaCartao(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const idx = this.ativa();
    const tecla = ev.key.toUpperCase();
    const ultima = this.folha().length - 1;

    if ((this.letras() as string[]).includes(tecla)) {
      ev.preventDefault();
      this.marcar(idx, tecla as LetraGabarito, true);
    } else if (tecla === 'X') {
      ev.preventDefault();
      this.alternarAnulada(idx, true);
    } else if (tecla === '?' || tecla === ' ') {
      ev.preventDefault();
      this.limpar(idx);
      this.ativa.set(Math.min(idx + 1, ultima));
      this.rolarParaAtiva();
    } else if (tecla === 'BACKSPACE' || tecla === 'DELETE') {
      ev.preventDefault();
      if (tecla === 'BACKSPACE' && !this.folha()[idx].resposta && !this.folha()[idx].anulada && idx > 0) {
        this.ativa.set(idx - 1);
        this.limpar(idx - 1);
      } else {
        this.limpar(idx);
      }
      this.rolarParaAtiva();
    } else if (tecla === 'ARROWDOWN' || tecla === 'ENTER') {
      ev.preventDefault();
      this.ativa.set(Math.min(idx + 1, ultima));
      this.rolarParaAtiva();
    } else if (tecla === 'ARROWUP') {
      ev.preventDefault();
      this.ativa.set(Math.max(idx - 1, 0));
      this.rolarParaAtiva();
    } else if (tecla === 'HOME') {
      ev.preventDefault();
      this.ativa.set(0);
      this.rolarParaAtiva();
    } else if (tecla === 'END') {
      ev.preventDefault();
      this.ativa.set(ultima);
      this.rolarParaAtiva();
    }
  }

  private rolarParaAtiva(): void {
    queueMicrotask(() => {
      const el = this.cartao()?.nativeElement.querySelector<HTMLElement>(`[data-q="${this.ativa() + 1}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  protected aplicarColado(): void {
    const seq = this.previewColado();
    if (!seq.length) return;
    // A colagem pode passar do nº de questões: a prova inteira cresce junto.
    const alvo = Math.min(MAX_QUESTOES_GABARITO, Math.max(this.folha().length, seq.length));
    this.cadernos.update((cs) =>
      cs.map((c, i) => {
        const folha = i === this.cadernoIdx() ? aplicarSequencia(c.folha, seq) : redimensionarFolha(c.folha, alvo);
        return { ...c, folha };
      }),
    );
    this.colarAberto.set(false);
    this.textoColado.set('');
    this.ativa.set(Math.min(seq.length, this.folha().length - 1));
    this.marcarSujo();
    this.toast.success(
      this.varios()
        ? `${seq.length} respostas aplicadas ao caderno ${this.cadernoAtivo()?.nome}.`
        : `${seq.length} respostas aplicadas a partir da questão 1.`,
    );
  }

  // ── Persistência ───────────────────────────────────────────────────────

  protected async salvar(): Promise<boolean> {
    this.tentouSalvar.set(true);
    if (!this.cabecalhoValido()) {
      this.toast.error(
        this.cadernosValidos() ? 'Preencha tipo de prova, período e semestre.' : 'Dê um nome diferente a cada caderno.',
      );
      return false;
    }
    this.salvando.set(true);
    const r = await this.service.adminSalvar({
      id: this.id() ?? undefined,
      tipo_prova: this.tipoProva().trim(),
      periodo: this.periodo() as number,
      semestre: this.semestre(),
      data_prova: this.dataProva() || null,
      titulo: this.titulo().trim() || null,
      observacao: this.observacao().trim() || null,
      qtd_alternativas: this.qtdAlt(),
      conferido_oficial: this.conferido(),
      cadernos: this.cadernos().map((c) => ({ id: c.id ?? undefined, nome: c.nome.trim(), questoes: c.folha })),
    });
    this.salvando.set(false);
    if (!r.ok) {
      this.toast.error(r.error);
      return false;
    }
    const novo = !this.id();
    this.id.set(r.data.id);
    this.slug.set(r.data.slug);
    // Guarda os ids dos cadernos: o próximo save os identifica (e preserva o link de cada um).
    const salvos = r.data.cadernos;
    this.cadernos.update((cs) => cs.map((c, i) => ({ ...c, id: salvos[i]?.id ?? c.id })));
    this.sujo.set(false);
    if (novo) {
      // Troca /novo pelo slug sem recarregar: F5 depois cai no editor certo.
      await this.router.navigate(['/admin/gabaritos', r.data.slug], { replaceUrl: true });
    }
    return true;
  }

  protected async salvarRascunho(): Promise<void> {
    if (await this.salvar()) this.toast.success(this.status() === 'publicado' ? 'Alterações no ar.' : 'Rascunho salvo.');
  }

  protected async publicar(): Promise<void> {
    const progresso = this.progressoCadernos();
    if (progresso.every((c) => c.preenchidas === 0)) {
      this.toast.error('Preencha ao menos uma questão antes de publicar.');
      return;
    }
    // Caderno sem nenhuma resposta publicado = aluno do caderno vê só "em análise".
    const vazios = progresso.filter((c) => c.preenchidas === 0).map((c) => c.nome.trim() || 'sem nome');
    if (vazios.length && !confirm(`${vazios.length === 1 ? 'O caderno' : 'Os cadernos'} ${vazios.join(', ')} ${vazios.length === 1 ? 'não tem' : 'não têm'} nenhuma resposta. Publicar assim mesmo?`)) {
      return;
    }
    if ((this.sujo() || !this.id()) && !(await this.salvar())) return;
    const id = this.id();
    if (!id) return;
    const avisar = this.notificar() && this.avisoPendente();
    this.salvando.set(true);
    const r = await this.service.adminPublicar(id, true, false);
    if (!r.ok) {
      this.salvando.set(false);
      this.toast.error(r.error);
      return;
    }
    this.status.set('publicado');
    const resumo = avisar ? await this.dispararAvisos(id) : null;
    this.salvando.set(false);
    this.publicadoAgora.set(resumo ?? { avisou: false, app: 0, email: null, emailErro: null });
  }

  /** Gabarito já no ar com algum canal pendente (publicado sem aviso, ou sem aluno na hora). */
  protected async avisarAgora(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.salvando.set(true);
    const r = await this.dispararAvisos(id);
    this.salvando.set(false);
    this.publicadoAgora.set(r);
  }

  /**
   * Dispara os canais que ainda não saíram: notificação no app (todos do
   * período, via RPC) e e-mail (até 50, fora de Ipatinga primeiro, via edge
   * function das campanhas). Um canal falhar não impede o outro.
   */
  private async dispararAvisos(id: string): Promise<ResumoAviso> {
    const resumo: ResumoAviso = { avisou: true, app: 0, email: null, emailErro: null };
    if (!this.notificadoEm()) {
      const app = await this.service.adminPublicar(id, true, true);
      if (app.ok) {
        resumo.app = app.data.notificados;
        this.notificadoEm.set(app.data.notificado_em);
      } else {
        this.toast.error(app.error);
      }
    }
    if (!this.emailCampanha()) {
      const email = await this.service.adminEnviarEmail(id);
      if (email.ok) {
        resumo.email = email.data;
        if (!email.data.sem_destinatarios) {
          this.emailCampanha.set({ status: email.data.status ?? 'enviada', enviados: email.data.enviados ?? 0 });
        }
      } else {
        resumo.emailErro = email.error;
      }
    }
    this.notificar.set(false);
    return resumo;
  }

  protected async verEmail(): Promise<void> {
    const id = this.id();
    if (!id) {
      this.toast.error('Salve o gabarito para ver o e-mail.');
      return;
    }
    this.carregandoPrevia.set(true);
    const r = await this.service.adminPreviaEmail(id);
    this.carregandoPrevia.set(false);
    if (!r.ok) {
      this.toast.error(r.error);
      return;
    }
    // Mesmo tratamento da prévia de /admin/campanhas: o HTML vem da edge
    // function e o bypass preserva os style inline; o destino é um iframe
    // sandbox sem scripts nem same-origin, então nada ali executa.
    this.emailPrevia.set(this.sanitizer.bypassSecurityTrustHtml(r.data.html));
  }

  /** Consultado pelo guard de saída da rota. */
  podeSair(): boolean {
    return !this.sujo() || confirm('Há alterações não salvas no gabarito. Sair mesmo assim?');
  }

  protected async despublicar(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.salvando.set(true);
    const r = await this.service.adminPublicar(id, false, false);
    this.salvando.set(false);
    if (r.ok) {
      this.status.set('rascunho');
      this.toast.success('Gabarito saiu do ar.');
    } else {
      this.toast.error(r.error);
    }
  }

  protected linkPublico(): string {
    const origem = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origem}/gabaritos/${this.slug() ?? ''}`;
  }

  protected linkWhatsapp(): string {
    const texto = `Saiu o gabarito extraoficial da ${this.nomeExibido()} (${this.semestre()}) 👀\nConfere e calcula sua nota: ${this.linkPublico()}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  protected async copiarLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.linkPublico());
      this.toast.success('Link copiado.');
    } catch {
      this.toast.error('Não consegui copiar o link.');
    }
  }

  private marcarSujo(): void {
    this.sujo.set(true);
  }

  @HostListener('window:beforeunload', ['$event'])
  protected avisarSaida(ev: BeforeUnloadEvent): void {
    if (this.sujo()) ev.preventDefault();
  }
}
