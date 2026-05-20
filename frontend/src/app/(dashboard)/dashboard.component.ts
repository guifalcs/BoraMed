import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookOpen, History, Home, LifeBuoy, LogOut, LucideIconData, Settings, Trophy, User } from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { OnboardingTourComponent } from '../shared/components/onboarding-tour/onboarding-tour.component';
import { ImpersonationBannerComponent } from '../shared/components/impersonation-banner/impersonation-banner.component';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { ProfileService } from '../core/services/profile.service';
import { TentativaService } from '../core/services/tentativa.service';
import { OnboardingService } from '../core/services/onboarding.service';

interface NavItem {
  label: string;
  icon: LucideIconData;
  route: string;
  exact?: boolean;
  onboardingTarget?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent, UiAvatarComponent, OnboardingTourComponent, ImpersonationBannerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);
  private readonly profileService = inject(ProfileService);
  private readonly tentativaService = inject(TentativaService);
  private readonly router = inject(Router);
  protected readonly onboarding = inject(OnboardingService);

  protected readonly logOutIcon = LogOut;
  protected readonly userIcon = User;
  protected readonly lifeBuoyIcon = LifeBuoy;
  protected readonly settingsIcon = Settings;
  protected readonly isAdmin = computed(() => this.profileService.profile()?.papel === 'admin');
  protected readonly profile = this.profileService.profile;
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);
  protected readonly impersonando = this.auth.impersonando;

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
          void this.onboarding.load();
          void this.tentativaService.hidratarTentativaAtiva();
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

  protected async handleVoltarParaAdmin(): Promise<void> {
    await this.auth.voltarParaAdmin();
  }

  protected async handleSignOut(): Promise<void> {
    this.fecharMenu();
    this.toast.success('Sessão encerrada. Até logo!');
    await this.auth.signOut();
  }

  protected async handleOnboardingNext(): Promise<void> {
    await this.onboarding.next();
  }

  protected async handleOnboardingBack(): Promise<void> {
    await this.onboarding.previous();
  }

  protected async handleOnboardingSkip(): Promise<void> {
    await this.onboarding.skip();
  }

  protected async handleOnboardingComplete(): Promise<void> {
    const route = this.onboarding.activeStep()?.route;
    await this.onboarding.complete();
    if (route) {
      await this.router.navigateByUrl(route);
    }
  }

  protected readonly navItems: NavItem[] = [
    { label: 'Início', icon: Home, route: '/dashboard', exact: true },
    { label: 'Simulados', icon: BookOpen, route: '/dashboard/simulados', onboardingTarget: 'nav-simulados' },
    { label: 'Competitivo', icon: Trophy, route: '/dashboard/competitivo', onboardingTarget: 'nav-competitivo' },
    { label: 'Histórico', icon: History, route: '/dashboard/historico', onboardingTarget: 'nav-historico' },
  ];
}
