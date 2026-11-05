import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  RESPONSE_INIT,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  ClipboardPaste,
  Copy,
  HelpCircle,
  Layers,
  MessageSquareText,
  RotateCcw,
  Share2,
  ListChecks,
} from 'lucide-angular';
import { GabaritoProvaService } from '../../core/services/gabarito-prova.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { SeoService } from '../../core/seo/seo.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { GabaritosTopoComponent } from './gabaritos-topo.component';
import { GabaritosAvisoComponent } from './gabaritos-aviso.component';
import {
  acharCaderno,
  conferirRespostas,
  letrasDisponiveis,
  nomeGabarito,
  parseSequenciaGabarito,
  resumoFolha,
} from '../../core/utils/gabarito-prova.util';
import type {
  GabaritoCaderno,
  GabaritoProva,
  GabaritoProvaQuestao,
  LetraGabarito,
} from '../../core/models/gabarito-prova';

type Modo = 'gabarito' | 'conferir';

const STORAGE_PREFIX = 'bm-gabarito-marcadas:';
/** Último caderno que o aluno escolheu em cada gabarito. */
const STORAGE_CADERNO = 'bm-gabarito-caderno:';

@Component({
  selector: 'app-gabarito-detalhe',
  standalone: true,
  imports: [FormsModule, RouterLink, UiIconComponent, GabaritosTopoComponent, GabaritosAvisoComponent],
  templateUrl: './gabarito-detalhe.component.html',
  styleUrl: './gabaritos.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GabaritoDetalheComponent {
  private readonly service = inject(GabaritoProvaService);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NotificationService);
  protected readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });

  protected readonly embutido = this.route.snapshot.data['embutido'] === true;
  protected readonly base = this.embutido ? '/dashboard/gabaritos' : '/gabaritos';
  /**
   * Slug atual. Vem do `paramMap` (não do snapshot): de um gabarito para outro
   * na mesma rota (ex.: clique no sino estando num gabarito) o Angular
   * reaproveita o componente, e a tela tem que acompanhar a URL.
   */
  private slug = '';

  protected readonly gabarito = signal<GabaritoProva | null>(null);
  protected readonly carregando = signal(true);
  protected readonly naoEncontrado = signal(false);

  /** Slug do caderno escolhido. Com vários cadernos, null = o aluno ainda não escolheu. */
  protected readonly cadernoSlug = signal<string | null>(null);
  protected readonly modo = signal<Modo>('gabarito');
  protected readonly selecionada = signal<number | null>(null);
  protected readonly areaFiltro = signal<string | null>(null);

  /** Marcações do aluno no modo conferir (número → letra). */
  protected readonly marcadas = signal<Record<number, LetraGabarito | undefined>>({});
  protected readonly corrigido = signal(false);
  protected readonly colarAberto = signal(false);
  protected readonly textoColado = signal('');

  protected readonly nome = computed(() => {
    const g = this.gabarito();
    return g ? nomeGabarito(g) : '';
  });
  protected readonly letras = computed(() => letrasDisponiveis(this.gabarito()?.qtd_alternativas ?? 5));

  protected readonly varios = computed(() => (this.gabarito()?.cadernos.length ?? 0) > 1);
  /**
   * Caderno em exibição. Com um só, é ele. Com vários, só o que o aluno escolheu:
   * nunca "chutamos" um (a ordem das questões muda, e a nota sairia errada).
   */
  protected readonly cadernoAtual = computed<GabaritoCaderno | null>(() => {
    const cadernos = this.gabarito()?.cadernos ?? [];
    return cadernos.length === 1 ? cadernos[0] : acharCaderno(cadernos, this.cadernoSlug());
  });
  protected readonly precisaEscolher = computed(() => this.varios() && !this.cadernoAtual());
  /** Questões por caderno (todos têm o mesmo número). */
  protected readonly totalQuestoes = computed(() => this.gabarito()?.cadernos[0]?.questoes.length ?? 0);
  protected readonly questoes = computed(() => this.cadernoAtual()?.questoes ?? []);

  protected readonly resumo = computed(() => resumoFolha(this.questoes()));
  /** Caderno publicado, mas a equipe ainda não fechou nenhuma resposta dele. */
  protected readonly cadernoSemRespostas = computed(
    () => !!this.cadernoAtual() && this.resumo().preenchidas === 0,
  );
  protected readonly areas = computed(() => [
    ...new Set(this.questoes().map((q) => q.area).filter((a): a is string => !!a)),
  ]);
  protected readonly questoesVisiveis = computed(() => {
    const a = this.areaFiltro();
    const qs = this.questoes();
    return a ? qs.filter((q) => q.area === a) : qs;
  });
  protected readonly questaoSelecionada = computed<GabaritoProvaQuestao | null>(() => {
    const n = this.selecionada();
    return n === null ? null : (this.questoes().find((q) => q.numero === n) ?? null);
  });
  protected readonly totalComentarios = computed(() => this.questoes().filter((q) => q.comentario).length);

  protected readonly totalMarcadas = computed(() => Object.values(this.marcadas()).filter(Boolean).length);
  protected readonly resultado = computed(() => conferirRespostas(this.questoes(), this.marcadas()));
  protected readonly faixa = computed(() => {
    if (this.resultado().consideradas === 0) return { rotulo: 'Nenhuma questão fechada ainda.', classe: 'is-bom' };
    const n = this.resultado().nota;
    if (n >= 85) return { rotulo: 'Mandou muito bem!', classe: 'is-otimo' };
    if (n >= 70) return { rotulo: 'Ótimo resultado.', classe: 'is-bom' };
    if (n >= 50) return { rotulo: 'Na média. Dá para subir.', classe: 'is-medio' };
    return { rotulo: 'Hora de revisar os temas.', classe: 'is-baixo' };
  });
  protected readonly previewColado = computed(() =>
    this.textoColado().trim() ? parseSequenciaGabarito(this.textoColado(), this.gabarito()?.qtd_alternativas ?? 5) : [],
  );

  protected readonly iconBack = ArrowLeft;
  protected readonly iconCheck = BadgeCheck;
  protected readonly iconAnulada = Ban;
  protected readonly iconPaste = ClipboardPaste;
  protected readonly iconCopy = Copy;
  protected readonly iconCaderno = Layers;
  protected readonly iconAnalise = HelpCircle;
  protected readonly iconComment = MessageSquareText;
  protected readonly iconReset = RotateCcw;
  protected readonly iconShare = Share2;
  protected readonly iconTarget = ListChecks;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      const slug = params.get('slug') ?? '';
      if (slug === this.slug) return;
      this.slug = slug;
      this.reiniciar();
      void this.carregar(slug);
    });
  }

  private reiniciar(): void {
    this.gabarito.set(null);
    this.carregando.set(true);
    this.naoEncontrado.set(false);
    this.modo.set('gabarito');
    this.selecionada.set(null);
    this.areaFiltro.set(null);
    this.corrigido.set(false);
    this.colarAberto.set(false);
    this.textoColado.set('');
    this.marcadas.set({});
    this.cadernoSlug.set(null);
  }

  private async carregar(slug: string): Promise<void> {
    const r = await this.service.obter(slug);
    if (slug !== this.slug) return; // navegou para outro gabarito no meio da chamada
    this.carregando.set(false);
    if (this.isBrowser) void this.service.registrarVisualizacao(slug);
    if (!r.ok || !r.data) {
      this.naoEncontrado.set(true);
      // 404 de verdade no SSR (não "soft 404" com status 200).
      if (r.ok && this.responseInit) this.responseInit.status = 404;
      if (!this.embutido) {
        this.seo.update({
          title: 'Gabarito não encontrado',
          description: 'Este gabarito não existe ou saiu do ar.',
          path: `/gabaritos/${this.slug}`,
          noIndex: true,
        });
      }
      return;
    }
    this.gabarito.set(r.data);
    if (this.isBrowser) {
      // Volta no caderno que o aluno escolheu da última vez (se ainda existir).
      if (r.data.cadernos.length > 1) {
        const lembrado = acharCaderno(r.data.cadernos, this.lerLocal(STORAGE_CADERNO + slug));
        this.cadernoSlug.set(lembrado?.slug ?? null);
      }
      this.restaurarMarcadas();
    }
    // Rascunho só chega aqui para admin (pré-visualização): nunca cachear esse
    // HTML em CDN/proxy, ou o próximo visitante receberia o rascunho.
    if (r.data.status !== 'publicado' && this.responseInit) {
      const headers = new Headers(this.responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      this.responseInit.headers = headers;
    }
    if (!this.embutido) {
      const g = r.data;
      const nome = nomeGabarito(g);
      const cadernos = g.cadernos.length > 1 ? `, ${g.cadernos.length} cadernos (${g.cadernos.map((c) => c.nome).join(', ')})` : '';
      this.seo.update({
        title: `Gabarito ${nome} ${g.semestre} (extraoficial)`,
        description: `Gabarito extraoficial da ${nome}, ${g.semestre}: ${g.cadernos[0]?.questoes.length ?? 0} questões${cadernos}. Confira as respostas e calcule sua nota grátis no BoraMed.`,
        path: `/gabaritos/${g.slug}`,
        noIndex: g.status !== 'publicado',
      });
    }
  }

  // ── Cadernos ───────────────────────────────────────────────────────────

  /** Troca de caderno: cada um tem as suas marcações e a sua correção. */
  protected escolherCaderno(c: GabaritoCaderno): void {
    if (c.slug === this.cadernoSlug()) return;
    this.cadernoSlug.set(c.slug);
    this.selecionada.set(null);
    this.areaFiltro.set(null);
    this.corrigido.set(false);
    this.colarAberto.set(false);
    this.textoColado.set('');
    this.marcadas.set({});
    if (this.isBrowser) {
      try {
        localStorage.setItem(STORAGE_CADERNO + this.slug, c.slug);
      } catch {
        /* storage bloqueado: só não lembra na próxima visita */
      }
      this.restaurarMarcadas();
    }
  }

  // ── Modo gabarito ──────────────────────────────────────────────────────

  protected selecionar(q: GabaritoProvaQuestao): void {
    this.selecionada.update((n) => (n === q.numero ? null : q.numero));
  }

  // ── Modo conferir ──────────────────────────────────────────────────────

  protected marcar(numero: number, letra: LetraGabarito): void {
    this.marcadas.update((m) => ({ ...m, [numero]: m[numero] === letra ? undefined : letra }));
    this.persistirMarcadas();
  }

  protected corrigir(): void {
    this.corrigido.set(true);
    if (this.isBrowser) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected refazer(): void {
    this.marcadas.set({});
    this.corrigido.set(false);
    this.persistirMarcadas();
  }

  protected aplicarColado(): void {
    const seq = this.previewColado();
    const novas: Record<number, LetraGabarito | undefined> = {};
    seq.forEach((l, i) => {
      if (l !== 'X' && l !== '?') novas[i + 1] = l;
    });
    this.marcadas.set(novas);
    this.colarAberto.set(false);
    this.textoColado.set('');
    this.persistirMarcadas();
  }

  protected situacao(numero: number): string {
    return this.corrigido() ? this.resultado().porQuestao[numero] : '';
  }

  // ── Compartilhar ───────────────────────────────────────────────────────

  private url(): string {
    const origem = this.isBrowser ? window.location.origin : '';
    return `${origem}/gabaritos/${this.slug}`;
  }

  private textoCompartilhar(comNota: boolean): string {
    const r = this.resultado();
    const caderno = this.varios() ? ` (caderno ${this.cadernoAtual()?.nome})` : '';
    return comNota
      ? `Conferi minha ${this.nome()}${caderno} no gabarito extraoficial do BoraMed: ${r.acertos + r.anuladas}/${r.consideradas} (${r.nota.toLocaleString('pt-BR')}%). Confere o seu:`
      : `Saiu o gabarito extraoficial da ${this.nome()} 👀 Confere e calcula sua nota:`;
  }

  /**
   * No celular abre a folha de compartilhamento do sistema (WhatsApp, grupo,
   * Instagram, Telegram…). Sem suporte (desktop), abre o WhatsApp Web/app com
   * a mensagem e o link prontos; o aluno só escolhe a conversa ou o grupo.
   * O link é o público: quem recebe sem conta cai na vitrine, que convida a se cadastrar.
   */
  protected async compartilhar(comNota = false): Promise<void> {
    const texto = this.textoCompartilhar(comNota);
    const url = this.url();
    if (this.isBrowser && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Gabarito ${this.nome()}`, text: texto, url });
        return;
      } catch (e) {
        // Cancelar a folha não é erro; qualquer outra falha cai no WhatsApp.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    if (this.isBrowser) {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, '_blank', 'noopener');
    }
  }

  protected async copiarLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.toast.success('Link copiado.');
    } catch {
      this.toast.error('Não consegui copiar o link.');
    }
  }

  protected dataLonga(iso: string | null): string {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  }

  protected atualizadoEm(iso: string): string {
    // Fuso fixo: o SSR roda em UTC e o horário mudaria na hidratação.
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  // ── Persistência local das marcações ──────────────────────────────────

  /**
   * Gabarito de um caderno só mantém a chave antiga (as marcações já salvas
   * continuam valendo); com vários, cada caderno tem a sua.
   */
  private chaveMarcadas(): string {
    return this.varios() ? `${STORAGE_PREFIX}${this.slug}:${this.cadernoAtual()?.slug ?? ''}` : STORAGE_PREFIX + this.slug;
  }

  private lerLocal(chave: string): string | null {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  }

  private persistirMarcadas(): void {
    if (!this.isBrowser || this.precisaEscolher()) return;
    try {
      localStorage.setItem(this.chaveMarcadas(), JSON.stringify(this.marcadas()));
    } catch {
      /* storage cheio ou bloqueado: a conferência segue só em memória */
    }
  }

  private restaurarMarcadas(): void {
    if (this.precisaEscolher()) return;
    try {
      let salvo = this.lerLocal(this.chaveMarcadas());
      // O gabarito ganhou cadernos depois de o aluno marcar: o que ele marcou era do 1º.
      if (!salvo && this.varios() && this.cadernoAtual()?.ordem === 1) salvo = this.lerLocal(STORAGE_PREFIX + this.slug);
      if (!salvo) return;
      const obj = JSON.parse(salvo) as Record<string, unknown>;
      const limpo: Record<number, LetraGabarito | undefined> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && /^[A-E]$/.test(v)) limpo[Number(k)] = v as LetraGabarito;
      }
      this.marcadas.set(limpo);
    } catch {
      /* JSON corrompido: ignora */
    }
  }
}
