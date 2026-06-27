import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FileX2 } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pdf-viewer">
      @if (signedUrl()) {
        @if (loading()) {
          <div class="pdf-skeleton">
            <div class="pdf-skeleton__bar"></div>
            <div class="pdf-skeleton__bar pdf-skeleton__bar--short"></div>
            <div class="pdf-skeleton__bar"></div>
          </div>
        }
        <iframe
          [src]="safeUrl()"
          [class.pdf-frame--hidden]="loading()"
          class="pdf-frame"
          title="Visualizador de PDF"
          (load)="onLoad()"
        ></iframe>
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

      .pdf-frame {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
      }

      .pdf-frame--hidden {
        opacity: 0;
        position: absolute;
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

  signedUrl = input<string | null>(null);

  protected readonly loading = signal(false);
  protected readonly fileErrorIcon = FileX2;

  protected readonly safeUrl = computed(() => {
    const url = this.signedUrl();
    if (!url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url + '#toolbar=0&navpanes=0&view=FitH');
  });

  constructor() {
    effect(() => {
      const url = this.signedUrl();
      this.loading.set(!!url);
    }, { allowSignalWrites: true });
  }

  protected onLoad(): void {
    this.loading.set(false);
  }
}
