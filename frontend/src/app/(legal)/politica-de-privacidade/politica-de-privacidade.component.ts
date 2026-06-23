import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-politica-de-privacidade',
  imports: [RouterLink],
  templateUrl: './politica-de-privacidade.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PoliticaDePrivacidadeComponent {
  private readonly seo = inject(SeoService);
  readonly dataAtualizacao = '11 de junho de 2026';

  constructor() {
    this.seo.update({
      title: 'Política de Privacidade',
      description:
        'Saiba como o BoraMed coleta, usa e protege seus dados pessoais na plataforma de simulados de medicina.',
      path: '/politica-de-privacidade',
    });
  }
}
