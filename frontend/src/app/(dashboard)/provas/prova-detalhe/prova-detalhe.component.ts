import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProvaService } from '../../../core/services/prova.service';
import { TentativaService } from '../../../core/services/tentativa.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { PaywallService } from '../../../core/services/paywall.service';
import { FREE_LIMIT_REACHED, TIER_UPGRADE_REQUIRED } from '../../../core/utils/tier-error.util';
import { periodoLabel, type ProvaComFaculdade } from '../../../core/models/prova';
import type { ModoProva, Tentativa } from '../../../core/models/tentativa';
import { ModoSelectorComponent } from '../../../shared/components/modo-selector/modo-selector.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiSpinnerComponent } from '../../../shared/components/ui/spinner/ui-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { LimiteTentativasBannerComponent } from '../../../shared/components/limite-tentativas-banner/limite-tentativas-banner.component';

@Component({
  selector: 'app-prova-detalhe',
  standalone: true,
  imports: [ModoSelectorComponent, UiButtonComponent, UiSpinnerComponent, EmptyStateComponent, PageHeaderComponent, LimiteTentativasBannerComponent],
  templateUrl: './prova-detalhe.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaDetalheComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly provaService = inject(ProvaService);
  private readonly tentativaService = inject(TentativaService);
  private readonly notifications = inject(NotificationService);
  private readonly subscription = inject(SubscriptionService);
  private readonly paywall = inject(PaywallService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados', route: '/dashboard/simulados' },
    { label: 'Detalhes da prova' },
  ];

  protected readonly prova = signal<ProvaComFaculdade | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly modoSelecionado = signal<ModoProva>('simulado');
  protected readonly iniciando = signal(false);
  protected readonly tentativaAtiva = signal<Tentativa | null>(null);

  protected readonly isPersonalizado = computed(() => {
    const p = this.prova();
    return p !== null && p.origem === 'personalizado';
  });

  protected readonly periodoTexto = computed(() => periodoLabel(this.prova()?.periodo));

  protected readonly backRoute = computed(() =>
    this.isPersonalizado() ? '/dashboard/simulados' : '/dashboard/simulados/rede-afya',
  );

  // Contador do plano gratuito. null = nível pago ou ainda desconhecido, e nos
  // dois casos nada de free tier aparece na tela.
  protected readonly tentativasRestantes = signal<number | null>(null);
  protected readonly gratuito = signal(false);

  /** Sem saldo, o botão vira o próprio CTA de assinatura. */
  protected readonly semSaldo = computed(
    () => this.gratuito() && (this.tentativasRestantes() ?? 0) <= 0,
  );

  protected readonly labelIniciar = computed(() => {
    if (this.semSaldo()) return 'Assinar para continuar';
    const restantes = this.tentativasRestantes();
    if (this.gratuito() && restantes !== null) {
      return restantes === 1 ? 'Iniciar (último grátis)' : `Iniciar (${restantes} grátis)`;
    }
    return 'Iniciar prova';
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('provaId') ?? '';
    const modoParam = this.route.snapshot.queryParamMap?.get('modo');

    if (modoParam === 'estudo' || modoParam === 'simulado') {
      this.modoSelecionado.set(modoParam);
    }

    const [provaResult, tentativaResult] = await Promise.all([
      this.provaService.buscarProva(id),
      this.tentativaService.buscarTentativaAtiva(id),
    ]);

    if (provaResult.ok) {
      this.prova.set(provaResult.data);
    } else {
      this.erro.set(provaResult.error);
    }

    if (tentativaResult.ok) {
      this.tentativaAtiva.set(tentativaResult.data);
    }

    const status = await this.subscription.statusAcessoServidor();
    this.gratuito.set(status.nivel === 'gratuito');
    this.tentativasRestantes.set(status.tentativasRestantes);

    this.isLoading.set(false);
  }

  protected onModoChange(modo: ModoProva): void {
    this.modoSelecionado.set(modo);
  }

  protected async iniciar(): Promise<void> {
    const prova = this.prova();
    if (!prova || prova.qtd_questoes === 0) return;

    // Sem saldo o botão nem chega a chamar a RPC: abre direto o upsell, que
    // converte melhor do que deixar o servidor recusar e mostrar um erro.
    if (this.semSaldo()) {
      this.paywall.abrir('limite-tentativas');
      return;
    }

    this.iniciando.set(true);
    const result = await this.tentativaService.iniciar(prova.id, this.modoSelecionado());
    this.iniciando.set(false);

    if (result.ok) {
      this.tentativaService.setProvaNome(prova.nome);
      void this.router.navigate(['/dashboard/simulados', prova.id, 'tentativa', result.data.tentativa.id]);
      return;
    }

    // O contador em cache pode ter ficado para trás (outra aba, outro
    // dispositivo): se o servidor recusar, o paywall é a resposta certa.
    if (result.error === FREE_LIMIT_REACHED) {
      this.tentativasRestantes.set(0);
      this.paywall.abrir('limite-tentativas');
      return;
    }

    if (result.error === TIER_UPGRADE_REQUIRED) {
      this.paywall.abrir('prova-bloqueada');
      return;
    }

    this.notifications.error('Não foi possível iniciar a prova. Tente novamente.');
  }

  protected imprimir(): void {
    const prova = this.prova();
    if (!prova) return;
    void this.router.navigate(['/imprimir/simulado', prova.id]);
  }

  protected async retomar(): Promise<void> {
    const tentativa = this.tentativaAtiva();
    const prova = this.prova();
    if (!tentativa || !prova) return;

    this.iniciando.set(true);
    const result = await this.tentativaService.retomar(tentativa.id);
    this.iniciando.set(false);

    if (result.ok) {
      this.tentativaService.setProvaNome(prova.nome);
      void this.router.navigate(['/dashboard/simulados', prova.id, 'tentativa', tentativa.id]);
    } else {
      this.notifications.error('Não foi possível retomar a prova. Tente novamente.');
    }
  }
}
