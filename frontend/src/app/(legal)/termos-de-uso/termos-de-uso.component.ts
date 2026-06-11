import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-termos-de-uso',
  imports: [RouterLink],
  templateUrl: './termos-de-uso.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermosDeUsoComponent {
  readonly dataAtualizacao = '11 de junho de 2026';
}
