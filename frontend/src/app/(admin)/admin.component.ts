import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import {
  Bell,
  BookOpen,
  ChevronDown,
  DollarSign,
  FileText,
  GraduationCap,
  Headphones,
  Layers,
  LayoutDashboard,
  Library,
  LucideIconData,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  Users,
  X,
} from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { ImageViewerComponent } from '../shared/components/image-viewer/image-viewer.component';
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

interface AdminNavGroup {
  label: string;
  icon: LucideIconData;
  children: AdminNavItem[];
}

type AdminNavEntry =
  | ({ kind: 'item' } & AdminNavItem)
  | ({ kind: 'group' } & AdminNavGroup);

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent, UiAvatarComponent, ImageViewerComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(NotificationService);
  private readonly suporteService = inject(SuporteService);
  private readonly router = inject(Router);

  protected readonly profile = this.profileService.profile;
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);
  protected readonly logOutIcon = LogOut;
  protected readonly menuIcon = Menu;
  protected readonly settingsIcon = Settings;
  protected readonly closeIcon = X;
  protected readonly chevronIcon = ChevronDown;

  protected readonly suporteRoute = '/admin/suporte';
  protected readonly suporteBadgeLabel = computed(() => {
    const n = this.suporteService.ticketsAbertosCount();
    return n > 99 ? '99+' : n > 0 ? String(n) : '';
  });

  /** URL atual (reativa) para calcular grupos ativos/expandidos. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Grupos que o usuário abriu/fechou manualmente (sobrepõe o auto-expand). */
  private readonly gruposToggle = signal<Record<string, boolean>>({});

  constructor() {
    afterNextRender(() => { void this.suporteService.carregarContagemTicketsAbertos(); });
  }

  protected readonly navEntries: AdminNavEntry[] = [
    { kind: 'item', label: 'Dashboard', icon: LayoutDashboard, route: '/admin', exact: true },
    {
      kind: 'group',
      label: 'Conteúdo',
      icon: Layers,
      children: [
        { label: 'Questões', icon: FileText, route: '/admin/questoes' },
        { label: 'Provas', icon: BookOpen, route: '/admin/provas' },
        { label: 'Disciplinas', icon: GraduationCap, route: '/admin/disciplinas' },
        { label: 'Temas', icon: Tag, route: '/admin/temas' },
        { label: 'Materiais', icon: Library, route: '/admin/materiais' },
        { label: 'Flashcards', icon: Layers, route: '/admin/flashcards' },
        { label: 'Importar', icon: Upload, route: '/admin/importar' },
      ],
    },
    {
      kind: 'group',
      label: 'Comunicação',
      icon: MessageSquare,
      children: [
        { label: 'Avisos', icon: Bell, route: '/admin/avisos' },
        { label: 'Notificações', icon: Send, route: '/admin/notificacoes' },
        { label: 'Campanhas', icon: Mail, route: '/admin/campanhas' },
        { label: 'Suporte', icon: Headphones, route: '/admin/suporte' },
      ],
    },
    {
      kind: 'group',
      label: 'Gestão',
      icon: ShieldCheck,
      children: [
        { label: 'Usuários', icon: Users, route: '/admin/usuarios' },
        { label: 'Financeiro', icon: DollarSign, route: '/admin/financeiro' },
      ],
    },
    { kind: 'item', label: 'IA · Aurora', icon: Sparkles, route: '/admin/ia' },
  ];

  /** Um grupo está ativo quando a rota atual pertence a algum dos seus filhos. */
  protected grupoTemRotaAtiva(group: AdminNavGroup): boolean {
    const url = this.currentUrl().split(/[?#]/)[0];
    return group.children.some(
      (child) => url === child.route || url.startsWith(child.route + '/'),
    );
  }

  /** Aberto se o usuário abriu manualmente OU se contém a rota ativa. */
  protected grupoAberto(group: AdminNavGroup): boolean {
    const override = this.gruposToggle()[group.label];
    if (override !== undefined) return override;
    return this.grupoTemRotaAtiva(group);
  }

  /** Soma dos badges dos filhos — exibida no header quando o grupo está fechado. */
  protected grupoBadge(group: AdminNavGroup): string {
    if (!group.children.some((c) => c.route === this.suporteRoute)) return '';
    return this.suporteBadgeLabel();
  }

  protected toggleGrupo(group: AdminNavGroup): void {
    const aberto = this.grupoAberto(group);
    this.gruposToggle.update((state) => ({ ...state, [group.label]: !aberto }));
  }

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
