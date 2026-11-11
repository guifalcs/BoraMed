import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { NotebookPen, Timer, TrendingUp } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { LandingScroll } from './landing-scroll.service';

type EtapaId = 'treinar' | 'revisar' | 'acompanhar';
type EstadoCelula = 'blank' | 'marked' | 'right' | 'wrong';

interface Etapa {
  readonly id: EtapaId;
  readonly titulo: string;
  readonly resumo: string;
  /** Ponto do ato em que a etapa está "pronta" (alvo do clique na aba). */
  readonly alvo: number;
}

interface Questao {
  readonly tema: number;
  readonly letra: string;
  readonly certa: boolean;
}

interface Caixa {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const TEMAS = ['Anatomia', 'Cardiovascular', 'Farmacologia'] as const;

// Treino de exemplo: 20 questões, 14 acertos. Por tema: Anatomia 3 de 7,
// Cardiovascular 5 de 6, Farmacologia 6 de 7. As barras do diagnóstico são
// feitas destas mesmas 20 células, então as contas precisam fechar.
const QUESTOES: readonly Questao[] = [
  { tema: 0, letra: 'C', certa: true },
  { tema: 1, letra: 'A', certa: true },
  { tema: 2, letra: 'D', certa: true },
  { tema: 0, letra: 'B', certa: false },
  { tema: 1, letra: 'E', certa: true },
  { tema: 2, letra: 'A', certa: true },
  { tema: 0, letra: 'B', certa: false },
  { tema: 2, letra: 'D', certa: true },
  { tema: 1, letra: 'C', certa: false },
  { tema: 0, letra: 'A', certa: true },
  { tema: 2, letra: 'E', certa: false },
  { tema: 1, letra: 'B', certa: true },
  { tema: 0, letra: 'D', certa: false },
  { tema: 2, letra: 'C', certa: true },
  { tema: 0, letra: 'A', certa: false },
  { tema: 1, letra: 'B', certa: true },
  { tema: 2, letra: 'E', certa: true },
  { tema: 0, letra: 'D', certa: true },
  { tema: 2, letra: 'C', certa: true },
  { tema: 1, letra: 'A', certa: true },
];

/** A cena começa com a prova em andamento, na questão 8 (a mesma da hero). */
const JA_RESPONDIDAS = 7;

// Nota (%) das últimas tentativas; a última é a do treino da cena (14 de 20).
const NOTAS = [48, 52, 50, 57, 55, 62, 66, 70] as const;
const CHART = { largura: 320, altura: 120, margem: 10 } as const;

const DURACAO_TROCA_MS = 900;
/** Altura do arco que a célula faz no voo, em px. */
const ARCO = 18;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Trecho `[de, ate]` do progresso remapeado para 0 a 1. */
const trecho = (p: number, de: number, ate: number): number => clamp01((p - de) / (ate - de));
const suave = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const desacelera = (t: number): number => 1 - Math.pow(1 - t, 3);

const pontoDoGrafico = (nota: number, indice: number): { x: number; y: number } => ({
  x: CHART.margem + (indice / (NOTAS.length - 1)) * (CHART.largura - CHART.margem * 2),
  y: CHART.altura - CHART.margem - ((nota - 40) / 50) * (CHART.altura - CHART.margem * 2),
});

/**
 * "Como funciona" (#como-funciona): o pico da página. Uma prova de 20
 * questões é respondida, corrigida, vira o desempenho por tema e, por fim, o
 * último ponto da curva de evolução. São sempre as mesmas 20 células: elas
 * saem do cartão-resposta, viram os segmentos das barras e convergem no
 * gráfico.
 *
 * Com movimento completo a seção fica presa e a rolagem dirige a cena (ato
 * `pin` do `LandingScroll`). Com movimento reduzido, sem JS ou em telas
 * baixas demais para prender, as três etapas são abas: o clique leva a cena
 * ao estado da etapa. Nos dois modos quem desenha é `render(p)`.
 */
@Component({
  selector: 'app-landing-ciclo',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './landing-ciclo.component.html',
  styleUrls: ['./landing-shared.css', './landing-ciclo.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingCicloComponent {
  private readonly scroll = inject(LandingScroll);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);

  private readonly ato = viewChild.required<ElementRef<HTMLElement>>('ato');
  private readonly cena = viewChild.required<ElementRef<HTMLElement>>('cena');
  private readonly celulas = viewChildren<ElementRef<HTMLElement>>('celula');
  private readonly vagas = viewChildren<ElementRef<HTMLElement>>('vaga');
  private readonly titulos = viewChildren<ElementRef<HTMLElement>>('titulo');
  private readonly barra = viewChild.required<ElementRef<HTMLElement>>('barra');
  private readonly contador = viewChild.required<ElementRef<HTMLElement>>('contador');
  private readonly diagnostico = viewChild.required<ElementRef<HTMLElement>>('diagnostico');
  private readonly caderno = viewChild.required<ElementRef<HTMLElement>>('caderno');
  private readonly evolucao = viewChild.required<ElementRef<HTMLElement>>('evolucao');
  private readonly grafico = viewChild.required<ElementRef<SVGSVGElement>>('grafico');
  private readonly linha = viewChild.required<ElementRef<SVGPolylineElement>>('linha');
  private readonly area = viewChild.required<ElementRef<SVGPolygonElement>>('area');
  private readonly ponto = viewChild.required<ElementRef<SVGCircleElement>>('ponto');
  private readonly resumoEvolucao = viewChild.required<ElementRef<HTMLElement>>('resumoEvolucao');

  protected readonly timerIcon = Timer;
  protected readonly cadernoIcon = NotebookPen;
  protected readonly trendIcon = TrendingUp;

  protected readonly etapas: readonly Etapa[] = [
    {
      id: 'treinar',
      titulo: 'Treinar',
      resumo:
        'Simulado cronometrado, como no dia da prova, ou modo estudo, com gabarito a cada questão. Parou no meio? Retome de onde estava.',
      alvo: 0.24,
    },
    {
      id: 'revisar',
      titulo: 'Revisar',
      resumo:
        'Nota e temas críticos na hora. Cada erro vai para o Caderno de Erros, e as discursivas voltam corrigidas pela Aurora.',
      alvo: 0.6,
    },
    {
      id: 'acompanhar',
      titulo: 'Acompanhar',
      resumo:
        'Histórico de cada tentativa, evolução da nota e sua sequência de estudo, com ranking entre estudantes.',
      alvo: 1,
    },
  ];

  protected readonly questoes = QUESTOES;
  protected readonly total = QUESTOES.length;
  protected readonly acertos = QUESTOES.filter((questao) => questao.certa).length;
  protected readonly erros = this.total - this.acertos;
  protected readonly nota = Math.round((this.acertos / this.total) * 100);
  protected readonly ganho = NOTAS[NOTAS.length - 1] - NOTAS[0];
  protected readonly tentativas = NOTAS.length;

  // Cada tema lista as suas questões com os acertos na frente: é a ordem em
  // que as células se encaixam na barra (parte cheia, depois o que faltou).
  protected readonly temas = TEMAS.map((nome, tema) => {
    const indices = QUESTOES.map((_, i) => i).filter((i) => QUESTOES[i].tema === tema);
    const certas = indices.filter((i) => QUESTOES[i].certa);
    return {
      nome,
      acertos: certas.length,
      total: indices.length,
      pct: Math.round((certas.length / indices.length) * 100),
      vagas: [...certas, ...indices.filter((i) => !QUESTOES[i].certa)],
    };
  });

  /** Para cada questão, a posição da sua vaga na lista de vagas do template. */
  private readonly vagaDaQuestao = (() => {
    const ordem = this.temas.flatMap((tema) => tema.vagas);
    return QUESTOES.map((_, i) => ordem.indexOf(i));
  })();

  protected readonly viewBox = `0 0 ${CHART.largura} ${CHART.altura}`;
  protected readonly gradeY = [CHART.margem, CHART.altura / 2, CHART.altura - CHART.margem];
  protected readonly gradeX2 = CHART.largura - CHART.margem;
  protected readonly gradeX1 = CHART.margem;
  private readonly pontos = NOTAS.map(pontoDoGrafico);
  protected readonly linhaEvolucao = this.pontos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  protected readonly areaEvolucao =
    `${CHART.margem},${CHART.altura - CHART.margem} ${this.linhaEvolucao} ` +
    `${CHART.largura - CHART.margem},${CHART.altura - CHART.margem}`;
  protected readonly ultimoPonto = this.pontos[this.pontos.length - 1];

  // Sequência de estudo: últimos 14 dias.
  protected readonly diasEstudados = [
    true, true, false, true, true, true, false,
    true, true, true, true, true, true, true,
  ] as const;
  protected readonly sequenciaAtual = (() => {
    let dias = 0;
    for (let i = this.diasEstudados.length - 1; i >= 0 && this.diasEstudados[i]; i--) dias++;
    return dias;
  })();

  protected readonly descricaoCena =
    `Exemplo de um treino de ${this.total} questões: a prova é respondida, corrigida ` +
    `(${this.acertos} acertos), vira o desempenho por tema (${this.temas
      .map((tema) => `${tema.nome} ${tema.pct}%`)
      .join(', ')}) e entra na curva de evolução da nota.`;

  protected readonly ativa = signal<EtapaId>('treinar');
  protected readonly etapaAtiva = computed(
    () => this.etapas.find((etapa) => etapa.id === this.ativa()) ?? this.etapas[0],
  );
  /** Seção presa: a rolagem dirige a cena e as abas viram atalhos de rolagem. */
  protected readonly pinned = signal(false);

  private progresso = this.etapas[0].alvo;
  private caixas: { celulas: Caixa[]; vagas: Caixa[]; ponto: { x: number; y: number } } | null = null;
  private readonly estados: EstadoCelula[] = QUESTOES.map(() => 'marked');
  private atual = -1;
  private rotulo = '';
  private quadro = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const win = this.document.defaultView;
      if (!win) return;

      this.zone.runOutsideAngular(() => {
        this.medir();
        this.render(this.progresso);

        const parar = this.scroll.watch(this.ato().nativeElement, (progress, pinned) => {
          if (pinned !== this.pinned()) {
            this.pinned.set(pinned);
            // A troca de modo muda o layout: mede de novo no quadro seguinte.
            win.requestAnimationFrame(() => {
              this.medir();
              this.render(pinned ? progress : this.etapaAtiva().alvo);
            });
          }
          if (pinned) this.render(progress);
        });

        const observer = new ResizeObserver(() => {
          this.medir();
          this.render(this.progresso);
        });
        observer.observe(this.cena().nativeElement);

        destroyRef.onDestroy(() => {
          parar();
          observer.disconnect();
          if (this.quadro) win.cancelAnimationFrame(this.quadro);
        });
      });
    });
  }

  protected selecionar(etapa: Etapa): void {
    if (this.pinned()) {
      this.scroll.scrollToProgress(this.ato().nativeElement, etapa.alvo === 1 ? 0.97 : etapa.alvo);
      return;
    }
    this.ativa.set(etapa.id);
    this.irPara(etapa.alvo);
  }

  /** Setas, Home e End entre as abas (padrão WAI-ARIA de tabs). */
  protected onKeydown(event: KeyboardEvent, index: number): void {
    const total = this.etapas.length;
    let proximo: number;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        proximo = (index + 1) % total;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        proximo = (index - 1 + total) % total;
        break;
      case 'Home':
        proximo = 0;
        break;
      case 'End':
        proximo = total - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selecionar(this.etapas[proximo]);
    const abas = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(
      '[role="tab"]',
    );
    abas?.[proximo]?.focus();
  }

  /** Fora do modo preso: leva a cena até o estado da etapa. */
  private irPara(alvo: number): void {
    const win = this.document.defaultView;
    if (!win) return;
    if (this.quadro) win.cancelAnimationFrame(this.quadro);
    this.quadro = 0;

    if (this.scroll.mode() !== 'full') {
      this.render(alvo);
      return;
    }

    const de = this.progresso;
    const inicio = win.performance.now();
    this.zone.runOutsideAngular(() => {
      const passo = (agora: number): void => {
        const t = Math.min((agora - inicio) / DURACAO_TROCA_MS, 1);
        this.render(lerp(de, alvo, suave(t)));
        this.quadro = t < 1 ? win.requestAnimationFrame(passo) : 0;
      };
      this.quadro = win.requestAnimationFrame(passo);
    });
  }

  /**
   * Mede onde cada célula está no cartão (posição natural), onde fica a sua
   * vaga na barra do tema e onde cai o último ponto do gráfico. O voo é a
   * diferença entre essas caixas, então a cena acompanha qualquer largura.
   */
  private medir(): void {
    const celulas = this.celulas().map((ref) => ref.nativeElement);
    celulas.forEach((el) => (el.style.transform = 'none'));

    const caixa = (el: Element): Caixa => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const svg = caixa(this.grafico().nativeElement);

    this.caixas = {
      celulas: celulas.map(caixa),
      vagas: this.vagas().map((ref) => caixa(ref.nativeElement)),
      ponto: {
        x: svg.x + (this.ultimoPonto.x / CHART.largura) * svg.w,
        y: svg.y + (this.ultimoPonto.y / CHART.altura) * svg.h,
      },
    };
  }

  /** Desenha a cena no ponto `p` (0 a 1) da história. */
  private render(p: number): void {
    this.progresso = p;
    const caixas = this.caixas;
    if (!caixas || !caixas.celulas.length) return;

    const total = this.total;
    const marcacao = trecho(p, 0.03, 0.24);
    const correcao = trecho(p, 0.27, 0.36);
    const barras = trecho(p, 0.38, 0.56);
    const convergencia = trecho(p, 0.66, 0.8);

    const marcadas = JA_RESPONDIDAS + Math.round(marcacao * (total - JA_RESPONDIDAS));
    const corrigidas = Math.round(correcao * total);
    const sai = 1 - trecho(p, 0.64, 0.7);

    this.celulas().forEach((ref, i) => {
      const el = ref.nativeElement;
      const estado: EstadoCelula =
        i < corrigidas ? (QUESTOES[i].certa ? 'right' : 'wrong') : i < marcadas ? 'marked' : 'blank';
      if (estado !== this.estados[i]) {
        this.estados[i] = estado;
        el.dataset['s'] = estado;
      }

      const natural = caixas.celulas[i];
      const vaga = caixas.vagas[this.vagaDaQuestao[i]];
      // Cada célula sai um pouco depois da anterior da mesma barra.
      const voo = suave(trecho(barras, (this.vagaDaQuestao[i] / total) * 0.5, (this.vagaDaQuestao[i] / total) * 0.5 + 0.5));
      const queda = suave(trecho(convergencia, (i / total) * 0.4, (i / total) * 0.4 + 0.6));

      let x = lerp(natural.x, vaga.x, voo);
      let y = lerp(natural.y, vaga.y, voo) - Math.sin(Math.PI * voo) * ARCO;
      let w = lerp(natural.w, vaga.w, voo);
      let h = lerp(natural.h, vaga.h, voo);
      if (queda > 0) {
        x = lerp(x, caixas.ponto.x - 4, queda);
        y = lerp(y, caixas.ponto.y - 4, queda) - Math.sin(Math.PI * queda) * ARCO * 0.6;
        w = lerp(w, 8, queda);
        h = lerp(h, 8, queda);
      }

      el.style.transform =
        voo === 0 && queda === 0
          ? 'none'
          : `translate3d(${(x - natural.x).toFixed(1)}px,${(y - natural.y).toFixed(1)}px,0) ` +
            `scale(${(w / natural.w).toFixed(4)},${(h / natural.h).toFixed(4)})`;
      el.style.opacity = (1 - trecho(queda, 0.7, 1)).toFixed(3);
      el.style.setProperty('--texto', (1 - clamp01(voo * 3)).toFixed(3));
    });

    // Anel na questão da vez enquanto a prova está sendo respondida.
    const atual = marcadas < total && corrigidas === 0 ? marcadas : -1;
    if (atual !== this.atual) {
      this.celulas()[this.atual]?.nativeElement.classList.remove('is-current');
      this.celulas()[atual]?.nativeElement.classList.add('is-current');
      this.atual = atual;
    }

    const rotulo = `Questão ${Math.min(marcadas + 1, total)} de ${total}`;
    if (rotulo !== this.rotulo) {
      this.rotulo = rotulo;
      this.contador().nativeElement.textContent = rotulo;
    }

    const emProva = 1 - trecho(p, 0.27, 0.32);
    const [tituloProva, tituloResultado, tituloEvolucao] = this.titulos().map((ref) => ref.nativeElement);
    tituloProva.style.opacity = emProva.toFixed(3);
    tituloResultado.style.opacity = (trecho(p, 0.31, 0.36) * sai).toFixed(3);
    tituloEvolucao.style.opacity = trecho(p, 0.68, 0.74).toFixed(3);

    const barra = this.barra().nativeElement;
    barra.style.transform = `scaleX(${(marcadas / total).toFixed(3)})`;
    barra.style.opacity = emProva.toFixed(3);

    this.diagnostico().nativeElement.style.opacity = (trecho(p, 0.4, 0.5) * sai).toFixed(3);
    this.caderno().nativeElement.style.opacity = (trecho(p, 0.52, 0.58) * sai).toFixed(3);

    const desenho = desacelera(trecho(p, 0.7, 0.9));
    this.evolucao().nativeElement.style.opacity = trecho(p, 0.68, 0.76).toFixed(3);
    this.linha().nativeElement.style.strokeDashoffset = (1 - desenho).toFixed(4);
    this.area().nativeElement.style.opacity = trecho(p, 0.8, 0.92).toFixed(3);
    this.ponto().nativeElement.style.transform = `scale(${desacelera(trecho(p, 0.8, 0.87)).toFixed(3)})`;
    this.resumoEvolucao().nativeElement.style.opacity = trecho(p, 0.86, 0.94).toFixed(3);

    if (this.pinned()) {
      const etapa = p < 0.3 ? 'treinar' : p < 0.67 ? 'revisar' : 'acompanhar';
      if (etapa !== this.ativa()) this.ativa.set(etapa);
    }

    // Assinatura do que está pintado, para o harness de verificação distinguir
    // rolagem que muda a cena de rolagem morta. Os dois descansos são autorais.
    const cena = this.cena().nativeElement;
    cena.dataset['scVerifyState'] =
      `${marcadas}|${corrigidas}|${barras.toFixed(2)}|${convergencia.toFixed(2)}|${desenho.toFixed(2)}`;
    cena.dataset['scVerifyHold'] = String((p > 0.58 && p < 0.64) || p > 0.94);
  }
}
