import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, CircleCheck, CircleX, LucideIconData, Shuffle } from 'lucide-angular';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { Flashcard } from '../../../core/models/flashcard';
import { FlashcardFlipComponent } from '../../../shared/components/flashcard-flip/flashcard-flip.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

type EstadoResposta = 'acertou' | 'errou';

@Component({
  selector: 'app-deck-execucao',
  standalone: true,
  imports: [FlashcardFlipComponent, PageHeaderComponent, UiButtonComponent, UiIconComponent],
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

  constructor() {
    const deckId = this.route.snapshot.paramMap.get('deckId');
    if (deckId) {
      this.deckId.set(deckId);
      void this.carregarDeck(deckId);
    }
  }

  private async carregarDeck(deckId: string): Promise<void> {
    this.carregando.set(true);
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

    if (this.indiceAtual() >= this.cards().length - 1) {
      this.finalizado.set(true);
      return;
    }

    this.indiceAtual.update((i) => i + 1);
    this.virado.set(false);
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
    this.indiceAtual.set(0);
    this.virado.set(false);
    this.finalizado.set(false);
    this.respostas.set({});
  }

  protected refazer(): void {
    this.indiceAtual.set(0);
    this.virado.set(false);
    this.finalizado.set(false);
    this.respostas.set({});
  }

  protected refazerErrados(): void {
    const errados = this.cardsErrados();
    if (errados.length === 0) {
      this.toast.success('Nenhum card errado para refazer!');
      return;
    }
    this.cards.set(errados);
    this.indiceAtual.set(0);
    this.virado.set(false);
    this.finalizado.set(false);
    this.respostas.set({});
  }

  protected voltar(): void {
    void this.router.navigate(['/dashboard/flashcards']);
  }
}
