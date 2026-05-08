import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AlertTriangle, CheckCircle, LucideIconData, X, XCircle } from 'lucide-angular';
import type { NotificationType } from '../../../../core/services/notification.service';
import { UiIconComponent } from '../icon/ui-icon.component';

@Component({
  selector: 'app-ui-toast',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './ui-toast.component.html',
  styleUrl: './ui-toast.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiToastComponent {
  type = input.required<NotificationType>();
  message = input.required<string>();

  dismiss = output<void>();

  protected readonly xIcon: LucideIconData = X;

  protected readonly icon = computed<LucideIconData>(() => {
    const map: Record<NotificationType, LucideIconData> = {
      success: CheckCircle,
      warning: AlertTriangle,
      error: XCircle,
    };
    return map[this.type()];
  });
}
