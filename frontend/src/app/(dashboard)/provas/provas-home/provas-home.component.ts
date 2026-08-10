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

  /** Montar simulado é exclusivo do Avançado: bloqueia gratuito e essencial. */
  protected readonly bloqueado = computed(() => {
    const nivel = this.nivel();
    return nivel !== null && nivel !== 'avancado';
  });

  protected readonly gratuito = computed(() => this.nivel() === 'gratuito');
  protected readonly tentativasRestantes = this.restantes.asReadonly();

  async ngOnInit(): Promise<void> {
    const status = await this.subscription.statusAcessoServidor();
    this.nivel.set(status.nivel);
    this.restantes.set(status.tentativasRestantes);
  }

  protected readonly montarSimuladoCardClass = computed(() => {
    const base =
      'group flex items-center gap-6 rounded-xl border border-l-4 bg-[var(--color-surface)] p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:p-9';
    if (this.bloqueado()) {
      return `${base} opacity-70 border-[var(--color-border)] border-l-gray-300 hover:border-l-gray-400 focus-visible:ring-gray-400`;
    }
    return `${base} border-[var(--color-border)] border-l-emerald-500 hover:border-emerald-200 hover:border-l-emerald-500 focus-visible:ring-emerald-500`;
  });

  protected readonly montarSimuladoIconWrapperClass = computed(() => {
    const base = 'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl';
    return this.bloqueado() ? `${base} bg-gray-100 text-gray-500` : `${base} bg-emerald-50 text-emerald-700`;
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
