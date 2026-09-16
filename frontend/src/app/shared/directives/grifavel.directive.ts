import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrifoRenderService } from '../../core/services/grifo-render.service';
import { GrifoService } from '../../core/services/grifo.service';
import type { BlocoGrifo } from '../utils/grifo';
import { cursorBorracha, cursorCaneta } from '../utils/grifo-cor';

/**
 * Marca um pedaço de texto da questão como grifável.
 *
 * ```html
 * <div [appGrifavel]="questao().id" grifoBloco="enunciado">…</div>
 * ```
 *
 * O elemento vira a âncora dos offsets daquele bloco. O componente não precisa
 * fazer mais nada: o serviço de render cuida de pintar e de transformar
 * seleção em grifo.
 */
@Directive({
  selector: '[appGrifavel]',
  standalone: true,
  host: {
    '[class.bm-grifavel-ativo]': 'modoAtivo()',
    // O cursor vira a ferramenta na mão, com a cor carregada na ponta, em cima
    // do texto que aceita pintura. Desenhado aqui e não em classe de CSS: a
    // cor é livre, então não existe lista de regras possíveis.
    '[style.cursor]': 'cursor()',
  },
})
export class GrifavelDirective implements OnInit, OnDestroy {
  /** Questão dona do texto. */
  readonly questaoId = input.required<string>({ alias: 'appGrifavel' });
  readonly grifoBloco = input.required<BlocoGrifo>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly render = inject(GrifoRenderService);
  private readonly grifo = inject(GrifoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly modoAtivo = this.grifo.modoAtivo;

  protected readonly cursor = computed(() => {
    if (!this.grifo.modoAtivo()) return null;
    const ferramenta = this.grifo.ferramenta();
    return ferramenta === 'borracha' ? cursorBorracha() : cursorCaneta(ferramenta);
  });

  private chave: number | null = null;
  private observer: MutationObserver | null = null;

  constructor() {
    // O card é reaproveitado entre questões: trocar de questão troca o bloco
    // sem destruir o elemento, então o registro precisa ser refeito.
    effect(() => {
      const questaoId = this.questaoId();
      const bloco = this.grifoBloco();
      if (!this.isBrowser) return;
      this.baixar();
      this.chave = this.render.registrar(this.el.nativeElement, questaoId, bloco);
    });
  }

  ngOnInit(): void {
    if (!this.isBrowser || typeof MutationObserver === 'undefined') return;
    // O Markdown entra no elemento depois do primeiro ciclo; sem reancorar
    // aqui, o grifo restaurado do storage não teria onde pousar.
    this.observer = new MutationObserver(() => this.render.agendarPintura());
    this.observer.observe(this.el.nativeElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.baixar();
  }

  private baixar(): void {
    if (this.chave !== null) {
      this.render.desregistrar(this.chave);
      this.chave = null;
    }
  }
}
