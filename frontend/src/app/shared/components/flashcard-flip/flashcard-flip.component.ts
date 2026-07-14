import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  WritableSignal,
} from '@angular/core';
import { ImageViewerService } from '../../../core/services/image-viewer.service';

/** Escala o texto conforme o tamanho do conteúdo, para ocupar o máximo do card. */
function classeDeFonte(texto: string, temImagem: boolean): string {
  const len = texto.length;
  let nivel = len <= 80 ? 0 : len <= 200 ? 1 : len <= 500 ? 2 : 3;
  // Com imagem, o texto é acessório: nunca domina o card (mínimo md, teto sm).
  if (temImagem) nivel = Math.min(Math.max(nivel + 1, 2), 3);
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

  // Emite se o card tem imagem VERTICAL em qualquer face. É por-card (não por-face)
  // de propósito: assim o pai pode alongar o card sem que ele "pule" ao virar.
  retratoChange = output<boolean>();

  protected readonly frenteFontClass = computed(() => classeDeFonte(this.frente(), !!this.frenteImagemUrl()));
  protected readonly versoFontClass = computed(() => classeDeFonte(this.verso(), !!this.versoImagemUrl()));

  private readonly imageViewer = inject(ImageViewerService);

  // Orientação de cada face (imagem mais alta que larga).
  private readonly frenteRetratoSig = signal(false);
  private readonly versoRetratoSig = signal(false);
  private readonly temImagemRetrato = computed(() => this.frenteRetratoSig() || this.versoRetratoSig());

  constructor() {
    // Mede a orientação (e pré-carrega, evitando flash no flip) de cada lado.
    // Usa new Image() em vez do (load) do <img> visível porque este não dispara
    // para imagens já em cache. Efeitos não rodam no SSR, então é seguro no browser.
    effect(() => this.medirOrientacao(this.frenteImagemUrl(), this.frenteRetratoSig));
    effect(() => this.medirOrientacao(this.versoImagemUrl(), this.versoRetratoSig));
    // Repassa ao pai (deck-execucao) a decisão de altura do card.
    effect(() => this.retratoChange.emit(this.temImagemRetrato()));
  }

  private medirOrientacao(url: string | null, alvo: WritableSignal<boolean>): void {
    if (!url) {
      alvo.set(false);
      return;
    }
    const img = new Image();
    // Fator 1.1: só tratamos como retrato quando é claramente mais alta que larga,
    // evitando alternar o layout em imagens praticamente quadradas.
    img.onload = () => alvo.set(img.naturalHeight > img.naturalWidth * 1.1);
    img.src = url;
  }

  protected toggle(): void {
    this.flipChange.emit(!this.virado());
  }

  protected abrirZoom(url: string, event: Event): void {
    // Impede que o clique no botão de ampliar também vire o card. O overlay é global
    // (montado no shell) para cobrir a viewport inteira, sidebar inclusa.
    event.stopPropagation();
    this.imageViewer.abrir(url);
  }
}
