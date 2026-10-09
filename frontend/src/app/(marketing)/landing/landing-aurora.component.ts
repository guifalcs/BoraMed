import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Plus, RotateCcw, Sparkles } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

type EstadoCorrecao = 'aguardando' | 'corrigindo' | 'corrigida';

/** Trecho da resposta do aluno; `ponto` marca o que valeu nota (ordem do grifo). */
interface Trecho {
  readonly texto: string;
  readonly ponto?: number;
}

const NOTA = 90;
/** 4 trechos que valeram ponto + o que faltou. */
const PASSOS = 5;
const ESPERA_INICIAL_MS = 450;
const INTERVALO_MS = 380;
const CONTAGEM_MS = 700;

/**
 * Seção da Aurora (#aurora) na landing. Em vez de listar a correção inteira,
 * mostra a ideia num relance: a Aurora grifa na própria resposta do aluno o
 * que valeu ponto, aponta o que faltou e dá a nota. Os dados são os de uma
 * correção real (pontos atendidos/faltantes e nota do `app-correcao-feedback`).
 *
 * É uma demo: a resposta é fixa e nada vai para a IA. Quando o card entra na
 * tela, os grifos aparecem um a um e a nota sobe até 90; dá para repetir. Sem
 * JS (HTML pré-renderizado), a correção já aparece pronta. A sequência é
 * dirigida por estado, não por animação CSS, então também acontece com
 * "reduzir movimento" ligado (só o pincel do grifo fica instantâneo).
 */
@Component({
  selector: 'app-landing-aurora',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './landing-aurora.component.html',
  styleUrls: ['./landing-shared.css', './landing-aurora.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingAuroraComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private frame = 0;

  protected readonly sparklesIcon = Sparkles;
  protected readonly plusIcon = Plus;
  protected readonly replayIcon = RotateCcw;

  protected readonly estado = signal<EstadoCorrecao>('corrigida');
  /** Quantos grifos (e, no último passo, o "faltou") já apareceram. */
  protected readonly passo = signal(PASSOS);
  protected readonly notaExibida = signal(NOTA);

  protected readonly nota = NOTA;
  protected readonly passoFaltou = PASSOS;

  protected readonly pergunta =
    'Descreva a tríade de Charcot e seu significado clínico na colangite aguda.';

  protected readonly resposta: readonly Trecho[] = [
    { texto: 'Febre com calafrios', ponto: 1 },
    { texto: ', ' },
    { texto: 'icterícia', ponto: 2 },
    { texto: ' e ' },
    { texto: 'dor no hipocôndrio direito', ponto: 3 },
    { texto: '. Indica infecção das ' },
    { texto: 'vias biliares por obstrução', ponto: 4 },
    { texto: ', geralmente por cálculo.' },
  ];

  protected readonly faltou = 'pêntade de Reynolds';

  // Mesma expectativa da correção no app: apoio ao estudo, não a correção
  // oficial, e independência em relação à Afya.
  protected readonly disclaimer =
    'A Aurora é um apoio ao seu estudo: aponta a direção da resposta e os pontos esperados, não substitui a correção oficial. O BoraMed é uma plataforma independente, sem vínculo com a Afya.';

  constructor() {
    afterNextRender(() => this.corrigirQuandoAparecer());
    inject(DestroyRef).onDestroy(() => this.limpar());
  }

  protected corrigir(): void {
    this.limpar();
    this.estado.set('corrigindo');
    this.passo.set(0);
    this.notaExibida.set(0);

    for (let i = 1; i <= PASSOS; i++) {
      this.agendar(() => this.passo.set(i), ESPERA_INICIAL_MS + (i - 1) * INTERVALO_MS);
    }
    this.agendar(() => {
      this.estado.set('corrigida');
      this.contarNota();
    }, ESPERA_INICIAL_MS + PASSOS * INTERVALO_MS);
  }

  /**
   * O HTML do servidor já vem com a correção pronta. No browser, se o card
   * ainda está abaixo da dobra, ele volta para "aguardando" e corrige sozinho
   * quando aparece. Se já está na tela (link direto para #aurora), fica como está.
   */
  private corrigirQuandoAparecer(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const card = this.host.nativeElement.querySelector<HTMLElement>('.ac-card');
    if (!card || card.getBoundingClientRect().top < window.innerHeight) return;

    this.estado.set('aguardando');
    this.passo.set(0);
    this.notaExibida.set(0);
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.corrigir();
      },
      { threshold: 0.6 },
    );
    this.observer.observe(card);
  }

  /** Nota sobe de 0 até 90 com desaceleração no fim. */
  private contarNota(): void {
    const inicio = performance.now();
    const tick = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / CONTAGEM_MS);
      this.notaExibida.set(Math.round(NOTA * (1 - Math.pow(1 - t, 3))));
      this.frame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  private agendar(acao: () => void, atrasoMs: number): void {
    this.timers.push(setTimeout(acao, atrasoMs));
  }

  private limpar(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
