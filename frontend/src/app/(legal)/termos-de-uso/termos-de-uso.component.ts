import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-termos-de-uso',
  imports: [RouterLink],
  templateUrl: './termos-de-uso.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermosDeUsoComponent {
  private readonly seo = inject(SeoService);
  readonly dataAtualizacao = '11 de junho de 2026';

  constructor() {
    this.seo.update({
      title: 'Termos de Uso',
      description:
        'Conheça os termos de uso da plataforma BoraMed, de simulados de medicina com questões autorais e independentes.',
      path: '/termos-de-uso',
    });
  }
}
