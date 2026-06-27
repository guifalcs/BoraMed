import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FileX2, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pdf-viewer" #viewer [class.pdf-viewer--fullscreen]="isFullscreen()">
      @if (signedUrl()) {
        <div class="pdf-toolbar">
          <button
            type="button"
            class="pdf-tool-btn"
            [disabled]="zoom() <= zoomMin"
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
            (click)="zoomOut()"
          >
            <app-ui-icon [icon]="zoomOutIcon" [size]="16" />
          </button>
          <button
            type="button"
            class="pdf-tool-btn pdf-tool-btn--text"
            title="Restaurar zoom (100%)"
            aria-label="Restaurar zoom"
            (click)="zoomReset()"
          >
            {{ zoomPercent() }}%
          </button>
          <button
            type="button"
            class="pdf-tool-btn"
            [disabled]="zoom() >= zoomMax"
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            (click)="zoomIn()"
          >
            <app-ui-icon [icon]="zoomInIcon" [size]="16" />
          </button>

          <span class="pdf-toolbar__sep"></span>

          <button
            type="button"
            class="pdf-tool-btn"
            [title]="isFullscreen() ? 'Sair da tela cheia' : 'Ver em tela cheia'"
            [attr.aria-label]="isFullscreen() ? 'Sair da tela cheia' : 'Ver em tela cheia'"
            (click)="toggleFullscreen()"
          >
            <app-ui-icon [icon]="isFullscreen() ? minimizeIcon : maximizeIcon" [size]="16" />
          </button>
        </div>

        @if (loading()) {
          <div class="pdf-skeleton">
            <div class="pdf-skeleton__bar"></div>
            <div class="pdf-skeleton__bar pdf-skeleton__bar--short"></div>
            <div class="pdf-skeleton__bar"></div>
          </div>
        }
        <div class="pdf-scroll" #scroll [class.pdf-scroll--hidden]="loading()">
          <iframe
            [src]="safeUrl()"
            [style.width.%]="zoom() * 100"
            class="pdf-frame"
            title="Visualizador de PDF"
            (load)="onLoad()"
          ></iframe>
        </div>
      } @else {
        <div class="pdf-empty">
          <app-ui-icon [icon]="fileErrorIcon" [size]="40" class="pdf-empty__icon" />
          <p class="pdf-empty__text">Nenhum arquivo selecionado.</p>
        </div>
      }
    </div>

    <style>
      .pdf-viewer {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 500px;
        background: var(--color-surface-2);
        border-radius: 12px;
        overflow: hidden;
      }

      .pdf-viewer--fullscreen {
        border-radius: 0;
        min-height: 100vh;
      }

      .pdf-toolbar {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 0.125rem;
        padding: 0.25rem;
        border-radius: 10px;
        border: 1px solid var(--color-border);
        background: color-mix(in srgb, var(--color-surface) 88%, transparent);
        backdrop-filter: blur(6px);
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.14);
      }

      .pdf-toolbar__sep {
        width: 1px;
        height: 1.25rem;
        margin: 0 0.125rem;
        background: var(--color-border);
      }

      .pdf-tool-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        height: 2rem;
        padding: 0 0.375rem;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: var(--color-text);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s, color 0.15s;
      }

      .pdf-tool-btn--text {
        font-size: 0.8125rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        min-width: 3rem;
      }

      .pdf-tool-btn:hover:not(:disabled) {
        background: var(--color-surface-2);
        color: var(--color-primary);
      }

      .pdf-tool-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .pdf-scroll {
        position: absolute;
        inset: 0;
        overflow: auto;
      }

      .pdf-scroll--hidden {
        opacity: 0;
        pointer-events: none;
      }

      .pdf-frame {
        display: block;
        height: 100%;
        border: none;
      }

      .pdf-skeleton {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .pdf-skeleton__bar {
        height: 1rem;
        border-radius: 6px;
        background: linear-gradient(90deg, var(--color-border) 25%, var(--color-surface) 50%, var(--color-border) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
      }

      .pdf-skeleton__bar--short {
        width: 60%;
      }

      @keyframes shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .pdf-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 300px;
        gap: 0.75rem;
        color: var(--color-text-muted);
      }

      .pdf-empty__text {
        font-size: 0.875rem;
      }
    </style>
  `,
})
export class PdfViewerComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly viewer = viewChild.required<ElementRef<HTMLDivElement>>('viewer');
  private readonly scrollEl = viewChild<ElementRef<HTMLDivElement>>('scroll');

  signedUrl = input<string | null>(null);

  protected readonly loading = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly zoom = signal(1);

  protected readonly zoomMin = ZOOM_MIN;
  protected readonly zoomMax = ZOOM_MAX;

  protected readonly fileErrorIcon = FileX2;
  protected readonly maximizeIcon = Maximize2;
  protected readonly minimizeIcon = Minimize2;
  protected readonly zoomInIcon = ZoomIn;
  protected readonly zoomOutIcon = ZoomOut;

  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  protected readonly safeUrl = computed(() => {
    const url = this.signedUrl();
    if (!url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url + '#toolbar=0&navpanes=0&view=FitH');
  });

  constructor() {
    effect(() => {
      // Reseta loading e zoom sempre que troca de arquivo.
      const url = this.signedUrl();
      this.loading.set(!!url);
      this.zoom.set(1);
    }, { allowSignalWrites: true });
  }

  protected onLoad(): void {
    this.loading.set(false);
    this.centerScroll();
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
    this.centerScroll();
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
    this.centerScroll();
  }

  protected zoomReset(): void {
    this.zoom.set(1);
    this.centerScroll();
  }

  /**
   * Centraliza a posição do scroll horizontal. Com `justify-content: safe center`
   * o conteúdo que transborda é alinhado à esquerda (para não cortar nada); aqui
   * reposicionamos o scroll no centro para a visão inicial ficar no meio da página.
   * Aguarda dois frames para o reflow do iframe (mudança de largura) concluir.
   */
  private centerScroll(): void {
    const el = this.scrollEl()?.nativeElement;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      });
    });
  }

  protected async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await this.viewer().nativeElement.requestFullscreen();
    }
  }

  @HostListener('document:fullscreenchange')
  protected onFullscreenChange(): void {
    this.isFullscreen.set(!!document.fullscreenElement);
  }

  @HostListener('document:keydown.escape')
  protected async onEscape(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }
}
