import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookOpen, Clock, LogOut, LucideIconData, Zap } from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { AuthService } from '../core/services/auth.service';

interface NavItem {
  label: string;
  icon: LucideIconData;
  route: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);

  protected readonly logOutIcon = LogOut;

  protected async handleSignOut(): Promise<void> {
    await this.auth.signOut();
  }

  protected readonly navItems: NavItem[] = [
    { label: 'Provas', icon: BookOpen, route: '/dashboard/provas' },
    { label: 'Simulados', icon: Zap, route: '/dashboard/simulado' },
    { label: 'Histórico', icon: Clock, route: '/dashboard/historico' },
  ];
}
