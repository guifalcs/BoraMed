import { Pipe, PipeTransform, inject } from '@angular/core';
import { ImagemProtegidaService } from '../../core/services/imagem-protegida.service';

/**
 * Troca a URL armazenada de uma imagem de questão por uma URL assinada.
 *
 * Uso no template (o `async` resolve a promessa):
 *   <img [src]="questao().imagem_url | imagemProtegida | async" />
 *
 * Pipe PURO: o Angular só reexecuta `transform` quando a URL de entrada muda,
 * então cada imagem é assinada uma vez por render — sem loop de change detection.
 */
@Pipe({ name: 'imagemProtegida', standalone: true })
export class ImagemProtegidaPipe implements PipeTransform {
  private readonly imagens = inject(ImagemProtegidaService);

  transform(url: string | null | undefined): Promise<string | null> {
    return this.imagens.resolver(url);
  }
}
