import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, CircleCheck, CircleX, LucideIconData, PartyPopper, Shuffle } from 'lucide-angular';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { Flashcard } from '../../../core/models/flashcard';
import { DeckCardComponent, type DeckCardItem } from '../../../shared/components/deck-card/deck-card.component';
import { FlashcardFlipComponent } from '../../../shared/components/flashcard-flip/flashcard-flip.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

type EstadoResposta = 'acertou' | 'errou';

const MAX_SUGESTOES = 3;

// Quantos cards à frente têm as imagens pré-carregadas. Janela pequena de
// propósito: cobre a navegação imediata sem baixar o deck inteiro de uma vez.
const JANELA_PRELOAD = 3;

@Component({
  selector: 'app-deck-execucao',
  standalone: true,
  imports: [NgClass, DeckCardComponent, FlashcardFlipComponent, PageHeaderComponent, UiButtonComponent, UiIconComponent],
  templateUrl: './deck-execucao.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckExecucaoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly flashcardService = inject(FlashcardService);
  private readonly toast = inject(NotificationService);

  protected readonly checkIcon: LucideIconData = CircleCheck;
  protected readonly xIcon: LucideIconData = CircleX;
  protected readonly shuffleIcon: LucideIconData = Shuffle;
  protected readonly voltarIcon: LucideIconData = ArrowLeft;
  protected readonly festaIcon: LucideIconData = PartyPopper;

  protected readonly deckId = signal<string | null>(null);
  protected readonly deckTitulo = signal('');
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly cards = signal<Flashcard[]>([]);
  protected readonly indiceAtual = signal(0);
  protected readonly virado = signal(false);
  protected readonly respostas = signal<Record<string, EstadoResposta>>({});
  protected readonly finalizado = signal(false);

  // Dispara a animação de "pop" nos contadores quando o valor muda.
  protected readonly popAcerto = signal(false);
  protected readonly popErro = signal(false);

  // Card com imagem vertical (qualquer face): recebe mais altura para valorizar a
  // imagem. Emitido pelo flashcard-flip; é por-card, então não muda ao virar.
  protected readonly cardAlto = signal(false);

  // Sugestões de outros decks exibidas na tela de conclusão.
  protected readonly sugestoes = signal<DeckCardItem[]>([]);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Flashcards', route: '/dashboard/flashcards' },
    { label: 'Estudar' },
  ];

  protected readonly cardAtual = computed<Flashcard | null>(() => this.cards()[this.indiceAtual()] ?? null);

  protected readonly progresso = computed(() => `Card ${this.indiceAtual() + 1} de ${this.cards().length}`);

  protected readonly acertos = computed(
    () => Object.values(this.respostas()).filter((r) => r === 'acertou').length,
  );
  protected readonly erros = computed(
    () => Object.values(this.respostas()).filter((r) => r === 'errou').length,
  );
  protected readonly percentualAcerto = computed(() => {
    const total = this.acertos() + this.erros();
    return total === 0 ? 0 : Math.round((this.acertos() / total) * 100);
  });
  protected readonly cardsErrados = computed<Flashcard[]>(() =>
    this.cards().filter((c) => this.respostas()[c.id] === 'errou'),
  );
  protected readonly progressoPct = computed(() => {
    const total = this.cards().length;
    return total === 0 ? 0 : Math.round((Object.keys(this.respostas()).length / total) * 100);
  });

  // URLs já pré-carregadas nesta sessão — evita refazer o request (mesmo que
  // saia do cache HTTP, criar Image por card repetidamente é trabalho à toa).
  private readonly imagensPrecarregadas = new Set<string>();

  constructor() {
    // Observa o paramMap (e não só o snapshot): navegar para outro deck a
    // partir das sugestões reutiliza este componente na mesma rota.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const deckId = params.get('deckId');
      if (!deckId || deckId === this.deckId()) return;
      this.deckId.set(deckId);
      this.reiniciarSessao();
      this.sugestoes.set([]);
      void this.carregarDeck(deckId);
    });

    // Pré-carrega as imagens dos próximos cards: sem isso, o download só começa
    // quando o card entra na tela e o usuário fica olhando a imagem "pipocar".
    // O card atual já é coberto pelo flashcard-flip (medição de orientação).
    effect(() => this.precarregarImagensProximas(this.cards(), this.indiceAtual()));
  }

  private precarregarImagensProximas(cards: Flashcard[], indice: number): void {
    const alcance = Math.min(JANELA_PRELOAD, Math.max(cards.length - 1, 0));
    for (let passo = 1; passo <= alcance; passo++) {
      const card = cards[(indice + passo) % cards.length];
      for (const url of [card.frente_imagem_url, card.verso_imagem_url]) {
        if (!url || this.imagensPrecarregadas.has(url)) continue;
        this.imagensPrecarregadas.add(url);
        new Image().src = url;
      }
    }
  }

  private async carregarDeck(deckId: string): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    const result = await this.flashcardService.obterDeckComCards(deckId);
    if (result.ok) {
      this.deckTitulo.set(result.data.titulo);
      this.cards.set(result.data.cards);
    } else {
      this.erro.set(result.error);
    }
    this.carregando.set(false);
  }

  protected flip(virado: boolean): void {
    this.virado.set(virado);
  }

  protected responder(estado: EstadoResposta): void {
    const card = this.cardAtual();
    if (!card) return;

    this.respostas.update((prev) => ({ ...prev, [card.id]: estado }));
    if (estado === 'acertou') this.popAcerto.set(true);
    else this.popErro.set(true);

    // A sessão só termina quando TODOS os cards foram respondidos — navegar
    // com "Próximo" pula cards sem respondê-los, então avança para o próximo
    // card sem resposta (com wrap) em vez de finalizar pelo índice.
    const cards = this.cards();
    const respostas = this.respostas();
    if (Object.keys(respostas).length >= cards.length) {
      this.finalizado.set(true);
      void this.carregarSugestoes();
      return;
    }

    for (let passo = 1; passo <= cards.length; passo++) {
      const idx = (this.indiceAtual() + passo) % cards.length;
      if (!respostas[cards[idx].id]) {
        this.indiceAtual.set(idx);
        this.virado.set(false);
        return;
      }
    }
  }

  protected irParaCard(indice: number): void {
    if (indice < 0 || indice >= this.cards().length) return;
    this.indiceAtual.set(indice);
    this.virado.set(false);
  }

  protected embaralhar(): void {
    const copia = [...this.cards()];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    this.cards.set(copia);
    this.reiniciarSessao();
  }

  protected refazer(): void {
    this.reiniciarSessao();
  }

  private reiniciarSessao(): void {
    this.indiceAtual.set(0);
    this.virado.set(false);
    this.finalizado.set(false);
    this.respostas.set({});
  }

  /** Carrega até 3 outros decks (oficiais + comunidade) para sugerir na conclusão. */
  private async carregarSugestoes(): Promise<void> {
    if (this.sugestoes().length > 0) return;

    const [oficiais, feed] = await Promise.all([
      this.flashcardService.listarDecksOficiais(),
      this.flashcardService.carregarFeed('recentes', 0),
    ]);

    const candidatos: DeckCardItem[] = [
      ...(oficiais.ok ? oficiais.data : []),
      ...(feed.ok ? feed.data : []),
    ];

    const vistos = new Set<string>([this.deckId() ?? '']);
    const sugestoes: DeckCardItem[] = [];
    for (const deck of candidatos) {
      if (vistos.has(deck.id) || deck.cards_count === 0) continue;
      vistos.add(deck.id);
      sugestoes.push(deck);
      if (sugestoes.length >= MAX_SUGESTOES) break;
    }
    this.sugestoes.set(sugestoes);
  }

  protected irParaDeck(deckId: string): void {
    void this.router.navigate(['/dashboard/flashcards', deckId, 'estudar']);
  }

  protected async handleToggleLikeSugestao(deckId: string): Promise<void> {
    const result = await this.flashcardService.toggleLike(deckId);
    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }
    this.sugestoes.update((prev) =>
      prev.map((d) =>
        d.id === deckId
          ? { ...d, curtido_por_mim: result.data.curtido, likes_count: result.data.likes_count }
          : d,
      ),
    );
  }

  protected refazerErrados(): void {
    const errados = this.cardsErrados();
    if (errados.length === 0) {
      this.toast.success('Nenhum card errado para refazer!');
      return;
    }
    this.cards.set(errados);
    this.reiniciarSessao();
  }

  protected voltar(): void {
    void this.router.navigate(['/dashboard/flashcards']);
  }
}
