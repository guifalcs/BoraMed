import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AlertTriangle, Check, ChevronDown, ChevronRight, CloudUpload, GraduationCap, Loader2 } from 'lucide-angular';
import { NotasService } from '../../core/services/notas.service';
import { ProfileService } from '../../core/services/profile.service';
import { NotificationService } from '../../core/services/notification.service';
import { PERIODO_OPTIONS } from '../../core/models/periodo';
import type { MinhasNotas, NotaLancamento } from '../../core/models/notas';
import {
  calcularPeriodo,
  fmtPts,
  linhaDimensao,
  type ResumoEixo,
  type SituacaoEixo,
} from '../../core/utils/notas-calculo.util';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { UiSelectComponent } from '../../shared/components/ui/select/ui-select.component';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { NotasDimensaoComponent, type SalvarNotaEvento } from './notas-dimensao.component';

const TITULO_DIM = { cognitiva: 'Teoria', habilidades: 'Prática', unica: 'Nota única' } as const;
const STATUS_EIXO: Record<SituacaoEixo, string> = {
  sem_notas: 'Sem notas',
  aprovado: 'Meta atingida em todas as partes',
  em_andamento: 'Em andamento',
  exame: 'Exame especial na teoria',
  reprovado: 'Há uma parte abaixo da meta',
};

