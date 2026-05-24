import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  Bell,
  BookOpen,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LucideIconData,
  LogOut,
  Send,
  Settings,
  Tag,
  Upload,
  Users,
} from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { AuthService } from '../core/services/auth.service';
import { ProfileService } from '../core/services/profile.service';
import { NotificationService } from '../core/services/notification.service';

interface AdminNavItem {
  label: string;
  icon: LucideIconData;
  route: string;
  exact?: boolean;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent, UiAvatarComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(NotificationService);

  protected readonly profile = this.profileService.profile;
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);
  protected readonly logOutIcon = LogOut;
  protected readonly settingsIcon = Settings;

  protected readonly navItems: AdminNavItem[] = [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/admin', exact: true },
    { label: 'Usuários', icon: Users, route: '/admin/usuarios' },
    { label: 'Questões', icon: FileText, route: '/admin/questoes' },
    { label: 'Provas', icon: BookOpen, route: '/admin/provas' },
    { label: 'Disciplinas', icon: GraduationCap, route: '/admin/disciplinas' },
    { label: 'Temas', icon: Tag, route: '/admin/temas' },
    { label: 'Importar', icon: Upload, route: '/admin/importar' },
    { label: 'Avisos', icon: Bell, route: '/admin/avisos' },
    { label: 'Notificações', icon: Send, route: '/admin/notificacoes' },
  ];

  protected toggleMenu(): void {
    this.menuAberto.update((v) => !v);
  }

  protected fecharMenu(): void {
    this.menuAberto.set(false);
  }

  protected async handleSignOut(): Promise<void> {
    this.toast.success('Sessão encerrada. Até logo!');
    await this.auth.signOut();
  }
}
