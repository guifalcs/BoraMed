import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, inject, isDevMode, signal } from '@angular/core';

/**
 * `static`: HTML do servidor ou antes do mount; nada escondido, nada preso.
 * `reduced`: o sistema pede movimento reduzido; a página fica como está.
 * `full`: rolagem dirige atos, camadas e revelações.
 */
export type ScrollMode = 'static' | 'reduced' | 'full';

/** Progresso do ato (0 a 1) e se ele está preso (`pin`) neste viewport. */
export type ActListener = (progress: number, pinned: boolean) => void;

interface Reveal {
  readonly el: HTMLElement;
  readonly from: number;
  readonly to: number;
  readonly origin: string;
  last: number;
}

interface Act {
  readonly el: HTMLElement;
  readonly wantsPin: boolean;
  readonly span: number;
  /** Altura mínima do viewport (px) para prender; abaixo disso o ato fica em fluxo. */
  readonly pinMin: number;
  readonly parallax: readonly { readonly el: HTMLElement; readonly rate: number }[];
  readonly reveals: readonly Reveal[];
  readonly listeners: Set<ActListener>;
  pinned: boolean;
  top: number;
  height: number;
  /** Progresso com a página no topo: zera o deslocamento das camadas na chegada. */
  origin: number;
  progress: number;
}

interface Spot {
  readonly el: HTMLElement;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

/**
 * Sob "reduzir movimento" o `styles.css` zera toda duração com `!important`.
 * Com `?motion=full` (só em dev) esta regra devolve as durações declaradas em
 * `--d` (animation) e `--t` (transition), que é como o movimento novo da
 * landing declara as suas. Serve para revisar o movimento em máquinas com as
 * animações do sistema desligadas.
 */
const FORCE_MOTION_CSS = `
@property --d { syntax: '<time>#'; inherits: false; initial-value: 0.01ms; }
@property --t { syntax: '<time>#'; inherits: false; initial-value: 0.01ms; }
@media (prefers-reduced-motion: reduce) {
  .sc-force-motion, .sc-force-motion *, .sc-force-motion *::before, .sc-force-motion *::after {
    animation-duration: var(--d) !important;
    transition-duration: var(--t) !important;
  }
}`;

/**
 * Runtime de rolagem da landing: o contrato `data-sc-*` do scroll-craft
 * (atos, `--sc-p`, camadas, revelações, contadores) reescrito para o Angular.
 * O motor original é um script global sem desmontagem; aqui a landing é uma
 * rota de SPA com SSR, então o runtime monta depois do primeiro render, roda
 * fora da zona e devolve tudo no destroy.
 *
 *   data-sc-act="pin|flow"       ato; publica `--sc-p` no próprio elemento
 *   data-sc-span="3.4"           viewports de rolagem de um ato `pin`
 *   data-sc-pin-min="600"        altura mínima do viewport para prender
 *   data-sc-parallax="-1.2"      camada: desloca `rate * 100px` ao longo do ato
 *   data-sc-reveal="iris"        abertura em círculo dirigida pelo ato
 *   data-sc-reveal-at="0.1 0.5"  janela da abertura no progresso do ato
 *   data-sc-reveal-origin        centro do círculo (padrão `50% 50%`)
 *   data-sc-in                   revela uma vez ao entrar na tela
 *   data-sc-stagger="60"         com `data-sc-in`: escalona os filhos (ms)
 *   data-sc-count="5000"         número que sobe até o valor ao entrar na tela
 *   data-sc-spotlight            publica `--sc-mx`/`--sc-my` (0 a 1) do ponteiro
 *
 * Sem JS, ou com movimento reduzido, nada disso roda e a página fica completa:
 * o estado escondido das revelações (`sc-wait`) só é aplicado pelo runtime.
 */
@Injectable()
export class LandingScroll {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  readonly mode = signal<ScrollMode>('static');

  private acts: Act[] = [];
  private spots: Spot[] = [];
  private readonly pending: { el: HTMLElement; fn: ActListener }[] = [];
  private readonly cleanups: (() => void)[] = [];
  private mounted = false;
  private viewportHeight = 0;
  private viewportWidth = 0;
  private scrollFrame = 0;
  private pointerFrame = 0;

