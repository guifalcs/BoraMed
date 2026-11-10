import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Check, Loader2 } from 'lucide-angular';
import type { NotasDimensao, TipoDimensao } from '../../core/models/notas';
import {
  fmtPts,
  lerNotaDigitada,
  linhaDimensao,
  type FolhaNota,
  type ResumoDimensao,
} from '../../core/utils/notas-calculo.util';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

export interface SalvarNotaEvento {
  itemId: string;
  valor: number | null;
}

/** Linha do formulário: item simples ou grupo com as partes. */
interface LinhaGrupo {
  id: string;
  nome: string;
  pontos: number;
  /** Item sem partes: a própria folha. */
  folha: FolhaNota | null;
  partes: FolhaNota[];
}

const TITULO: Record<TipoDimensao, string> = {
  cognitiva: 'Teoria',
  habilidades: 'Prática',
  unica: 'Nota única',
};

const STATUS: Record<ResumoDimensao['situacao'], string> = {
  sem_notas: 'Sem notas',
  garantida: 'Meta atingida',
  confortavel: 'No caminho',
  no_caminho: 'No caminho',
  atencao: 'Atenção',
  risco: 'Atenção',
  exame: 'Exame especial',
  abaixo: 'Abaixo da meta',
};

/**
 * Cartão de uma dimensão: placar, barra até a meta, uma frase do que fazer e
 * os campos de nota. De propósito, nada além disso.
 */
@Component({
  selector: 'app-notas-dimensao',
  standalone: true,
  imports: [NgTemplateOutlet, UiIconComponent],
  templateUrl: './notas-dimensao.component.html',
  styleUrl: './notas-dimensao.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotasDimensaoComponent {
  readonly dimensao = input.required<NotasDimensao>();
  readonly resumo = input.required<ResumoDimensao>();
  readonly salvando = input<ReadonlySet<string>>(new Set());
  readonly salvos = input<ReadonlySet<string>>(new Set());
  readonly bloqueado = input(false);
  readonly salvar = output<SalvarNotaEvento>();

  protected readonly erros = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly linha = computed(() => linhaDimensao(this.resumo()));
  protected readonly titulo = computed(() => TITULO[this.dimensao().tipo]);
  protected readonly status = computed(() => STATUS[this.resumo().situacao]);

  protected readonly linhas = computed<LinhaGrupo[]>(() => {
    const porId = new Map(this.resumo().folhas.map((f) => [f.id, f]));
    return this.dimensao().itens.map((item) => ({
      id: item.id,
      nome: item.nome,
      pontos: Number(item.pontos),
      folha: item.subitens.length === 0 ? (porId.get(item.id) ?? null) : null,
      partes: item.subitens.map((s) => porId.get(s.id)).filter((f): f is FolhaNota => !!f),
    }));
  });

  /** Larguras da barra (em % do total). */
  protected readonly barra = computed(() => {
    const r = this.resumo();
    const pct = (v: number) => (r.total > 0 ? Math.max(0, Math.min(100, (v / r.total) * 100)) : 0);
    return { obtido: pct(r.obtido), meta: pct(r.meta) };
  });

  protected readonly fmtPts = fmtPts;
  protected readonly iconCheck = Check;
  protected readonly iconLoader = Loader2;

  protected valorCampo(f: FolhaNota): string {
    return f.nota === null ? '' : fmtPts(f.nota);
  }

  protected confirmarCampo(f: FolhaNota, campo: HTMLInputElement): void {
    const lido = lerNotaDigitada(campo.value, f.pontos);
    if (!lido.ok) {
      this.definirErro(f.id, lido.erro);
      return;
    }
    this.definirErro(f.id, null);
    // Normaliza a exibição ("17.5" → "17,5").
    campo.value = lido.valor === null ? '' : fmtPts(lido.valor);
    if (lido.valor !== f.nota) this.salvar.emit({ itemId: f.id, valor: lido.valor });
  }

  protected teclaCampo(ev: KeyboardEvent, f: FolhaNota, campo: HTMLInputElement): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      campo.blur();
    } else if (ev.key === 'Escape') {
      campo.value = this.valorCampo(f);
      this.definirErro(f.id, null);
      campo.blur();
    }
  }

  private definirErro(id: string, erro: string | null): void {
    this.erros.update((m) => {
      const n = new Map(m);
      if (erro) n.set(id, erro);
      else n.delete(id);
      return n;
    });
  }
}
