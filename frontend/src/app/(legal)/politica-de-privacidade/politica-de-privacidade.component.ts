import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-politica-de-privacidade',
  imports: [RouterLink],
  templateUrl: './politica-de-privacidade.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PoliticaDePrivacidadeComponent {
  readonly dataAtualizacao = '11 de junho de 2026';
}
