import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChevronLeft } from 'lucide-angular';
import { ProvaService } from '../../../core/services/prova.service';
import { TentativaService } from '../../../core/services/tentativa.service';
import { NotificationService } from '../../../core/services/notification.service';
import type { ProvaComFaculdade } from '../../../core/models/prova';
import type { ModoProva, Tentativa } from '../../../core/models/tentativa';
import { ModoSelectorComponent } from '../../../shared/components/modo-selector/modo-selector.component';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-prova-detalhe',
  standalone: true,
  imports: [RouterLink, ModoSelectorComponent, UiButtonComponent, UiIconComponent, EmptyStateComponent],
  templateUrl: './prova-detalhe.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvaDetalheComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly provaService = inject(ProvaService);
  private readonly tentativaService = inject(TentativaService);
  private readonly notifications = inject(NotificationService);

  protected readonly chevronLeftIcon = ChevronLeft;

  protected readonly prova = signal<ProvaComFaculdade | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly modoSelecionado = signal<ModoProva>('simulado');
  protected readonly iniciando = signal(false);
  protected readonly tentativaAtiva = signal<Tentativa | null>(null);

  protected readonly isPersonalizado = computed(() => {
    const p = this.prova();
    return p !== null && p.tipo === 'processual' && p.edicao < 0;
  });

  protected readonly backRoute = computed(() =>
    this.isPersonalizado() ? '/dashboard/simulados' : '/dashboard/simulados/rede-afya',
  );

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

    this.isLoading.set(false);
  }

  protected onModoChange(modo: ModoProva): void {
    this.modoSelecionado.set(modo);
  }

  protected async iniciar(): Promise<void> {
    const prova = this.prova();
    if (!prova || prova.qtd_questoes === 0) return;

    this.iniciando.set(true);
    const result = await this.tentativaService.iniciar(prova.id, this.modoSelecionado());
    this.iniciando.set(false);

    if (result.ok) {
      this.tentativaService.setProvaNome(prova.nome);
      void this.router.navigate(['/dashboard/simulados', prova.id, 'tentativa', result.data.tentativa.id]);
    } else {
      this.notifications.error('Não foi possível iniciar a prova. Tente novamente.');
    }
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
