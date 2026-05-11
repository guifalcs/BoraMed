import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookOpen, Zap, ChevronLeft } from 'lucide-angular';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-provas-nacional',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './provas-nacional.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasNacionalComponent {
  protected readonly bookOpenIcon = BookOpen;
  protected readonly zapIcon = Zap;
  protected readonly chevronLeftIcon = ChevronLeft;
}
