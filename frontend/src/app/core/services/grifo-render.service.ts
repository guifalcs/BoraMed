import { DOCUMENT, Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrifoService } from './grifo.service';
import type { BlocoGrifo, CorGrifo, FerramentaGrifo } from '../../shared/utils/grifo';
import { nomeHighlight, regraHighlight } from '../../shared/utils/grifo-cor';
import {
  offsetsDoRange,
  rangeDosOffsets,
  suportaHighlightApi,
  textoDoBloco,
} from '../../shared/utils/grifo-dom';

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

  /** Cores com highlight registrado agora — o que precisa ser limpo depois. */
  private coresPintadas = new Set<CorGrifo>();
  /** Cores que já ganharam regra `::highlight()`; a regra é escrita uma vez só. */
  private readonly regrasEscritas = new Set<CorGrifo>();
  private folha: HTMLStyleElement | null = null;

  private frame: number | null = null;
  private ociosoTimer: ReturnType<typeof setTimeout> | null = null;
  private ponteiroPressionado = false;
  /** Elemento onde o toque atual começou (decide o clique-fora). */
  private origemDoToque: Element | null = null;
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

    // Some com o que saiu de cena: cor que não é mais usada por nenhum grifo
    // continuaria registrada e pintando trecho de questão antiga.
    for (const cor of this.coresPintadas) {
      if (!porCor.has(cor)) registro.delete(nomeHighlight(cor));
    }
    this.coresPintadas = new Set(porCor.keys());

    for (const [cor, ranges] of porCor) {
      this.garantirRegra(cor);
      registro.set(nomeHighlight(cor), new Highlight(...ranges));
    }
  }

  /**
   * `::highlight()` exige uma regra de CSS por nome, e a cor agora é livre —
   * não dá para deixar as regras prontas no styles.css. Cada cor que entra em
   * cena ganha a sua, uma única vez, numa folha de estilo própria.
   */
  private garantirRegra(cor: CorGrifo): void {
    if (this.regrasEscritas.has(cor)) return;
    this.regrasEscritas.add(cor);

    if (!this.folha) {
      this.folha = this.document.createElement('style');
      this.folha.setAttribute('data-bm', 'grifos');
      this.document.head.appendChild(this.folha);
    }
    this.folha.appendChild(this.document.createTextNode(regraHighlight(cor)));
  }

  /** Apaga a pintura da tela sem mexer no que está salvo (saída da prova). */
  limparPintura(): void {
    if (!suportaHighlightApi()) return;
    const registro = (CSS as unknown as { highlights: HighlightRegistry }).highlights;
    for (const cor of this.coresPintadas) registro.delete(nomeHighlight(cor));
    this.coresPintadas = new Set();
  }

  // ---- Seleção → grifo ----

  private readonly aoSoltarPonteiro = (): void => {
    this.ponteiroPressionado = false;
    // Onde o toque COMEÇOU é o que decide se foi "clique em lugar nenhum":
    // um arrastar que termina fora do texto ainda é uma seleção legítima.
    const origem = this.origemDoToque;
    this.origemDoToque = null;
    // A seleção só fica pronta depois que o navegador processa o soltar.
    setTimeout(() => {
      if (!this.processarSelecao()) this.talvezGuardar(origem);
    }, 0);
  };

  private readonly aoPressionarPonteiro = (event: Event): void => {
    this.ponteiroPressionado = true;
    this.origemDoToque = event.target instanceof Element ? event.target : null;
    this.cancelarOcioso();
  };

  /**
   * Clique em lugar nenhum guarda o marca-texto — é o gesto de largar a caneta
   * na mesa. Seguram a caneta na mão: o próprio estojo, qualquer controle (a
   * alternativa que se marca, navegar, finalizar) e o texto grifável, que é
   * justamente onde ela trabalha. Fora disso, é fundo de tela.
   */
  private talvezGuardar(alvo: Element | null): void {
    if (!alvo || !this.grifoService.modoAtivo()) return;

    const selecao = this.document.getSelection();
    if (selecao && !selecao.isCollapsed) return;

    if (alvo.closest('app-grifo-toolbar')) return;
    if (
      alvo.closest(
        'button, a, input, textarea, select, label, [role="radio"], [role="button"], [role="dialog"]',
      )
    ) {
      return;
    }
    for (const registro of this.blocos.values()) {
      if (registro.el.contains(alvo)) return;
    }

    this.grifoService.modoAtivo.set(false);
  }

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

  /**
   * Devolve `true` quando a seleção virou grifo.
   *
   * `forcar` é o atalho de teclado: ali a seleção vale mesmo com o marca-texto
   * guardado — é justamente o caminho de pintar sem pegar a caneta antes.
   */
  private processarSelecao(forcar = false, ferramentaForcada: FerramentaGrifo | null = null): boolean {
    if (!forcar && !this.grifoService.modoAtivo()) return false;
    const ferramenta = ferramentaForcada ?? this.grifoService.ferramenta();
    const apagando = ferramenta === 'borracha';
    const selecao = this.document.getSelection();
    if (!selecao || selecao.isCollapsed || selecao.rangeCount === 0) return false;

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
      if (apagando) {
        while (inicio > 0 && /\s/.test(texto[inicio - 1] ?? '')) inicio--;
        while (fim < texto.length && /\s/.test(texto[fim] ?? '')) fim++;
      }

      if (apagando) {
        this.grifoService.apagar(registro.questaoId, registro.bloco, inicio, fim);
      } else {
        this.grifoService.grifar(registro.questaoId, registro.bloco, inicio, fim, ferramenta);
      }
      grifou = true;
    }

    if (grifou) selecao.removeAllRanges();
    return grifou;
  }

  /**
   * `G` é o atalho do marca-texto, e ele lê o contexto: com texto selecionado,
   * pinta (ou apaga) a seleção na hora, sem exigir que a ferramenta já esteja
   * na mão; sem seleção, liga e desliga o modo. Vive aqui, e não na tela de
   * execução, porque a revisão precisa do mesmo atalho.
   */
  private readonly aoTeclar = (evento: KeyboardEvent): void => {
    if (evento.key !== 'g' && evento.key !== 'G') return;
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    // `Shift` é o outro lado da mesma tecla: em vez de pintar, apaga.
    const borracha = evento.shiftKey;

    const alvo = evento.target as HTMLElement | null;
    const tag = alvo?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (alvo?.isContentEditable) return;
    // Diálogo aberto tem a palavra: `G` ali é só uma letra.
    if (alvo?.closest?.('dialog[open]')) return;

    evento.preventDefault();

    // Com trecho selecionado o atalho é uma passada só: pinta (ou apaga) ali e
    // não mexe na ferramenta que estava na mão.
    if (this.processarSelecao(true, borracha ? 'borracha' : null)) return;

    // Sem seleção, o atalho entrega a ferramenta.
    if (!borracha) {
      this.grifoService.toggleModo();
      return;
    }
    if (this.grifoService.modoAtivo() && this.grifoService.borrachaAtiva()) {
      this.grifoService.modoAtivo.set(false);
    } else {
      this.grifoService.selecionarFerramenta('borracha');
    }
  };

  private ouvir(): void {
    if (!this.isBrowser || this.ouvindo) return;
    this.ouvindo = true;
    this.document.addEventListener('pointerdown', this.aoPressionarPonteiro, true);
    this.document.addEventListener('pointerup', this.aoSoltarPonteiro, true);
    this.document.addEventListener('selectionchange', this.aoMudarSelecao);
    this.document.addEventListener('keydown', this.aoTeclar);
  }

  private pararDeOuvir(): void {
    if (!this.ouvindo) return;
    this.ouvindo = false;
    this.cancelarOcioso();
    this.document.removeEventListener('pointerdown', this.aoPressionarPonteiro, true);
    this.document.removeEventListener('pointerup', this.aoSoltarPonteiro, true);
    this.document.removeEventListener('selectionchange', this.aoMudarSelecao);
    this.document.removeEventListener('keydown', this.aoTeclar);
  }

  private cancelarOcioso(): void {
    if (this.ociosoTimer !== null) {
      clearTimeout(this.ociosoTimer);
      this.ociosoTimer = null;
    }
  }
}
