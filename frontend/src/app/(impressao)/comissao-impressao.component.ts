import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AdminService, AdminComissaoDetalhe } from '../core/services/admin.service';
import { faculdadeUnidadeLabel } from '../shared/utils/admin-labels.util';
import type { FaculdadeUnidade } from '../core/models/faculdade-unidade';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Prestação de contas de comissão em formato A4, pronta para virar PDF pelo
 * "Salvar como PDF" do navegador.
 *
 * O layout é o mesmo do `gerar.py` da skill `prestacao-contas-cupom` (header em
 * gradiente com a logo branca, cartões de metadados, tabela de vendas e faixa
 * do total) para que o documento emitido pelo admin e o emitido pela skill
 * sejam o mesmo documento.
 */
@Component({
  selector: 'app-comissao-impressao',
  standalone: true,
  templateUrl: './comissao-impressao.component.html',
  styleUrl: './comissao-impressao.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComissaoImpressaoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly adminService = inject(AdminService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly detalhe = signal<AdminComissaoDetalhe | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly carregando = signal(true);

  /** Só as vendas que geram repasse entram no documento do responsável. */
  protected readonly vendasPagaveis = computed(
    () => this.detalhe()?.vendas.filter((v) => v.comissao_centavos > 0) ?? [],
  );

  protected readonly vendasSemRepasse = computed(
    () => this.detalhe()?.vendas.filter((v) => v.comissao_centavos === 0) ?? [],
  );

  protected readonly totalBase = computed(() =>
    this.vendasPagaveis().reduce((soma, v) => soma + v.bruto_centavos, 0),
  );

  private readonly comissaoAoVivo = computed(() =>
    this.vendasPagaveis().reduce((soma, v) => soma + v.comissao_centavos, 0),
  );

  /**
   * Competência fechada paga o valor CONGELADO no fechamento, não o recálculo:
   * é o número que foi acertado com o responsável.
   */
  protected readonly totalComissao = computed(() => {
    const d = this.detalhe();
    if (d && d.status !== 'aberta' && d.fechado_comissao_centavos != null) {
      return d.fechado_comissao_centavos;
    }
    return this.comissaoAoVivo();
  });

  /** Fechamento antigo que não bate mais com as vendas: avisa no documento. */
  protected readonly divergente = computed(() => {
    const d = this.detalhe();
    if (!d || d.status === 'aberta' || d.fechado_comissao_centavos == null) return false;
    return d.fechado_comissao_centavos !== this.comissaoAoVivo();
  });

  protected readonly competenciaLabel = computed(() => {
    const d = this.detalhe();
    if (!d) return '';
    const [ano, mes] = d.competencia.split('-').map(Number);
    return `${MESES[mes - 1]} de ${ano}`;
  });

  protected readonly regraResumo = computed(() => {
    const d = this.detalhe();
    if (!d) return '';
    const ipa = Number(d.comissao_pct_ipatinga);
    const fora = Number(d.comissao_pct_fora);
    return ipa === fora
      ? `${ipa}% sobre todas as unidades`
      : `${ipa}% Ipatinga (MG) · ${fora}% demais unidades`;
  });

  protected readonly descontoLabel = computed(() => {
    const d = this.detalhe();
    if (!d) return '';
    return d.cupom_tipo === 'percentual' ? `${d.cupom_valor}% off` : `${this.brl(d.cupom_valor)} off`;
  });

  protected readonly statusLabel = computed(() => {
    const d = this.detalhe();
    if (!d) return '';
    if (d.status === 'paga') return `Repasse pago em ${this.dataBr(d.paga_em!)}`;
    if (d.status === 'fechada') return `Fechado em ${this.dataBr(d.fechada_em!)}, aguardando repasse`;
    return d.em_andamento ? 'Mês em andamento (parcial)' : 'Competência aberta';
  });

  protected readonly emitidoEm = signal(new Date().toLocaleDateString('pt-BR'));

  constructor() {
    afterNextRender(() => {
      void this.carregar();
    });
  }

  private async carregar(): Promise<void> {
    const cupomId = this.route.snapshot.paramMap.get('cupomId');
    const competencia = this.route.snapshot.paramMap.get('competencia');
    if (!cupomId || !competencia) {
      this.erro.set('Endereço incompleto: falta o cupom ou a competência.');
      this.carregando.set(false);
      return;
    }

    const result = await this.adminService.getComissaoDetalhe(cupomId, competencia);
    this.carregando.set(false);
    if (!result.ok) {
      this.erro.set(result.error);
      return;
    }
    this.detalhe.set(result.data);

    // Abre a caixa de impressão sozinho: o fluxo é "emitir PDF", não "ver tela".
    if (this.isBrowser) {
      setTimeout(() => window.print(), 400);
    }
  }

  protected imprimir(): void {
    if (this.isBrowser) window.print();
  }

  protected brl(centavos: number): string {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected dataBr(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  protected unidade(unidade: string | null): string {
    return unidade ? faculdadeUnidadeLabel(unidade as FaculdadeUnidade) : 'Não informada';
  }

  /** Nunca expor e-mail inteiro no documento que vai para o responsável. */
  protected assinante(email: string | null, nome: string | null): string {
    if (nome) return nome;
    if (!email) return '—';
    const [local, dominio] = email.split('@');
    if (!dominio) return email;
    return `${local.slice(0, Math.min(6, local.length))}***@${dominio}`;
  }

  protected pct(valor: number): string {
    const n = Number(valor);
    return Number.isInteger(n) ? `${n}%` : `${n.toString().replace('.', ',')}%`;
  }
}
