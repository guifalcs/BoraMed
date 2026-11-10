import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Layers, LucideIconData, Plus } from 'lucide-angular';
import { FlashcardService } from '../../../core/services/flashcard.service';
import type { FlashcardDeck, OrdenacaoFeedFlashcards } from '../../../core/models/flashcard';
import { DeckCardComponent } from '../../../shared/components/deck-card/deck-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiConfirmDialogComponent } from '../../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import {
  UiSelectComponent,
  type SelectOption,
} from '../../../shared/components/ui/select/ui-select.component';
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
    UiIconComponent,
    SkeletonComponent,
    UiButtonComponent,
    UiConfirmDialogComponent,
    UiSelectComponent,
    DeckLikesModalComponent,
  ],
  templateUrl: './flashcards-home.component.html',
  styleUrl: './flashcards-home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardsHomeComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly flashcardService = inject(FlashcardService);
  private readonly toast = inject(NotificationService);

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
  protected readonly excluindo = signal<string | null>(null);
  protected readonly curtindo = signal<ReadonlySet<string>>(new Set());
  protected readonly erroOficiais = signal<string | null>(null);
  protected readonly erroMeus = signal<string | null>(null);
  protected readonly erroFeed = signal<string | null>(null);
  private ultimaConsultaFeed: { ordenacao: OrdenacaoFeedFlashcards; offset: number } = {
    ordenacao: 'recentes',
    offset: 0,
  };
  protected readonly abas = [
    { id: 'oficiais', titulo: 'Oficiais' },
    { id: 'meus', titulo: 'Meus decks' },
    { id: 'comunidade', titulo: 'Comunidade' },
  ] as const;
  protected readonly lista = computed(() =>
    this.abaAtiva() === 'oficiais'
      ? this.decksOficiais()
      : this.abaAtiva() === 'meus'
        ? this.meusDecks()
        : this.feed(),
  );
  protected readonly carregando = computed(() =>
    this.abaAtiva() === 'oficiais'
      ? this.loadingOficiais()
      : this.abaAtiva() === 'meus'
        ? this.loadingMeus()
        : this.feedLoading(),
  );
  protected readonly erroAtual = computed(() =>
    this.abaAtiva() === 'oficiais'
      ? this.erroOficiais()
      : this.abaAtiva() === 'meus'
        ? this.erroMeus()
        : this.erroFeed(),
  );

  constructor() {
    void this.carregarOficiais();
    void this.carregarMeus();
    void this.carregarFeed('recentes', 0);
  }

  protected mudarAba(aba: FlashcardsAba): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba },
      queryParamsHandling: 'merge',
    });
  }

  protected navegarAbas(ev: KeyboardEvent, indice: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const destino =
      ev.key === 'Home'
        ? 0
        : ev.key === 'End'
          ? 2
          : (indice + (ev.key === 'ArrowRight' ? 1 : 2)) % 3;
    this.mudarAba(this.abas[destino].id);
    document.getElementById(`flashcards-aba-${this.abas[destino].id}`)?.focus();
  }

  protected recarregar(): void {
    if (this.abaAtiva() === 'oficiais') void this.carregarOficiais();
    else if (this.abaAtiva() === 'meus') void this.carregarMeus();
    else void this.carregarFeed(this.ultimaConsultaFeed.ordenacao, this.ultimaConsultaFeed.offset);
  }

  private async carregarFeed(ordenacao: OrdenacaoFeedFlashcards, offset: number): Promise<void> {
    this.ultimaConsultaFeed = { ordenacao, offset };
    this.erroFeed.set(null);
    const result = await this.flashcardService.carregarFeed(ordenacao, offset);
    if (!result.ok) this.erroFeed.set(result.error);
  }

  protected async carregarOficiais(): Promise<void> {
    this.loadingOficiais.set(true);
    this.erroOficiais.set(null);
    const result = await this.flashcardService.listarDecksOficiais();
    if (result.ok) this.decksOficiais.set(result.data);
    else this.erroOficiais.set(result.error);
    this.loadingOficiais.set(false);
  }

  protected async carregarMeus(): Promise<void> {
    this.loadingMeus.set(true);
    this.erroMeus.set(null);
    const result = await this.flashcardService.listarMeusDecks();
    if (result.ok) this.meusDecks.set(result.data);
    else this.erroMeus.set(result.error);
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
    if (!deckId || this.excluindo()) return;
    this.excluindo.set(deckId);
    this.deckParaExcluir.set(null);
    const result = await this.flashcardService.excluirDeck(deckId);
    this.excluindo.set(null);
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
    if (this.feedLoading() || (ordenacao !== 'recentes' && ordenacao !== 'curtidos')) return;
    await this.carregarFeed(ordenacao, 0);
  }

  protected async carregarMaisFeed(): Promise<void> {
    if (this.feedLoading()) return;
    await this.carregarFeed(this.feedOrdenacao(), this.feed().length);
  }

  protected async handleToggleLike(deckId: string): Promise<void> {
    if (this.curtindo().has(deckId)) return;
    if (this.abaAtiva() === 'meus') return this.handleToggleLikeMeus(deckId);
    this.marcarCurtida(deckId, true);
    const result = await this.flashcardService.toggleLike(deckId);
    this.marcarCurtida(deckId, false);
    if (!result.ok) this.toast.error(result.error);
  }

  /** Like em deck da aba "Meus decks": aplica o resultado do RPC na lista local. */
  protected async handleToggleLikeMeus(deckId: string): Promise<void> {
    if (this.curtindo().has(deckId)) return;
    this.marcarCurtida(deckId, true);
    const result = await this.flashcardService.toggleLike(deckId);
    this.marcarCurtida(deckId, false);
    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }
    this.meusDecks.update((prev) =>
      prev.map((d) =>
        d.id === deckId
          ? { ...d, curtido_por_mim: result.data.curtido, likes_count: result.data.likes_count }
          : d,
      ),
    );
  }

  private marcarCurtida(id: string, ativo: boolean): void {
    this.curtindo.update((anterior) => {
      const atual = new Set(anterior);
      if (ativo) atual.add(id);
      else atual.delete(id);
      return atual;
    });
  }
}
