import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';

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
