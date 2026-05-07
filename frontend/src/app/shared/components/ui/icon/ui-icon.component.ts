import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

@Component({
  selector: 'app-ui-icon',
  standalone: true,
  imports: [LucideAngularModule],
  template: `<lucide-angular [img]="icon()" [size]="size()" color="currentColor" class="block" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiIconComponent {
  icon = input.required<LucideIconData>();
  size = input<number>(18);
}
