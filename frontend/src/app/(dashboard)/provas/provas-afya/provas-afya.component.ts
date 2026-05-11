import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Award, Stethoscope, FlaskConical, ChevronLeft } from 'lucide-angular';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-provas-afya',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './provas-afya.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasAfyaComponent {
  protected readonly awardIcon = Award;
  protected readonly stethoscopeIcon = Stethoscope;
  protected readonly flaskIcon = FlaskConical;
  protected readonly chevronLeftIcon = ChevronLeft;
}
