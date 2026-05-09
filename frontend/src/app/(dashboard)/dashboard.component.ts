import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookOpen, Clock, Home, LifeBuoy, LogOut, LucideIconData, User, Zap } from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { ProfileService } from '../core/services/profile.service';

interface NavItem {
  label: string;
  icon: LucideIconData;
  route: string;
  exact?: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent, UiAvatarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);
  private readonly profileService = inject(ProfileService);

  protected readonly logOutIcon = LogOut;
  protected readonly userIcon = User;
  protected readonly profile = this.profileService.profile;
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);

  constructor() {
    effect(() => {
      if (this.auth.user()) {
        void this.profileService.loadProfile();
      }
    });
  }

  protected toggleMenu(): void {
    this.menuAberto.update(v => !v);
  }

  protected fecharMenu(): void {
    this.menuAberto.set(false);
  }

  protected async handleSignOut(): Promise<void> {
    this.fecharMenu();
    this.toast.success('Sessão encerrada. Até logo!');
    await this.auth.signOut();
  }

  protected readonly navItems: NavItem[] = [
    { label: 'Início', icon: Home, route: '/dashboard', exact: true },
    { label: 'Provas', icon: BookOpen, route: '/dashboard/provas' },
    { label: 'Simulados', icon: Zap, route: '/dashboard/simulado' },
    { label: 'Histórico', icon: Clock, route: '/dashboard/historico' },
    { label: 'Suporte', icon: LifeBuoy, route: '/dashboard/suporte' },
  ];
}
