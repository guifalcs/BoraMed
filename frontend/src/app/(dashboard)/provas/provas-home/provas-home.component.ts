import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, BookOpen, ClipboardList, Lock, PlayCircle, Shuffle, Target } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { LimiteTentativasBannerComponent } from '../../../shared/components/limite-tentativas-banner/limite-tentativas-banner.component';
import type { NivelAcesso } from '../../../core/models/subscription.types';

@Component({
  selector: 'app-provas-home',
  standalone: true,
  imports: [RouterLink, UiIconComponent, PageHeaderComponent, LimiteTentativasBannerComponent],
  templateUrl: './provas-home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasHomeComponent implements OnInit {
  private readonly tentativaService = inject(TentativaService);
  private readonly subscription = inject(SubscriptionService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados' },
  ];

  protected readonly bookOpenIcon = BookOpen;
  protected readonly shuffleIcon = Shuffle;
  protected readonly playCircleIcon = PlayCircle;
  protected readonly arrowRightIcon = ArrowRight;
  protected readonly clipboardListIcon = ClipboardList;
  protected readonly targetIcon = Target;
  protected readonly lockIcon = Lock;

  protected readonly tentativaAtiva = this.tentativaService.tentativaAtiva;

  // Sob demanda (RPC cacheada) — define se "Montar simulado" mostra o upsell e
  // se o contador de tentativas gratuitas aparece. null = ainda desconhecido,
  // e nesse estado nada é exibido como bloqueado (evita flash para assinante).
  private readonly nivel = signal<NivelAcesso | null>(null);
  private readonly restantes = signal<number | null>(null);
  private readonly montadoRestantes = signal<number | null>(null);
  private readonly nacRestantes = signal<number | null>(null);

  /**
   * Montar simulado agora é o único recurso que o gratuito tem e o Essencial
   * não: o grátis monta uma vez, o Essencial não monta nunca. Por isso o card
   * bloqueia SÓ o essencial, e não "todo mundo que não é avançado".
   */
  protected readonly bloqueado = computed(() => this.nivel() === 'essencial');

  protected readonly gratuito = computed(() => this.nivel() === 'gratuito');
  protected readonly tentativasRestantes = this.restantes.asReadonly();
  protected readonly nacionalRestantes = this.nacRestantes.asReadonly();

  /** Créditos de simulado montado do gratuito. null = sem teto (quem paga). */
  protected readonly montadoDisponivel = computed(() => this.montadoRestantes());

  /** Gratuito que já gastou a bala de prata: entra na tela, mas já sabe disso. */
  protected readonly montadoEsgotado = computed(
    () => this.gratuito() && this.montadoRestantes() === 0,
  );

  /** Selo do card para o gratuito, com o saldo do balde de montado. */
  protected readonly montadoSelo = computed(() => {
    if (!this.gratuito()) return null;
    const restantes = this.montadoRestantes();
    if (restantes === null) return null;
    return restantes > 0 ? `${restantes} grátis` : 'Sem saldo';
  });

  async ngOnInit(): Promise<void> {
    const status = await this.subscription.statusAcessoServidor();
    this.nivel.set(status.nivel);
    this.restantes.set(status.tentativasRestantes);
    this.montadoRestantes.set(status.montadoRestantes);
    this.nacRestantes.set(status.nacionalRestantes);
  }

  protected readonly montarSimuladoCardClass = computed(() => {
    const base =
      'group flex flex-col items-start gap-4 rounded-xl border border-l-4 bg-[var(--color-surface)] p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:gap-6 sm:p-7 lg:p-9';
    if (this.bloqueado() || this.montadoEsgotado()) {
      return `${base} opacity-70 border-[var(--color-border)] border-l-gray-300 hover:border-l-gray-400 focus-visible:ring-gray-400`;
    }
    return `${base} border-[var(--color-border)] border-l-emerald-500 hover:border-emerald-200 hover:border-l-emerald-500 focus-visible:ring-emerald-500`;
  });

  protected readonly montarSimuladoIconWrapperClass = computed(() => {
    const base = 'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl';
    return this.bloqueado() || this.montadoEsgotado()
      ? `${base} bg-gray-100 text-gray-500`
      : `${base} bg-emerald-50 text-emerald-700`;
  });

  protected readonly rotaTentativaAtiva = computed(() => {
    const tentativa = this.tentativaAtiva();
    if (!tentativa || tentativa.status === 'finalizada' || tentativa.modo === 'visualizar') {
      return ['/dashboard/simulados'];
    }
    return ['/dashboard/simulados', tentativa.prova_id ?? 'removida', 'tentativa', tentativa.id];
  });

  protected readonly resumoTentativaAtiva = computed(() => {
    const tentativa = this.tentativaAtiva();
    if (!tentativa || tentativa.status === 'finalizada' || tentativa.modo === 'visualizar') {
      return null;
    }

    const respondidas = tentativa.total_respondidas;
    const total = tentativa.total_questoes;
    const status = tentativa.status === 'pausada' ? 'pausado' : 'em andamento';
    return `${respondidas} de ${total} questões respondidas · ${status}`;
  });
}