  /**
   * @param root contêiner da página (onde vivem os `data-sc-*`).
   * @param host elemento do componente; só é marcado no modo `?motion=full`.
   */
  mount(root: HTMLElement, host: HTMLElement): void {
    const win = this.document.defaultView;
    if (!win || this.mounted) return;
    this.mounted = true;

    const systemReduces = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const forced =
      systemReduces && isDevMode() && new URLSearchParams(win.location.search).get('motion') === 'full';

    if (systemReduces && !forced) {
      this.mode.set('reduced');
      return;
    }

    if (forced) this.forceMotion(host);

    this.zone.runOutsideAngular(() => {
      this.collectActs(root);
      this.layout();
      this.setupEntrances(root);
      this.setupCounters(root, win);
      this.setupPointer(root, win);
      this.listen(root, win);
    });

    // Sinal para o harness de verificação do scroll-craft (`shoot.mjs`).
    this.document.documentElement.classList.add('sc-ready');
    this.cleanups.push(() => this.document.documentElement.classList.remove('sc-ready'));

    this.mode.set('full');
    for (const { el, fn } of this.pending.splice(0)) this.attach(el, fn);
  }

  /** Acompanha o progresso de um ato. Chama `fn` na hora com o estado atual. */
  watch(el: HTMLElement, fn: ActListener): () => void {
    if (this.mode() === 'full') {
      this.attach(el, fn);
    } else {
      this.pending.push({ el, fn });
    }
    return () => {
      this.acts.find((act) => act.el === el)?.listeners.delete(fn);
      const index = this.pending.findIndex((item) => item.fn === fn);
      if (index > -1) this.pending.splice(index, 1);
    };
  }

  /** Rola até o ponto `progress` de um ato preso. */
  scrollToProgress(el: HTMLElement, progress: number): void {
    const win = this.document.defaultView;
    const act = this.acts.find((item) => item.el === el);
    if (!win || !act || !act.pinned) return;
    const travel = Math.max(act.height - this.viewportHeight, 1);
    win.scrollTo({ top: act.top + travel * clamp01(progress), behavior: 'smooth' });
  }

  destroy(): void {
    const win = this.document.defaultView;
    if (win) {
      if (this.scrollFrame) win.cancelAnimationFrame(this.scrollFrame);
      if (this.pointerFrame) win.cancelAnimationFrame(this.pointerFrame);
    }
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.acts = [];
    this.spots = [];
    this.pending.length = 0;
  }

  private attach(el: HTMLElement, fn: ActListener): void {
    const act = this.acts.find((item) => item.el === el);
    if (!act) return;
    act.listeners.add(fn);
    fn(act.progress, act.pinned);
  }

  private forceMotion(host: HTMLElement): void {
    const style = this.document.createElement('style');
    style.textContent = FORCE_MOTION_CSS;
    this.document.head.appendChild(style);
    host.classList.add('sc-force-motion');
    this.cleanups.push(() => style.remove());
  }

  private collectActs(root: HTMLElement): void {
    this.acts = Array.from(root.querySelectorAll<HTMLElement>('[data-sc-act]')).map((el) => {
      const within = <T extends HTMLElement>(selector: string): T[] =>
        Array.from(el.querySelectorAll<T>(selector)).filter((node) => node.closest('[data-sc-act]') === el);

      return {
        el,
        wantsPin: el.dataset['scAct'] === 'pin',
        span: Number.parseFloat(el.dataset['scSpan'] ?? '') || 2,
        pinMin: Number.parseFloat(el.dataset['scPinMin'] ?? '') || 0,
        parallax: within('[data-sc-parallax]').map((layer) => ({
          el: layer,
          rate: Number.parseFloat(layer.dataset['scParallax'] ?? '') || 0,
        })),
        reveals: within('[data-sc-reveal]').map((node) => {
          const [from, to] = (node.dataset['scRevealAt'] ?? '0 0.5').trim().split(/\s+/).map(Number.parseFloat);
          return {
            el: node,
            from: from || 0,
            to: to || 0.5,
            origin: node.dataset['scRevealOrigin'] ?? '50% 50%',
            last: -1,
          };
        }),
        listeners: new Set<ActListener>(),
        pinned: false,
        top: 0,
        height: 0,
        origin: 0.5,
        progress: -1,
      };
    });
  }

