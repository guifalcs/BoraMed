import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AdminService, AdminStats } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly isLoading = signal(true);

  async ngOnInit(): Promise<void> {
    const result = await this.adminService.getStats();
    if (result.ok) {
      this.stats.set(result.data);
    } else {
      this.toast.error('Erro ao carregar estatísticas.');
    }
    this.isLoading.set(false);
  }
}
