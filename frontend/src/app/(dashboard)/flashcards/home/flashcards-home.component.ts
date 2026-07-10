import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Layers, LucideIconData, Plus } from 'lucide-angular';
import { FlashcardService } from '../../../core/services/flashcard.service';
import type { FlashcardDeck, OrdenacaoFeedFlashcards } from '../../../core/models/flashcard';
import { DeckCardComponent } from '../../../shared/components/deck-card/deck-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiConfirmDialogComponent } from '../../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiSelectComponent, type SelectOption } from '../../../shared/components/ui/select/ui-select.component';
import { NotificationService } from '../../../core/services/notification.service';
import { DeckLikesModalComponent } from '../deck-likes-modal/deck-likes-modal.component';

export type FlashcardsAba = 'oficiais' | 'meus' | 'comunidade';

const ABAS_VALIDAS: FlashcardsAba[] = ['oficiais', 'meus', 'comunidade'];

const ORDENACAO_OPTIONS: SelectOption<OrdenacaoFeedFlashcards>[] = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'curtidos', label: 'Mais curtidos' },
];

@Component({
  selector: 'app-flashcards-home',
  standalone: true,
  imports: [
    DeckCardComponent,
    EmptyStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    UiButtonComponent,
    UiConfirmDialogComponent,
    UiSelectComponent,
    DeckLikesModalComponent,
  ],
  templateUrl: './flashcards-home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardsHomeComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly flashcardService = inject(FlashcardService);
  private readonly toast = inject(NotificationService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Flashcards' },
  ];

  protected readonly layersIcon: LucideIconData = Layers;
  protected readonly plusIcon: LucideIconData = Plus;
  protected readonly ordenacaoOptions = ORDENACAO_OPTIONS;

  private readonly _queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly abaAtiva = computed<FlashcardsAba>(() => {
    const aba = this._queryParamMap().get('aba');
    return ABAS_VALIDAS.includes(aba as FlashcardsAba) ? (aba as FlashcardsAba) : 'oficiais';
  });

  protected readonly decksOficiais = signal<FlashcardDeck[]>([]);
  protected readonly meusDecks = signal<FlashcardDeck[]>([]);
  protected readonly loadingOficiais = signal(true);
  protected readonly loadingMeus = signal(true);

  protected readonly feed = this.flashcardService.feed;
  protected readonly feedLoading = this.flashcardService.feedLoading;
  protected readonly feedTemMais = this.flashcardService.feedTemMais;
  protected readonly feedOrdenacao = this.flashcardService.feedOrdenacao;

  protected readonly deckParaExcluir = signal<string | null>(null);
  protected readonly deckParaVerCurtidas = signal<string | null>(null);

  constructor() {
    void this.carregarOficiais();
    void this.carregarMeus();
    void this.flashcardService.carregarFeed('recentes', 0);
  }

  protected mudarAba(aba: FlashcardsAba): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba },
      queryParamsHandling: 'merge',
    });
  }

  protected async carregarOficiais(): Promise<void> {
    this.loadingOficiais.set(true);
    const result = await this.flashcardService.listarDecksOficiais();
    if (result.ok) this.decksOficiais.set(result.data);
    else this.toast.error(result.error);
    this.loadingOficiais.set(false);
  }

  protected async carregarMeus(): Promise<void> {
    this.loadingMeus.set(true);
    const result = await this.flashcardService.listarMeusDecks();
    if (result.ok) this.meusDecks.set(result.data);
    else this.toast.error(result.error);
    this.loadingMeus.set(false);
  }

  protected irParaEstudar(deckId: string): void {
    void this.router.navigate(['/dashboard/flashcards', deckId, 'estudar']);
  }

  protected irParaEditar(deckId: string): void {
    void this.router.navigate(['/dashboard/flashcards', deckId, 'editar']);
  }

  protected irParaNovo(): void {
    void this.router.navigate(['/dashboard/flashcards/novo']);
  }

  protected pedirExclusao(deckId: string): void {
    this.deckParaExcluir.set(deckId);
  }

  protected cancelarExclusao(): void {
    this.deckParaExcluir.set(null);
  }

  protected async confirmarExclusao(): Promise<void> {
    const deckId = this.deckParaExcluir();
    if (!deckId) return;
    const result = await this.flashcardService.excluirDeck(deckId);
    this.deckParaExcluir.set(null);
    if (result.ok) {
      this.toast.success('Deck excluído.');
      await this.carregarMeus();
    } else {
      this.toast.error(result.error);
    }
  }

  protected abrirVerCurtidas(deckId: string): void {
    this.deckParaVerCurtidas.set(deckId);
  }

  protected fecharVerCurtidas(): void {
    this.deckParaVerCurtidas.set(null);
  }

  protected async mudarOrdenacaoFeed(ordenacao: string | number | null): Promise<void> {
    await this.flashcardService.carregarFeed(ordenacao as OrdenacaoFeedFlashcards, 0);
  }

  protected async carregarMaisFeed(): Promise<void> {
    await this.flashcardService.carregarFeed(this.feedOrdenacao(), this.feed().length);
  }

  protected async handleToggleLike(deckId: string): Promise<void> {
    const result = await this.flashcardService.toggleLike(deckId);
    if (!result.ok) this.toast.error(result.error);
  }
}