  /** Mede os atos. Roda no mount, no resize e quando a altura da página muda. */
  private layout(): void {
    const win = this.document.defaultView;
    if (!win) return;
    this.viewportHeight = win.innerHeight;
    this.viewportWidth = win.innerWidth;

    for (const act of this.acts) {
      const pinned = act.wantsPin && this.viewportHeight >= act.pinMin;
      if (pinned !== act.pinned) {
        act.pinned = pinned;
        act.el.style.height = pinned ? `${act.span * 100}vh` : '';
        act.progress = -1;
      }
    }

    for (const act of this.acts) {
      const rect = act.el.getBoundingClientRect();
      act.top = rect.top + win.scrollY;
      act.height = rect.height;
      // Ato já visível com a página no topo (a hero): as camadas partem do
      // lugar em que foram desenhadas, em vez de já chegarem deslocadas.
      act.origin =
        act.top < this.viewportHeight
          ? clamp01((this.viewportHeight - act.top) / (act.height + this.viewportHeight))
          : 0.5;
      act.progress = -1;
    }

    this.read();
  }

  private read(): void {
    const win = this.document.defaultView;
    if (!win) return;
    const y = win.scrollY;
    const vh = this.viewportHeight;
    // No celular as camadas andam a metade: a tela é curta e o dedo é rápido.
    const travel = this.viewportWidth <= 860 ? 50 : 100;

    for (const act of this.acts) {
      const progress = act.pinned
        ? clamp01((y - act.top) / Math.max(act.height - vh, 1))
        : clamp01((y + vh - act.top) / (act.height + vh));
      if (progress === act.progress) continue;
      act.progress = progress;
      act.el.style.setProperty('--sc-p', progress.toFixed(4));

      for (const layer of act.parallax) {
        // `translate`, não `transform`: a camada fica livre para o CSS do
        // componente (entrada, resposta ao ponteiro) sem disputa de escrita.
        layer.el.style.translate = `0 ${(layer.rate * (progress - act.origin) * travel).toFixed(1)}px`;
      }

      for (const reveal of act.reveals) {
        const t = smooth((progress - reveal.from) / Math.max(reveal.to - reveal.from, 0.001));
        if (t === reveal.last) continue;
        reveal.last = t;
        reveal.el.style.clipPath = t >= 1 ? 'none' : `circle(${(t * 150).toFixed(2)}% at ${reveal.origin})`;
      }

      act.listeners.forEach((fn) => fn(progress, act.pinned));
    }
  }

  /**
   * Revelação de entrada, uma vez só. Só o que está abaixo da dobra no mount
   * recebe `sc-wait` (escondido); o que já está na tela nunca é tocado, então
   * o HTML do servidor não pisca. Ao entrar, `sc-wait` vira `sc-in` (animação).
   */
  private setupEntrances(root: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return;

    /** Com `data-sc-stagger` quem entra são os filhos, escalonados. */
    const pieces = (el: HTMLElement): { items: HTMLElement[]; stagger: number } => {
      const stagger = Number.parseFloat(el.dataset['scStagger'] ?? '');
      return Number.isNaN(stagger)
        ? { items: [el], stagger: 0 }
        : { items: Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement), stagger };
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const { items, stagger } = pieces(entry.target as HTMLElement);
          items.forEach((item, index) => {
            item.style.animationDelay = `${index * stagger}ms`;
            item.classList.replace('sc-wait', 'sc-in');
          });
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
    );

    root.querySelectorAll<HTMLElement>('[data-sc-in]').forEach((el) => {
      if (el.getBoundingClientRect().top < this.viewportHeight * 0.88) return;
      pieces(el).items.forEach((item) => item.classList.add('sc-wait'));
      observer.observe(el);
    });
    this.cleanups.push(() => observer.disconnect());
  }

  /**
   * Contador de entrada: o texto do servidor já traz o valor final (por
   * exemplo "5.000+"); o runtime só anima a parte numérica, e só para o que
   * está abaixo da dobra no mount, para o número visível não voltar a zero.
   */
  private setupCounters(root: HTMLElement, win: Window): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const format = new Intl.NumberFormat('pt-BR');

