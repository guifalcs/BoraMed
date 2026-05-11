import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

@Component({
  selector: 'app-em-breve-banner',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './em-breve-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmBreveBannerComponent {
  titulo = input.required<string>();
  descricao = input<string | null>(null);
  icone = input<LucideIconData | null>(null);
}
