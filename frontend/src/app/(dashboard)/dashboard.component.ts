import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BookOpen, CreditCard, History, Home, Layers, Library, LogOut, LucideIconData, MessageCircle, Settings, Trophy, User } from 'lucide-angular';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiAvatarComponent } from '../shared/components/ui/avatar/ui-avatar.component';
import { OnboardingTourComponent } from '../shared/components/onboarding-tour/onboarding-tour.component';
import { ImpersonationBannerComponent } from '../shared/components/impersonation-banner/impersonation-banner.component';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { ProfileService } from '../core/services/profile.service';
import { SubscriptionService } from '../core/services/subscription.service';
import { TentativaService } from '../core/services/tentativa.service';
import { OnboardingService } from '../core/services/onboarding.service';
import { AvisoService } from '../core/services/aviso.service';
import { AppNotificacaoService } from '../core/services/app-notification.service';
import { AvisoModalComponent } from '../shared/components/aviso-modal/aviso-modal.component';
import { NotificacoesSinoComponent } from '../shared/components/notificacoes-sino/notificacoes-sino.component';
import { SuporteWidgetComponent } from '../shared/components/suporte-widget/suporte-widget.component';
import { ImageViewerComponent } from '../shared/components/image-viewer/image-viewer.component';
import { FocoModoService } from '../core/services/foco-modo.service';
import { PaywallService } from '../core/services/paywall.service';
import { PaywallModalComponent } from '../shared/components/paywall-modal/paywall-modal.component';
import { UpgradeBadgeComponent } from '../shared/components/upgrade-badge/upgrade-badge.component';
import { UpgradeCardComponent } from '../shared/components/upgrade-card/upgrade-card.component';
import type { PaywallContexto } from '../core/models/paywall.types';
import type { NivelAcesso } from '../core/models/subscription.types';

interface NavItem {
  label: string;
  icon: LucideIconData;
  route: string;
  exact?: boolean;
  onboardingTarget?: string;
  /** Exclusivo do plano Avançado: nos demais níveis aparece bloqueado. */
  requerAvancado?: boolean;
  /** Contexto usado pelo paywall quando o item está bloqueado. */
  paywall?: PaywallContexto;
}

