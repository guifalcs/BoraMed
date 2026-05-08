import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _notifications = signal<Notification[]>([]);
  readonly notifications = this._notifications.asReadonly();

  success(message: string): void {
    this.add('success', message);
  }

  warning(message: string): void {
    this.add('warning', message);
  }

  error(message: string): void {
    this.add('error', message);
  }

  dismiss(id: string): void {
    this._notifications.update((ns) => ns.filter((n) => n.id !== id));
  }

  private add(type: NotificationType, message: string): void {
    const id = crypto.randomUUID();
    this._notifications.update((ns) => [...ns, { id, type, message }]);
    setTimeout(() => this.dismiss(id), 4500);
  }
}