@Component({
  selector: 'app-minhas-notas',
  standalone: true,
  imports: [RouterLink, UiIconComponent, UiSelectComponent, UiConfirmDialogComponent, NotasDimensaoComponent],
  templateUrl: './minhas-notas.component.html',
  styleUrl: './minhas-notas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinhasNotasComponent implements OnInit {
  private readonly service = inject(NotasService);
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(NotificationService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly dados = signal<MinhasNotas | null>(null);
  protected readonly lancamentos = signal<NotaLancamento[]>([]);
  protected readonly eixoAtivoId = signal<string | null>(null);
  protected readonly salvando = signal<ReadonlySet<string>>(new Set());
  protected readonly salvos = signal<ReadonlySet<string>>(new Set());
  protected readonly confirmarLimpar = signal(false);
  protected readonly limpando = signal(false);

  // Sem período cadastrado
  protected readonly periodoEscolhido = signal<number | null>(null);
  protected readonly salvandoPeriodo = signal(false);
  protected readonly periodoOptions = PERIODO_OPTIONS;

  protected readonly regulamento = computed(() => this.dados()?.regulamento ?? null);

  protected readonly resumo = computed(() => {
    const reg = this.regulamento();
    return reg ? calcularPeriodo(reg, this.lancamentos()) : null;
  });

  protected readonly eixoAtivo = computed<ResumoEixo | null>(() => {
    const r = this.resumo();
    if (!r) return null;
    return r.eixos.find((e) => e.eixo.id === this.eixoAtivoId()) ?? r.eixos[0] ?? null;
  });

  protected readonly lancadasNoEixo = computed(() =>
    this.eixoAtivo()?.dimensoes.reduce((soma, d) => soma + d.lancadas, 0) ?? 0,
  );
  protected readonly totalNoEixo = computed(() =>
    this.eixoAtivo()?.dimensoes.reduce((soma, d) => soma + d.folhas.length, 0) ?? 0,
  );

  /** Aviso de uma linha, só quando algo pede atenção (atenção, risco ou exame). */
  protected readonly foco = computed(() => {
    const f = this.resumo()?.foco;
    if (!f || !['atencao', 'risco', 'exame'].includes(f.situacao)) return null;
    return { resumo: f, rotulo: `${f.eixoSigla} · ${TITULO_DIM[f.tipo]}`, frase: linhaDimensao(f).titulo };
  });

  protected readonly periodosDisponiveisTexto = computed(() => {
    const lista = this.dados()?.periodos_disponiveis ?? [];
    const nomes = lista.map((p) => `${p}º`);
    if (nomes.length <= 1) return nomes.join('');
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  });

  protected readonly fmtPts = fmtPts;
  protected readonly statusEixo = STATUS_EIXO;

  protected readonly iconAlerta = AlertTriangle;
  protected readonly iconChevron = ChevronDown;
  protected readonly iconIr = ChevronRight;
  protected readonly iconPeriodo = GraduationCap;
  protected readonly iconNuvem = CloudUpload;
  protected readonly iconCheck = Check;
  protected readonly iconLoader = Loader2;

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    const r = await this.service.minhasNotas();
    if (r.ok) {
      this.dados.set(r.data);
      this.lancamentos.set(r.data.lancamentos.map((l) => ({ ...l, nota: Number(l.nota) })));
      this.confirmados.clear();
      for (const l of r.data.lancamentos) this.confirmados.set(l.item_id, Number(l.nota));
      if (!this.eixoAtivoId() && r.data.regulamento) {
        this.eixoAtivoId.set(this.eixoInicial());
      }
    } else {
      this.erro.set(r.error);
    }
    this.carregando.set(false);
  }

  /** Abre no eixo que mais pede atenção (ou no primeiro). */
  private eixoInicial(): string | null {
    const r = this.resumo();
    return r?.foco?.eixoId ?? r?.eixos[0]?.eixo.id ?? null;
  }

  protected selecionarEixo(id: string): void {
    this.eixoAtivoId.set(id);
  }

  protected navegarEixos(ev: KeyboardEvent, indice: number): void {
    const eixos = this.resumo()?.eixos ?? [];
    if (!eixos.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const destino = ev.key === 'Home' ? 0 : ev.key === 'End' ? eixos.length - 1
      : (indice + (ev.key === 'ArrowRight' ? 1 : -1) + eixos.length) % eixos.length;
    const id = eixos[destino].eixo.id;
    this.selecionarEixo(id);
    document.getElementById(`aba-${id}`)?.focus();
  }

  protected irParaDimensao(eixoId: string, dimensaoId: string): void {
    this.eixoAtivoId.set(eixoId);
    // Espera o @for re-renderizar o eixo escolhido antes de rolar.
    requestAnimationFrame(() => {
      const alvo = document.getElementById(`dimensao-${dimensaoId}`);
      alvo?.focus({ preventScroll: true });
      alvo?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      });
    });
  }

  /** Último valor que o servidor confirmou, por item (base para desfazer). */
  private readonly confirmados = new Map<string, number>();
  /** Gravação mais recente por item: resposta de gravação antiga é ignorada. */
  private readonly versao = new Map<string, number>();

  protected async salvarNota(ev: SalvarNotaEvento): Promise<void> {
    const atual = this.lancamentos().find((l) => l.item_id === ev.itemId)?.nota ?? null;
    if (atual === ev.valor) return;

    // Otimista: o resumo e os insights recalculam na hora.
    this.aplicarLocal(ev.itemId, ev.valor);
    const minha = (this.versao.get(ev.itemId) ?? 0) + 1;
    this.versao.set(ev.itemId, minha);
    this.marcar(this.salvando, ev.itemId, true);

    const r = await this.service.salvarNota(ev.itemId, ev.valor);
    if (this.versao.get(ev.itemId) !== minha) return; // outra gravação do mesmo item já está valendo
    this.marcar(this.salvando, ev.itemId, false);

    if (!r.ok) {
      this.aplicarLocal(ev.itemId, this.confirmados.get(ev.itemId) ?? null);
      this.toast.error(r.error);
      return;
    }
    if (ev.valor === null) this.confirmados.delete(ev.itemId);
    else this.confirmados.set(ev.itemId, ev.valor);
    this.marcar(this.salvos, ev.itemId, true);
    setTimeout(() => this.marcar(this.salvos, ev.itemId, false), 1800);
  }

  private aplicarLocal(itemId: string, valor: number | null): void {
    this.lancamentos.update((lista) => {
      const sem = lista.filter((l) => l.item_id !== itemId);
      return valor === null ? sem : [...sem, { item_id: itemId, nota: valor, atualizado_em: new Date().toISOString() }];
    });
  }

  private marcar(alvo: typeof this.salvando, id: string, ligado: boolean): void {
    alvo.update((s) => {
      const n = new Set(s);
      if (ligado) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  protected async limparNotas(): Promise<void> {
    if (this.limpando() || this.salvando().size) return;
    this.confirmarLimpar.set(false);
    const reg = this.regulamento();
    if (!reg) return;
    this.limpando.set(true);
    const r = await this.service.limparMinhasNotas(reg.id);
    this.limpando.set(false);
    if (r.ok) {
      this.lancamentos.set([]);
      this.confirmados.clear();
      this.salvos.set(new Set());
      this.toast.success('Notas apagadas. Bora de novo!');
    } else {
      this.toast.error(r.error);
    }
  }

  protected escolherPeriodo(valor: string | number | null): void {
    this.periodoEscolhido.set(valor === null || valor === '' ? null : Number(valor));
  }

  protected async salvarPeriodo(): Promise<void> {
    const periodo = this.periodoEscolhido();
    if (periodo === null) return;
    this.salvandoPeriodo.set(true);
    const r = await this.profileService.updateDadosObrigatorios({ periodo });
    this.salvandoPeriodo.set(false);
    if (!r.ok) {
      this.toast.error(r.error);
      return;
    }
    this.toast.success(`Pronto: ${periodo}º período salvo no seu perfil.`);
    this.eixoAtivoId.set(null);
    await this.carregar();
  }
}