    const run = (el: HTMLElement): void => {
      const target = Number.parseFloat(el.dataset['scCount'] ?? '');
      const node = Array.from(el.childNodes).find((child) => child.nodeType === Node.TEXT_NODE);
      const text = node?.nodeValue ?? '';
      const at = text.lastIndexOf(format.format(target));
      if (!node || Number.isNaN(target) || at < 0) return;

      const prefix = text.slice(0, at);
      const suffix = text.slice(at + format.format(target).length);
      const start = win.performance.now();
      const duration = 1400;
      let last = '';

      const frame = (now: number): void => {
        const t = Math.min((now - start) / duration, 1);
        const value = format.format(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (value !== last) {
          last = value;
          node.nodeValue = prefix + value + suffix;
        }
        if (t < 1) handle = win.requestAnimationFrame(frame);
      };
      let handle = win.requestAnimationFrame(frame);
      this.cleanups.push(() => win.cancelAnimationFrame(handle));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          run(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.5 },
    );
    root.querySelectorAll<HTMLElement>('[data-sc-count]').forEach((el) => {
      if (el.getBoundingClientRect().top >= this.viewportHeight) observer.observe(el);
    });
    this.cleanups.push(() => observer.disconnect());
  }

  /**
   * Ponteiro como profundidade: publica a posição (0 a 1) em `--sc-mx` e
   * `--sc-my`, interpolada para ter peso. Só com mouse; o laço para quando o
   * valor assenta.
   */
  private setupPointer(root: HTMLElement, win: Window): void {
    if (!win.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    this.spots = Array.from(root.querySelectorAll<HTMLElement>('[data-sc-spotlight]')).map((el) => ({
      el,
      x: 0.5,
      y: 0.5,
      targetX: 0.5,
      targetY: 0.5,
    }));
    if (!this.spots.length) return;

    const tick = (): void => {
      let moving = false;
      for (const spot of this.spots) {
        spot.x += (spot.targetX - spot.x) * 0.09;
        spot.y += (spot.targetY - spot.y) * 0.09;
        if (Math.abs(spot.targetX - spot.x) > 0.001 || Math.abs(spot.targetY - spot.y) > 0.001) moving = true;
        spot.el.style.setProperty('--sc-mx', spot.x.toFixed(3));
        spot.el.style.setProperty('--sc-my', spot.y.toFixed(3));
      }
      this.pointerFrame = moving ? win.requestAnimationFrame(tick) : 0;
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      for (const spot of this.spots) {
        const rect = spot.el.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < this.viewportHeight;
        // Responde numa área maior que o elemento: o mundo se mexe quando a
        // pessoa se aproxima, não só quando passa por cima.
        spot.targetX = visible ? clamp01((event.clientX - rect.left + rect.width / 2) / (rect.width * 2)) : 0.5;
        spot.targetY = visible ? clamp01((event.clientY - rect.top + rect.height / 2) / (rect.height * 2)) : 0.5;
      }
      if (!this.pointerFrame) this.pointerFrame = win.requestAnimationFrame(tick);
    };

    win.addEventListener('pointermove', onMove, { passive: true });
    this.cleanups.push(() => win.removeEventListener('pointermove', onMove));
  }

  private listen(root: HTMLElement, win: Window): void {
    const onScroll = (): void => {
      if (this.scrollFrame) return;
      this.scrollFrame = win.requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.read();
      });
    };

    const onResize = (): void => {
      // No celular a barra de endereço muda só a altura: reposicionar tudo
      // nessa hora faz a página pular debaixo do dedo.
      if (win.innerWidth === this.viewportWidth && win.matchMedia('(pointer: coarse)').matches) {
        this.viewportHeight = win.innerHeight;
        return;
      }
      this.layout();
    };

    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('resize', onResize, { passive: true });
    this.cleanups.push(() => {
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onResize);
    });

    // Quiz, FAQ e gabaritos recentes mudam a altura da página depois do mount
    // e empurram os atos de baixo; sem remedir, o progresso sai do lugar.
    if (typeof ResizeObserver === 'undefined') return;
    let height = root.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (root.offsetHeight === height) return;
      height = root.offsetHeight;
      this.layout();
    });
    observer.observe(root);
    this.cleanups.push(() => observer.disconnect());
  }
}
