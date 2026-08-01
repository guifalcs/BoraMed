import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Check, Sparkles, X } from 'lucide-angular';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import { PaywallService } from '../../../core/services/paywall.service';

/**
 * Modal de upsell disparado pelo `PaywallService`. Montado uma única vez no
 * shell do dashboard.
 *
 * A ordem dos benefícios segue o efeito de posição serial: o mais forte no
 * topo, o utilitário no meio e o fechamento por perda logo acima do CTA, que é
 * onde a decisão acontece.
 */
@Component({
  selector: 'app-paywall-modal',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './paywall-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaywallModalComponent {
  private readonly paywall = inject(PaywallService);
  private readonly router = inject(Router);

  protected readonly aberto = this.paywall.aberto;
  protected readonly conteudo = this.paywall.conteudo;
  protected readonly contexto = this.paywall.contexto;

  protected readonly checkIcon = Check;
  protected readonly closeIcon = X;
  protected readonly sparklesIcon = Sparkles;

  protected readonly GRADIENTE =
    'linear-gradient(145deg, #1E40AF 0%, #2451D8 48%, #6427D9 100%)';
  protected readonly HIGHLIGHTS =
    'radial-gradient(circle at 82% 22%, rgba(255,255,255,0.18), transparent 26%), radial-gradient(circle at 20% 85%, rgba(13,148,136,0.22), transparent 28%)';

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.fechar();
  }

  protected fechar(): void {
    this.paywall.fechar();
  }

  protected async irParaPlanos(): Promise<void> {
    const origem = this.contexto();
    this.paywall.fechar();
    await this.router.navigate(['/planos'], {
      queryParams: origem ? { origem } : undefined,
    });
  }
}