/** NavItem já resolvido contra o nível de acesso do usuário. */
interface NavItemEstado extends NavItem {
  bloqueado: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent, UiAvatarComponent, OnboardingTourComponent, ImpersonationBannerComponent, AvisoModalComponent, NotificacoesSinoComponent, SuporteWidgetComponent, ImageViewerComponent, PaywallModalComponent, UpgradeBadgeComponent, UpgradeCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NotificationService);
  private readonly profileService = inject(ProfileService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly tentativaService = inject(TentativaService);
  private readonly router = inject(Router);
  protected readonly onboarding = inject(OnboardingService);
  private readonly avisoService = inject(AvisoService);
  private readonly notifService = inject(AppNotificacaoService);
  protected readonly focoMode = inject(FocoModoService);
  private readonly paywall = inject(PaywallService);

  protected readonly logOutIcon = LogOut;
  protected readonly historyIcon = History;
  protected readonly userIcon = User;
  protected readonly settingsIcon = Settings;
  protected readonly creditCardIcon = CreditCard;
  protected readonly communityIcon = MessageCircle;
  protected readonly WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/JriNxPNzlmp3JJLTrL9rFi';
  protected readonly isAdmin = computed(() => {
    const papel = this.profileService.profile()?.papel;
    return papel === 'admin' || papel === 'super_admin';
  });
  protected readonly roleLabel = computed(() => {
    const papel = this.profileService.profile()?.papel;
    if (papel === 'super_admin') return 'Super Admin';
    if (papel === 'admin') return 'Admin';
    return 'Aluno';
  });
  protected readonly profile = this.profileService.profile;
  protected readonly primeiroNome = computed(() => {
    const nome = this.profileService.profile()?.nome_completo?.trim();
    if (nome) return nome.split(/\s+/)[0];
    return this.auth.user()?.email ?? '';
  });
  protected readonly user = this.auth.user;
  protected readonly menuAberto = signal(false);
  protected readonly impersonando = this.auth.impersonando;

  // Nível buscado sob demanda (RPC cacheada em SubscriptionService), nunca no
  // boot bloqueante — enquanto desconhecido (null), nada aparece bloqueado,
  // para o assinante não ver um flash de cadeado. O acesso real continua
  // protegido pelo tierAvancadoGuard nas rotas e pelos gates das RPCs.
  private readonly nivel = signal<NivelAcesso | null>(null);

  protected readonly statusAcesso = this.subscriptionService.statusAcesso;

  /**
   * Itens de menu já resolvidos contra o nível. Recursos do plano Avançado
   * passam a aparecer BLOQUEADOS em vez de sumirem: esconder o recurso esconde
   * junto o motivo para assinar.
   */
  protected readonly navItens = computed<NavItemEstado[]>(() => {
    const nivel = this.nivel();
    const bloqueiaAvancado = nivel !== null && nivel !== 'avancado';
    return this.navItems.map((item) => ({
      ...item,
      bloqueado: item.requerAvancado === true && bloqueiaAvancado,
    }));
  });

  /** Só o plano gratuito tem contador de tentativas para exibir. */
  protected readonly mostrarUpgradeCard = computed(() => {
    const nivel = this.nivel();
    return nivel === 'gratuito' || nivel === 'essencial';
  });

  protected readonly upgradeCardTexto = computed(() =>
    this.nivel() === 'gratuito'
      ? { titulo: 'Desbloqueie tudo', descricao: 'Simulados sem limite, materiais e flashcards.' }
      : { titulo: 'Vá para o Avançado', descricao: 'Materiais, flashcards e simulados por tema.' },
  );

  protected readonly provasRoute = computed<string[]>(() => {
    const t = this.tentativaService.tentativaAtiva();
    if (t && t.status !== 'finalizada' && t.modo !== 'visualizar') {
      return ['/dashboard/simulados', t.prova_id ?? 'removida', 'tentativa', t.id];
    }
    return ['/dashboard/simulados'];
  });

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        if (this.auth.user() && !this.auth.impersonando()) {
          void this.profileService.loadProfile();
          void this.onboarding.load();
          void this.tentativaService.hidratarTentativaAtiva();
          void this.avisoService.verificarAvisos();
          void this.notifService.carregar();
          void this.subscriptionService.statusAcessoServidor().then((s) => this.nivel.set(s.nivel));
        } else if (this.auth.user() && this.auth.impersonando()) {
          void this.profileService.loadProfile();
          void this.tentativaService.hidratarTentativaAtiva();
          void this.subscriptionService.statusAcessoServidor().then((s) => this.nivel.set(s.nivel));
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
    { label: 'Materiais', icon: Library, route: '/dashboard/materiais', requerAvancado: true, paywall: 'materiais' },
    { label: 'Flashcards', icon: Layers, route: '/dashboard/flashcards', requerAvancado: true, paywall: 'flashcards' },
    { label: 'Competitivo', icon: Trophy, route: '/dashboard/competitivo', onboardingTarget: 'nav-competitivo' },
    { label: 'Histórico', icon: History, route: '/dashboard/historico', onboardingTarget: 'nav-historico' },
  ];

  // No mobile o Histórico fica no menu do perfil — a barra inferior não
  // comporta todos os módulos em telas estreitas (ex.: iPhone 15).
  // Início troca de posição com Materiais para ficar no centro da barra.
  //
  // Derivado de `navItens` (e não do array cru) porque antes era uma lista
  // estática: o filtro de tier valia só para a sidebar e a barra inferior
  // seguia mostrando os itens pagos como se estivessem liberados.
  protected readonly bottomNavItens = computed<NavItemEstado[]>(() => {
    const itens = this.navItens().filter((item) => item.route !== '/dashboard/historico');
    const inicio = itens.findIndex((item) => item.route === '/dashboard');
    const materiais = itens.findIndex((item) => item.route === '/dashboard/materiais');
    if (inicio !== -1 && materiais !== -1) {
      [itens[inicio], itens[materiais]] = [itens[materiais], itens[inicio]];
    }
    return itens;
  });

  /** Abre o upsell no contexto do item bloqueado que o usuário tocou. */
  protected abrirPaywall(item: NavItemEstado): void {
    this.fecharMenu();
    this.paywall.abrir(item.paywall ?? 'recurso-pago');
  }
}
