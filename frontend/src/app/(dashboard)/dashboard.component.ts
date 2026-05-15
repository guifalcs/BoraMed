import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookOpen, History, Home, LifeBuoy, LogOut, LucideIconData, Trophy, User } from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { ProfileService } from '../core/services/profile.service';
import { TentativaService } from '../core/services/tentativa.service';

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
  private readonly tentativaService = inject(TentativaService);

  protected readonly logOutIcon = LogOut;
  protected readonly userIcon = User;
  protected readonly profile = this.profileService.profile;
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);

  protected readonly provasRoute = computed<string[]>(() => {
    const t = this.tentativaService.tentativaAtiva();
    if (t && t.status !== 'finalizada' && t.modo !== 'visualizar') {
      return ['/dashboard/simulados', t.prova_id, 'tentativa', t.id];
    }
    return ['/dashboard/simulados'];
  });

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        if (this.auth.user()) {
          void this.profileService.loadProfile();
        }
      });
    }
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
    { label: 'Simulados', icon: BookOpen, route: '/dashboard/simulados' },
    { label: 'Competitivo', icon: Trophy, route: '/dashboard/competitivo' },
    { label: 'Histórico', icon: History, route: '/dashboard/historico' },
    { label: 'Suporte', icon: LifeBuoy, route: '/dashboard/suporte' },
  ];
}
