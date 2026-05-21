import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-grade-item',
  standalone: true,
  templateUrl: './grade-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradeItemComponent {
  numero = input.required<number>();
  isAtual = input<boolean>(false);
  isMarcada = input<boolean>(false);
  respondida = input<boolean>(false);
  errou = input<boolean>(false);

  navegarPara = output<void>();
}
