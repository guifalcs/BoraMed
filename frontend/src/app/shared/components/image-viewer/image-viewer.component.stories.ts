import { Component, inject } from '@angular/core';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { ImageViewerComponent } from './image-viewer.component';
import { ImageViewerService } from '../../../core/services/image-viewer.service';

// Host de demonstração: o visualizador é um overlay global controlado por serviço,
// então a story injeta o serviço e abre uma imagem.
@Component({
  selector: 'app-image-viewer-demo',
  standalone: true,
  imports: [ImageViewerComponent],
  template: `
    <button type="button" (click)="abrir()" style="padding:8px 16px;border-radius:8px">Abrir imagem</button>
    <app-image-viewer />
  `,
})
class ImageViewerDemoComponent {
  private readonly viewer = inject(ImageViewerService);
  protected abrir(): void {
    this.viewer.abrir('https://placehold.co/500x820?text=Imagem+vertical');
  }
  constructor() {
    // Abre já ao carregar a story para o overlay ficar visível no preview.
    this.abrir();
  }
}

const meta: Meta<ImageViewerDemoComponent> = {
  title: 'Shared/ImageViewer',
  component: ImageViewerDemoComponent,
  decorators: [moduleMetadata({ imports: [ImageViewerDemoComponent] })],
};

export default meta;
type Story = StoryObj<ImageViewerDemoComponent>;

export const Aberto: Story = {};
