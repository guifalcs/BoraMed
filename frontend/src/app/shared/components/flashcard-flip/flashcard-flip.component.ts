import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';

/** Escala o texto conforme o tamanho do conteúdo, para ocupar o máximo do card. */
function classeDeFonte(texto: string, temImagem: boolean): string {
  const len = texto.length;
  let nivel = len <= 80 ? 0 : len <= 200 ? 1 : len <= 500 ? 2 : 3;
  if (temImagem && nivel < 3) nivel++;
  return ['flip-card__texto--xl', 'flip-card__texto--lg', 'flip-card__texto--md', 'flip-card__texto--sm'][nivel];
}

@Component({
  selector: 'app-flashcard-flip',
  standalone: true,
  templateUrl: './flashcard-flip.component.html',
  styleUrl: './flashcard-flip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardFlipComponent {
  frente = input.required<string>();
  verso = input.required<string>();
  frenteImagemUrl = input<string | null>(null);
  versoImagemUrl = input<string | null>(null);
  virado = input(false);

  flipChange = output<boolean>();

  protected readonly frenteFontClass = computed(() => classeDeFonte(this.frente(), !!this.frenteImagemUrl()));
  protected readonly versoFontClass = computed(() => classeDeFonte(this.verso(), !!this.versoImagemUrl()));

  constructor() {
    // Pré-carrega a imagem do verso assim que ela estiver disponível, para evitar flash no flip.
    effect(() => {
      const url = this.versoImagemUrl();
      if (!url) return;
      const img = new Image();
      img.src = url;
    });
  }

  protected toggle(): void {
    this.flipChange.emit(!this.virado());
  }
}
