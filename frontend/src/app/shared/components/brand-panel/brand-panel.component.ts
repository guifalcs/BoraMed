import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-brand-panel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './brand-panel.component.html',
  styleUrls: ['./brand-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandPanelComponent {
  kicker = input.required<string>();
  titulo = input.required<string>();
  descricao = input.required<string>();
  showMetrics = input(false);
}
