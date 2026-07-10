import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Plus, Trash2, ChevronUp, ChevronDown, LucideIconData } from 'lucide-angular';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { FlashcardCardPayload } from '../../../core/models/flashcard';
import { ImageUploadComponent } from '../../../shared/components/image-upload/image-upload.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiCheckboxComponent } from '../../../shared/components/ui/checkbox/ui-checkbox.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

const MAX_CARDS = 200;
const MIN_CARDS = 1;
const BUCKET = 'flashcard-imagens';

interface CardForm {
  frente: string;
  verso: string;
  frenteImagemUrl: string | null;
  versoImagemUrl: string | null;
}

function cardVazio(): CardForm {
  return { frente: '', verso: '', frenteImagemUrl: null, versoImagemUrl: null };
}

@Component({
  selector: 'app-deck-editor',
  standalone: true,
  imports: [ImageUploadComponent, PageHeaderComponent, UiButtonComponent, UiCheckboxComponent, UiIconComponent],
  templateUrl: './deck-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckEditorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly flashcardService = inject(FlashcardService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);

  protected readonly bucket = BUCKET;
  protected readonly plusIcon: LucideIconData = Plus;
  protected readonly trashIcon: LucideIconData = Trash2;
  protected readonly upIcon: LucideIconData = ChevronUp;
  protected readonly downIcon: LucideIconData = ChevronDown;

  protected readonly deckId = signal<string | null>(null);
  protected readonly modoEdicao = signal(false);
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);

  protected readonly titulo = signal('');
  protected readonly descricao = signal('');
  protected readonly publico = signal(false);
  protected readonly cards = signal<CardForm[]>([cardVazio()]);
  protected readonly erro = signal<string | null>(null);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Flashcards', route: '/dashboard/flashcards' },
    { label: 'Editor' },
  ];

  protected get pathPrefix(): string {
    const userId = this.auth.user()?.id ?? 'anonimo';
    return `user/${userId}`;
  }

  constructor() {
    const deckId = this.route.snapshot.paramMap.get('deckId');
    if (deckId) {
      this.deckId.set(deckId);
      this.modoEdicao.set(true);
      void this.carregarDeck(deckId);
    }
  }

  private async carregarDeck(deckId: string): Promise<void> {
    this.carregando.set(true);
    const result = await this.flashcardService.obterDeckComCards(deckId);
    if (result.ok) {
      this.titulo.set(result.data.titulo);
      this.descricao.set(result.data.descricao ?? '');
      this.publico.set(result.data.publico);
      this.cards.set(
        result.data.cards.length > 0
          ? result.data.cards.map((c) => ({
              frente: c.frente,
              verso: c.verso,
              frenteImagemUrl: c.frente_imagem_url,
              versoImagemUrl: c.verso_imagem_url,
            }))
          : [cardVazio()],
      );
    } else {
      this.toast.error(result.error);
    }
    this.carregando.set(false);
  }

  protected adicionarCard(): void {
    if (this.cards().length >= MAX_CARDS) {
      this.toast.error(`Máximo de ${MAX_CARDS} cards por deck.`);
      return;
    }
    this.cards.update((prev) => [...prev, cardVazio()]);
  }

  protected removerCard(index: number): void {
    if (this.cards().length <= MIN_CARDS) {
      this.toast.error('O deck precisa ter ao menos 1 card.');
      return;
    }
    this.cards.update((prev) => prev.filter((_, i) => i !== index));
  }

  protected moverCard(index: number, direcao: -1 | 1): void {
    const destino = index + direcao;
    const atual = this.cards();
    if (destino < 0 || destino >= atual.length) return;
    const copia = [...atual];
    [copia[index], copia[destino]] = [copia[destino], copia[index]];
    this.cards.set(copia);
  }

  protected atualizarCard(index: number, campo: keyof CardForm, valor: string | null): void {
    this.cards.update((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [campo]: valor } : c)),
    );
  }

  protected async salvar(): Promise<void> {
    this.erro.set(null);

    const titulo = this.titulo().trim();
    if (titulo.length < 3 || titulo.length > 120) {
      this.erro.set('O título deve ter entre 3 e 120 caracteres.');
      return;
    }

    const cardsValidos = this.cards().filter((c) => c.frente.trim() && c.verso.trim());
    if (cardsValidos.length < MIN_CARDS) {
      this.erro.set('Adicione ao menos 1 card com frente e verso preenchidos.');
      return;
    }
    if (cardsValidos.length > MAX_CARDS) {
      this.erro.set(`O deck pode ter no máximo ${MAX_CARDS} cards.`);
      return;
    }

    const cardsPayload: FlashcardCardPayload[] = cardsValidos.map((c) => ({
      frente: c.frente.trim(),
      verso: c.verso.trim(),
      frente_imagem_url: c.frenteImagemUrl,
      verso_imagem_url: c.versoImagemUrl,
    }));

    this.salvando.set(true);

    const payload = {
      titulo,
      descricao: this.descricao().trim() || null,
      publico: this.publico(),
      cards: cardsPayload,
    };

    const result = this.modoEdicao()
      ? await this.flashcardService.atualizarDeck({ ...payload, deckId: this.deckId()! })
      : await this.flashcardService.criarDeck(payload);

    this.salvando.set(false);

    if (result.ok) {
      this.toast.success(this.modoEdicao() ? 'Deck atualizado.' : 'Deck criado.');
      void this.router.navigate(['/dashboard/flashcards'], { queryParams: { aba: 'meus' } });
    } else {
      this.toast.error(result.error);
    }
  }

  protected cancelar(): void {
    void this.router.navigate(['/dashboard/flashcards'], { queryParams: { aba: 'meus' } });
  }
}
