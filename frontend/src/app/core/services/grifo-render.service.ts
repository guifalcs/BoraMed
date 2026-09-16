import { DOCUMENT, Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrifoService } from './grifo.service';
import { CORES_GRIFO, type BlocoGrifo, type CorGrifo } from '../../shared/utils/grifo';
import {
  offsetsDoRange,
  rangeDosOffsets,
  suportaHighlightApi,
  textoDoBloco,
} from '../../shared/utils/grifo-dom';

/** Nome registrado em `CSS.highlights`; casa com `::highlight()` no styles.css. */
export function nomeHighlight(cor: CorGrifo): string {
  return `bm-grifo-${cor}`;
}

interface BlocoRegistrado {
  readonly el: Element;
  readonly questaoId: string;
  readonly bloco: BlocoGrifo;
}

/** Tempo sem mexer na seleção até considerar que o aluno terminou de arrastar. */
const OCIOSO_SELECAO_MS = 400;

/**
 * Pinta os grifos e transforma seleção de texto em grifo.
 *
 * Usa a CSS Custom Highlight API: os trechos são pintados por cima do texto,
 * sem tocar no DOM. Isso é o que permite grifar em cima do Markdown renderizado
 * sem quebrar a marcação, e reancorar sozinho quando o Angular re-renderiza o
 * card ao trocar de questão. Navegador sem a API mostra a prova normal, só sem
 * a pintura (o grifo continua sendo gravado).
 */
@Injectable({ providedIn: 'root' })
export class GrifoRenderService {
  private readonly grifoService = inject(GrifoService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly blocos = new Map<number, BlocoRegistrado>();
  private proximaChave = 0;

  private frame: number | null = null;
  private ociosoTimer: ReturnType<typeof setTimeout> | null = null;
  private ponteiroPressionado = false;
  private ouvindo = false;

  constructor() {
    // Qualquer mudança de grifo repinta — inclusive as vindas do storage.
    effect(() => {
      this.grifoService.grifos();
      this.agendarPintura();
    });
  }

  /** Um bloco de texto grifável entrou na tela. Devolve a chave de baixa. */
  registrar(el: Element, questaoId: string, bloco: BlocoGrifo): number {
    const chave = this.proximaChave++;
    this.blocos.set(chave, { el, questaoId, bloco });
    this.ouvir();
    this.agendarPintura();
    return chave;
  }

  desregistrar(chave: number): void {
    this.blocos.delete(chave);
    if (this.blocos.size === 0) this.pararDeOuvir();
    this.agendarPintura();
  }

  /** O conteúdo de um bloco mudou (re-render do Markdown): reancora tudo. */
  agendarPintura(): void {
    if (!this.isBrowser || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.pintar();
    });
  }

  private pintar(): void {
    if (!suportaHighlightApi()) return;

    const porCor = new Map<CorGrifo, Range[]>();
    for (const registro of this.blocos.values()) {
      if (!registro.el.isConnected) continue;
      for (const grifo of this.grifoService.grifosDaQuestao(registro.questaoId)) {
        if (grifo.bloco !== registro.bloco) continue;
        const range = rangeDosOffsets(registro.el, grifo.inicio, grifo.fim);
        if (!range) continue;
        const lista = porCor.get(grifo.cor);
        if (lista) lista.push(range);
        else porCor.set(grifo.cor, [range]);
      }
    }

    const registro = (CSS as unknown as { highlights: HighlightRegistry }).highlights;
    for (const cor of CORES_GRIFO) {
      const ranges = porCor.get(cor);
      if (ranges?.length) registro.set(nomeHighlight(cor), new Highlight(...ranges));
      else registro.delete(nomeHighlight(cor));
    }
  }

  /** Apaga a pintura da tela sem mexer no que está salvo (saída da prova). */
  limparPintura(): void {
    if (!suportaHighlightApi()) return;
    const registro = (CSS as unknown as { highlights: HighlightRegistry }).highlights;
    for (const cor of CORES_GRIFO) registro.delete(nomeHighlight(cor));
  }

  // ---- Seleção → grifo ----

  private readonly aoSoltarPonteiro = (): void => {
    this.ponteiroPressionado = false;
    // A seleção só fica pronta depois que o navegador processa o soltar.
    setTimeout(() => this.processarSelecao(), 0);
  };

  private readonly aoPressionarPonteiro = (): void => {
    this.ponteiroPressionado = true;
    this.cancelarOcioso();
  };

  /**
   * Backstop do toque: ajustar as alças de seleção no celular não gera
   * `pointerup` nenhum. Quando a seleção para de mudar, o grifo sai.
   */
  private readonly aoMudarSelecao = (): void => {
    if (this.ponteiroPressionado || !this.grifoService.modoAtivo()) return;
    this.cancelarOcioso();
    this.ociosoTimer = setTimeout(() => {
      this.ociosoTimer = null;
      this.processarSelecao();
    }, OCIOSO_SELECAO_MS);
  };

  private processarSelecao(): void {
    if (!this.grifoService.modoAtivo()) return;
    const selecao = this.document.getSelection();
    if (!selecao || selecao.isCollapsed || selecao.rangeCount === 0) return;

    const range = selecao.getRangeAt(0);
    let grifou = false;

    for (const registro of this.blocos.values()) {
      if (!registro.el.isConnected) continue;
      const trecho = offsetsDoRange(registro.el, range);
      if (!trecho) continue;

      // Espaço e quebra de linha nas bordas viram rastro pintado no vazio.
      const texto = textoDoBloco(registro.el);
      let inicio = trecho.inicio;
      let fim = Math.min(trecho.fim, texto.length);
      while (inicio < fim && /\s/.test(texto[inicio] ?? '')) inicio++;
      while (fim > inicio && /\s/.test(texto[fim - 1] ?? '')) fim--;
      if (fim <= inicio) continue;

      // A borracha faz o caminho inverso: também leva o espaço em volta. Sem
      // isso, apagar uma palavra do meio de um grifo deixaria os dois espaços
      // vizinhos pintados, como dois riscos soltos no branco.
      if (this.grifoService.borrachaAtiva()) {
        while (inicio > 0 && /\s/.test(texto[inicio - 1] ?? '')) inicio--;
        while (fim < texto.length && /\s/.test(texto[fim] ?? '')) fim++;
      }

      this.grifoService.grifar(registro.questaoId, registro.bloco, inicio, fim);
      grifou = true;
    }

    if (grifou) selecao.removeAllRanges();
  }

  private ouvir(): void {
    if (!this.isBrowser || this.ouvindo) return;
    this.ouvindo = true;
    this.document.addEventListener('pointerdown', this.aoPressionarPonteiro, true);
    this.document.addEventListener('pointerup', this.aoSoltarPonteiro, true);
    this.document.addEventListener('selectionchange', this.aoMudarSelecao);
  }

  private pararDeOuvir(): void {
    if (!this.ouvindo) return;
    this.ouvindo = false;
    this.cancelarOcioso();
    this.document.removeEventListener('pointerdown', this.aoPressionarPonteiro, true);
    this.document.removeEventListener('pointerup', this.aoSoltarPonteiro, true);
    this.document.removeEventListener('selectionchange', this.aoMudarSelecao);
  }

  private cancelarOcioso(): void {
    if (this.ociosoTimer !== null) {
      clearTimeout(this.ociosoTimer);
      this.ociosoTimer = null;
    }
  }
}
