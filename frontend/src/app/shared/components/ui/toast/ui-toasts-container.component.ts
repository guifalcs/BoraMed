import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { UiToastComponent } from './ui-toast.component';

@Component({
  selector: 'app-ui-toasts-container',
  standalone: true,
  imports: [UiToastComponent],
  template: `
    <div class="toasts-container">
      @for (n of notifications(); track n.id) {
        <app-ui-toast
          [type]="n.type"
          [message]="n.message"
          (dismiss)="notificationService.dismiss(n.id)"
        />
      }
    </div>
  `,
  styles: [`
    .toasts-container {
      position: fixed;
      top: 1.25rem;
      right: 1.25rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      pointer-events: none;
    }
    .toasts-container > * {
      pointer-events: all;
    }
    @media (max-width: 640px) {
      .toasts-container {
        top: 0.75rem;
        left: 0.75rem;
        right: 0.75rem;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiToastsContainerComponent {
  protected readonly notificationService = inject(NotificationService);
  protected readonly notifications = this.notificationService.notifications;
}
