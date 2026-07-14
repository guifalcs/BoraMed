import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ImageViewerService } from '../../../core/services/image-viewer.service';

/**
 * Overlay de imagem em tela cheia. Deve ser montado UMA vez no shell do dashboard,
 * como irmão do <main>, para escapar do stacking context de .main-content
 * (isolation: isolate) e cobrir também a sidebar/nav. Controlado por
 * ImageViewerService.
 */
@Component({
  selector: 'app-image-viewer',
  standalone: true,
  templateUrl: './image-viewer.component.html',
  styleUrl: './image-viewer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageViewerComponent {
  private readonly viewer = inject(ImageViewerService);
  protected readonly url = this.viewer.url;

  protected fechar(event?: Event): void {
    event?.stopPropagation();
    this.viewer.fechar();
  }

  @HostListener('document:keydown.escape')
  protected aoApertarEsc(): void {
    if (this.url()) this.viewer.fechar();
  }
}
