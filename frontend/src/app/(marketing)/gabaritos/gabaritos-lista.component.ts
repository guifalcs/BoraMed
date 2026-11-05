import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArrowRight, BadgeCheck, Eye, FileCheck2, Lock, Sparkles } from 'lucide-angular';
import { salvarDestinoPosLogin } from '../../core/utils/destino-pos-login.util';
import { GabaritoProvaService } from '../../core/services/gabarito-prova.service';
import { ProfileService } from '../../core/services/profile.service';
import { SeoService } from '../../core/seo/seo.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { GabaritosTopoComponent } from './gabaritos-topo.component';
import { GabaritosAvisoComponent } from './gabaritos-aviso.component';
import { nomeGabarito } from '../../core/utils/gabarito-prova.util';
import type { GabaritoProvaResumo } from '../../core/models/gabarito-prova';

/** Selo "Novo" some depois de 3 dias no ar. */
const JANELA_NOVO_MS = 3 * 24 * 60 * 60 * 1000;

interface GrupoSemestre {
  semestre: string;
  itens: GabaritoProvaResumo[];
}

/**
 * Lista pública de gabaritos extraoficiais. Mesmo componente em dois lugares:
 *   * /gabaritos            → página pública (SSR, SEO); os cards levam à vitrine,
 *                              que pede conta para mostrar as respostas;
 *   * /dashboard/gabaritos  → dentro do app (`data.embutido`), sem topo próprio.
 */
@Component({
  selector: 'app-gabaritos-lista',
  standalone: true,
  imports: [RouterLink, UiIconComponent, GabaritosTopoComponent, GabaritosAvisoComponent],
  templateUrl: './gabaritos-lista.component.html',
  styleUrl: './gabaritos.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GabaritosListaComponent {
  private readonly service = inject(GabaritoProvaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly profile = inject(ProfileService).profile;

  protected readonly embutido = this.route.snapshot.data['embutido'] === true;
  protected readonly base = this.embutido ? '/dashboard/gabaritos' : '/gabaritos';

  protected readonly gabaritos = signal<GabaritoProvaResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal(false);
  protected readonly periodo = signal<number | null>(this.periodoInicial());
  private readonly agora = Date.now();

  protected readonly meuPeriodo = computed(() => this.profile()?.periodo ?? null);

  /** Só os períodos que têm gabarito publicado viram filtro. */
  protected readonly periodosDisponiveis = computed(() =>
    [...new Set(this.gabaritos().map((g) => g.periodo))].sort((a, b) => a - b),
  );

  protected readonly grupos = computed<GrupoSemestre[]>(() => {
    const p = this.periodo();
    const filtrados = p === null ? this.gabaritos() : this.gabaritos().filter((g) => g.periodo === p);
    const mapa = new Map<string, GabaritoProvaResumo[]>();
    for (const g of filtrados) mapa.set(g.semestre, [...(mapa.get(g.semestre) ?? []), g]);
    return [...mapa.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([semestre, itens]) => ({ semestre, itens }));
  });

  protected readonly totalVisualizacoes = computed(() =>
    this.gabaritos().reduce((s, g) => s + g.visualizacoes, 0),
  );

  protected readonly nome = nomeGabarito;
  protected readonly iconArrow = ArrowRight;
  protected readonly iconCheck = BadgeCheck;
  protected readonly iconEye = Eye;
  protected readonly iconVazio = FileCheck2;
  protected readonly iconNovo = Sparkles;
  protected readonly iconLock = Lock;

  constructor() {
    if (!this.embutido) {
      inject(SeoService).update({
        title: 'Gabaritos extraoficiais das provas de medicina',
        description:
          'Gabarito extraoficial da N1, N2 e demais provas, por período, publicado pela equipe BoraMed logo depois da prova. Entre na sua conta para conferir e calcular sua nota.',
        path: '/gabaritos',
      });
    }
    void this.carregar();
    // Na página pública, quem já está logado vai para a lista dentro do app,
    // onde os cards abrem o gabarito completo (e não a vitrine de cadastro).
    if (!this.embutido && isPlatformBrowser(inject(PLATFORM_ID))) {
      const auth = inject(AuthService);
      effect(() => {
        if (auth.user()) {
          void this.router.navigate(['/dashboard/gabaritos'], {
            queryParams: { periodo: this.periodo() ?? undefined },
            replaceUrl: true,
          });
        }
      });
    }
  }

  private periodoInicial(): number | null {
    const q = Number(this.route.snapshot.queryParamMap.get('periodo'));
    return Number.isInteger(q) && q >= 1 && q <= 12 ? q : null;
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(false);
    const r = await this.service.listar();
    if (r.ok) this.gabaritos.set(r.data);
    else this.erro.set(true);
    this.carregando.set(false);
  }

  protected filtrar(p: number | null): void {
    this.periodo.set(p);
    // Filtro na URL: o link "gabaritos do 3º período" pode ser compartilhado.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { periodo: p },
      replaceUrl: true,
    });
  }

  protected lembrarDestino(): void {
    salvarDestinoPosLogin('/dashboard/gabaritos');
  }

  protected ehNovo(g: GabaritoProvaResumo): boolean {
    return this.agora - new Date(g.publicado_em).getTime() < JANELA_NOVO_MS;
  }

  protected dataCurta(iso: string | null): string {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  protected numero(n: number): string {
    return n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(n);
  }
}
