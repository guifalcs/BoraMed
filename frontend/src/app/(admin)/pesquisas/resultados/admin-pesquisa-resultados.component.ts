import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SEGMENTOS_ACESSO } from '../../../core/models/subscription.types';
import type { SegmentoAcesso } from '../../../core/models/subscription.types';
import type { PesquisaResultados, ResultadoPergunta } from '../../../core/models/pesquisa.types';

/** Quantas respostas de texto mostrar antes do "ver todas". */
const TEXTOS_VISIVEIS = 15;

@Component({
  selector: 'app-admin-pesquisa-resultados',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-pesquisa-resultados.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPesquisaResultadosComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly resultados = signal<PesquisaResultados | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly textosExpandidos = signal<string[]>([]);

  /** Quantos viram a pesquisa e escolheram não responder. */
  protected readonly taxaResposta = computed(() => {
    const r = this.resultados();
    if (!r) return null;
    const vistas = r.total_respostas + r.total_dispensas;
    return vistas === 0 ? null : Math.round((r.total_respostas / vistas) * 100);
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/admin/pesquisas']);
      return;
    }

    const result = await this.adminService.resultadosPesquisa(id);
    if (result.ok) {
      this.resultados.set(result.data);
    } else {
      this.toast.error('Erro ao carregar resultados.');
      void this.router.navigate(['/admin/pesquisas']);
    }
    this.isLoading.set(false);
  }

  protected percentual(total: number, base: number): number {
    return base === 0 ? 0 : Math.round((total / base) * 100);
  }

  protected maiorNaDistribuicao(pergunta: ResultadoPergunta): number {
    return pergunta.distribuicao.reduce((maior, d) => Math.max(maior, d.total), 0);
  }

  protected textosVisiveis(pergunta: ResultadoPergunta) {
    const textos = pergunta.textos ?? [];
    return this.expandido(pergunta.id) ? textos : textos.slice(0, TEXTOS_VISIVEIS);
  }

  protected temMaisTextos(pergunta: ResultadoPergunta): boolean {
    return (pergunta.textos?.length ?? 0) > TEXTOS_VISIVEIS;
  }

  /** Quantas respostas de texto a RPC deixou de fora do recorte de 300. */
  protected textosOcultos(pergunta: ResultadoPergunta): number {
    return Math.max(0, (pergunta.textos_total ?? 0) - (pergunta.textos?.length ?? 0));
  }

  protected expandido(perguntaId: string): boolean {
    return this.textosExpandidos().includes(perguntaId);
  }

  protected alternarTextos(perguntaId: string): void {
    this.textosExpandidos.update((ids) =>
      ids.includes(perguntaId) ? ids.filter((id) => id !== perguntaId) : [...ids, perguntaId],
    );
  }

  protected ehEscolha(pergunta: ResultadoPergunta): boolean {
    return pergunta.tipo === 'escolha_unica' || pergunta.tipo === 'multipla_escolha';
  }

  protected ehNumerica(pergunta: ResultadoPergunta): boolean {
    return pergunta.tipo === 'escala' || pergunta.tipo === 'nps';
  }

  protected ehTexto(pergunta: ResultadoPergunta): boolean {
    return pergunta.tipo === 'texto_curto' || pergunta.tipo === 'texto_longo';
  }

  protected segmentoLabel(segmento: SegmentoAcesso): string {
    return SEGMENTOS_ACESSO.find((s) => s.valor === segmento)?.label ?? segmento;
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }
}
