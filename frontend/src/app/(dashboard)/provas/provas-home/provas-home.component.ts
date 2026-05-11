import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookOpen, Building2 } from 'lucide-angular';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-provas-home',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './provas-home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasHomeComponent {
  protected readonly bookOpenIcon = BookOpen;
  protected readonly buildingIcon = Building2;
}
