import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  RESPONSE_INIT,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BadgeCheck, Bell, Calculator, Dumbbell, ListChecks, Lock, Users } from 'lucide-angular';
import { GabaritoProvaService } from '../../core/services/gabarito-prova.service';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/seo/seo.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { GabaritosTopoComponent } from './gabaritos-topo.component';
import { GabaritosAvisoComponent } from './gabaritos-aviso.component';
import { nomeGabarito } from '../../core/utils/gabarito-prova.util';
import { salvarDestinoPosLogin } from '../../core/utils/destino-pos-login.util';
import type { GabaritoProvaVitrine } from '../../core/models/gabarito-prova';

/** Quantas casas a grade borrada mostra; o resto vira "+N". */
const MAX_CASAS = 40;

/**
 * Página pública de um gabarito (/gabaritos/:slug): o link que circula nos
 * grupos. Ver as respostas exige conta, então quem chega sem login cai aqui:
 * vê a prova, quantas questões, quantos já conferiram, e um cartão com as
 * respostas borradas e o convite para criar conta ou entrar.
 *
 * As letras borradas são de mentira (sequência fixa): as respostas reais nem
 * chegam ao navegador, porque a RPC completa não executa para anon. Logado,
 * a página leva direto para o gabarito dentro do app.
 */
@Component({
  selector: 'app-gabarito-vitrine',
  standalone: true,
  imports: [RouterLink, UiIconComponent, GabaritosTopoComponent, GabaritosAvisoComponent],
  templateUrl: './gabarito-vitrine.component.html',
  styleUrls: ['./gabaritos.css', './gabarito-vitrine.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GabaritoVitrineComponent {
  private readonly service = inject(GabaritoProvaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });

  protected readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  /** Onde o aluno vê o gabarito de verdade, depois de entrar. */
  protected readonly destino = `/dashboard/gabaritos/${this.slug}`;

  protected readonly vitrine = signal<GabaritoProvaVitrine | null>(null);
  protected readonly carregando = signal(true);
  protected readonly naoEncontrado = signal(false);

  protected readonly nome = computed(() => {
    const v = this.vitrine();
    return v ? nomeGabarito(v) : '';
  });

  /** Grade borrada: números reais, letras de mentira. */
  protected readonly casas = computed(() => {
    const v = this.vitrine();
    if (!v) return [];
    const letras = 'ABCDE'.slice(0, v.qtd_alternativas);
    return Array.from({ length: Math.min(v.total_questoes, MAX_CASAS) }, (_, i) => ({
      numero: i + 1,
      letra: letras[(i * 7 + 3) % letras.length],
    }));
  });
  protected readonly casasOcultas = computed(() => Math.max(0, (this.vitrine()?.total_questoes ?? 0) - MAX_CASAS));

  protected readonly publicadoHa = computed(() => {
    const iso = this.vitrine()?.publicado_em;
    if (!iso) return '';
    const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `há ${d} dias`;
  });

  protected readonly iconLock = Lock;
  protected readonly iconCheck = BadgeCheck;
  protected readonly iconRespostas = ListChecks;
  protected readonly iconNota = Calculator;
  protected readonly iconAviso = Bell;
  protected readonly iconTreino = Dumbbell;
  protected readonly iconPessoas = Users;

  constructor() {
    void this.carregar();
    // Já tem conta e está logado: nada a convidar, vai direto ao gabarito.
    effect(() => {
      if (this.isBrowser && this.auth.user()) {
        void this.router.navigateByUrl(this.destino, { replaceUrl: true });
      }
    });
  }

  private async carregar(): Promise<void> {
    const r = await this.service.obterVitrine(this.slug);
    this.carregando.set(false);
    if (!r.ok || !r.data) {
      this.naoEncontrado.set(true);
      if (r.ok && this.responseInit) this.responseInit.status = 404;
      this.seo.update({
        title: 'Gabarito não encontrado',
        description: 'Este gabarito não existe ou saiu do ar.',
        path: `/gabaritos/${this.slug}`,
        noIndex: true,
      });
      return;
    }
    this.vitrine.set(r.data);
    void this.service.registrarVisualizacao(this.slug);
    const nome = nomeGabarito(r.data);
    this.seo.update({
      title: `Gabarito ${nome} ${r.data.semestre} (extraoficial)`,
      description: `Saiu o gabarito extraoficial da ${nome}, ${r.data.semestre}: ${r.data.total_questoes} questões. Entre na sua conta BoraMed para ver as respostas e calcular sua nota.`,
      path: `/gabaritos/${r.data.slug}`,
    });
  }

  /**
   * Guarda o destino antes de ir para cadastro/login: a confirmação de e-mail
   * sempre leva ao /dashboard, e o shell usa isto para abrir o gabarito.
   */
  protected lembrarDestino(): void {
    if (this.isBrowser) salvarDestinoPosLogin(this.destino);
  }

  protected numero(n: number): string {
    return n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(n);
  }
}
