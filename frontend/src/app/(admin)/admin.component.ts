import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  Bell,
  BookOpen,
  DollarSign,
  FileText,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  Library,
  LucideIconData,
  LogOut,
  Menu,
  Send,
  Settings,
  Sparkles,
  Tag,
  Upload,
  Users,
  X,
} from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { AuthService } from '../core/services/auth.service';
import { ProfileService } from '../core/services/profile.service';
import { NotificationService } from '../core/services/notification.service';
import { SuporteService } from '../core/services/suporte.service';

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
  private readonly suporteService = inject(SuporteService);

  protected readonly profile = this.profileService.profile;
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);
  protected readonly logOutIcon = LogOut;
  protected readonly menuIcon = Menu;
  protected readonly settingsIcon = Settings;
  protected readonly closeIcon = X;

  protected readonly suporteRoute = '/admin/suporte';
  protected readonly suporteBadgeLabel = computed(() => {
    const n = this.suporteService.ticketsAbertosCount();
    return n > 99 ? '99+' : n > 0 ? String(n) : '';
  });

  constructor() {
    afterNextRender(() => { void this.suporteService.carregarContagemTicketsAbertos(); });
  }

  protected readonly navItems: AdminNavItem[] = [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/admin', exact: true },
    { label: 'Usuários', icon: Users, route: '/admin/usuarios' },
    { label: 'Financeiro', icon: DollarSign, route: '/admin/financeiro' },
    { label: 'Questões', icon: FileText, route: '/admin/questoes' },
    { label: 'IA · Aurora', icon: Sparkles, route: '/admin/ia' },
    { label: 'Provas', icon: BookOpen, route: '/admin/provas' },
    { label: 'Disciplinas', icon: GraduationCap, route: '/admin/disciplinas' },
    { label: 'Temas', icon: Tag, route: '/admin/temas' },
    { label: 'Importar', icon: Upload, route: '/admin/importar' },
    { label: 'Avisos', icon: Bell, route: '/admin/avisos' },
    { label: 'Notificações', icon: Send, route: '/admin/notificacoes' },
    { label: 'Suporte', icon: Headphones, route: '/admin/suporte' },
    { label: 'Materiais', icon: Library, route: '/admin/materiais' },
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
