import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ArrowRight, Check, Lock, RotateCcw, X } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

interface DemoQuizOption {
  readonly letter: 'A' | 'B' | 'C' | 'D';
  readonly text: string;
}

interface DemoQuizQuestion {
  readonly id: string;
  readonly topic: string;
  readonly statement: string;
  readonly options: readonly DemoQuizOption[];
  readonly correctIndex: number;
  readonly explanation: string;
}

// Questões reais do banco de questões do BoraMed (tabela `questao`, tipo
// processual, status ativa), escolhidas entre as mais respondidas e com
// alternativas completas — não são exemplos escritos para a demo.
// ids de origem: 37781255-87c0-44c6-8cfb-224ab3c16328,
// dcc06d15-27f4-4d1f-824c-fe9ed144dc19, 9001e8a0-9319-417f-a0f5-483f096c9763.
const DEMO_QUESTIONS: readonly DemoQuizQuestion[] = [
  {
    id: 'demo-cardio',
    topic: 'Cardiologia',
    statement:
      'Um professor de anatomia apresenta aos alunos um esquema da face posterior do coração e destaca o seio coronário, explicando sua importância como principal estrutura de drenagem venosa cardíaca. Um aluno pergunta quais são as tributárias do seio coronário e quais territórios miocárdicos elas drenam. Qual das alternativas a seguir descreve corretamente as principais veias tributárias do seio coronário e seus territórios de drenagem?',
    options: [
      {
        letter: 'A',
        text: 'A veia cardíaca magna drena a face anterior do coração (territórios da artéria descendente anterior); a veia cardíaca média drena a face inferior (território da artéria descendente posterior); e a veia cardíaca pequena drena a face direita (território marginal da coronária direita), todas desembocando no seio coronário, que drena para o átrio direito.',
      },
      {
        letter: 'B',
        text: 'A veia cardíaca magna drena exclusivamente o ventrículo direito; a veia cardíaca média drena o septo interventricular; e a veia cardíaca pequena drena os átrios, todas desembocando no seio coronário, que drena para o ventrículo direito durante a diástole.',
      },
      {
        letter: 'C',
        text: 'A veia de Tebesio drena a maior parte do miocárdio ventricular esquerdo diretamente para o interior das câmaras cardíacas, sendo a principal via de drenagem venosa cardíaca, enquanto o seio coronário drena apenas a periferia epicárdica do coração.',
      },
      {
        letter: 'D',
        text: 'O seio coronário é formado pela confluência das veias pulmonares e das veias cardíacas, drenando sangue misto (venoso cardíaco e oxigenado pulmonar) para o átrio esquerdo, onde se mistura ao sangue das veias pulmonares.',
      },
    ],
    correctIndex: 0,
    explanation:
      'O sistema venoso cardíaco é composto principalmente por: veia cardíaca magna, que drena a face anterior e lateral do coração (territórios da descendente anterior e circunflexa); veia cardíaca média, que drena a face inferior; e veia cardíaca pequena, que drena a face direita. Todas convergem para o seio coronário, que desemboca no átrio direito.',
  },
  {
    id: 'demo-pneumo',
    topic: 'Pneumologia',
    statement:
      'Em uma aula de fisiologia integrada sobre os mecanismos protetores das vias aéreas, o professor descreve o reflexo da tosse como uma das respostas mais eficazes do organismo para expulsar corpos estranhos e secreções das vias aéreas. Ele divide o mecanismo da tosse em suas etapas sequenciais e questiona os alunos sobre qual fase é a responsável pela geração da força expulsiva que desloca o material retido nas vias aéreas durante esse reflexo.',
    options: [
      {
        letter: 'A',
        text: 'A fase expulsiva da tosse é gerada pela abertura súbita da glote após uma inspiração profunda, que cria uma onda de pressão negativa intrapulmonar capaz de aspirar corpos estranhos das vias inferiores em direção à laringe, onde são então expelidos.',
      },
      {
        letter: 'B',
        text: 'A força expulsiva da tosse resulta da contração coordenada dos músculos elevadores da laringe, que comprimem a traqueia por pressão extrínseca e expelem as secreções pela elevação mecânica da árvore traqueobrônquica em direção à faringe.',
      },
      {
        letter: 'C',
        text: 'A tosse envolve uma inspiração inicial, seguida de fechamento glótico com contração intensa da musculatura expiratória que eleva a pressão intratorácica, e então abertura súbita da glote com liberação de fluxo aéreo de alta velocidade que arrasta secreções e corpos estranhos das vias aéreas.',
      },
      {
        letter: 'D',
        text: 'A tosse é gerada exclusivamente pela contração do músculo diafragma em sentido inverso ao habitual, que empurra o ar dos pulmões para as vias aéreas superiores sem necessidade de fechamento glótico ou elevação prévia da pressão intratorácica.',
      },
    ],
    correctIndex: 2,
    explanation:
      'O reflexo da tosse ocorre em três fases: inspiratória (inspiração profunda), compressiva (glote fechada com contração intensa da musculatura expiratória, elevando a pressão intratorácica) e expulsiva (abertura súbita da glote, liberando fluxo aéreo de alta velocidade que arrasta secreções e corpos estranhos).',
  },
  {
    id: 'demo-imuno',
    topic: 'Imunologia',
    statement:
      'Integrando os conceitos estudados, considere o seguinte cenário didático: um professor apresenta quatro situações que ilustram, cada uma, um mecanismo distinto de hipersensibilidade, e pede aos alunos que relacionem cada situação ao tipo correto e ao seu mediador. Qual alternativa relaciona corretamente os quatro tipos de hipersensibilidade aos seus respectivos mecanismos?',
    options: [
      {
        letter: 'A',
        text: 'Uma reação imediata a pólen mediada por linfócitos T; uma reação contra antígenos de superfície celular mediada por IgE; uma reação por imunocomplexos mediada por mastócitos; uma reação tardia mediada por IgG.',
      },
      {
        letter: 'B',
        text: 'Uma reação imediata a pólen mediada por imunocomplexos; uma reação contra antígenos de superfície celular mediada por linfócitos T; uma reação por deposição de complexos mediada por IgE; uma reação tardia mediada por IgM.',
      },
      {
        letter: 'C',
        text: 'Uma reação imediata a pólen mediada por IgG contra antígenos solúveis; uma reação contra antígenos de superfície celular mediada por imunocomplexos; uma reação por deposição mediada por linfócitos T; uma reação tardia mediada por mastócitos.',
      },
      {
        letter: 'D',
        text: 'Uma reação imediata a pólen mediada por IgE e mastócitos (tipo I); uma reação contra antígenos de superfície celular mediada por IgG e IgM (tipo II); uma reação por deposição de imunocomplexos circulantes (tipo III); uma reação tardia mediada por linfócitos T e macrófagos (tipo IV).',
      },
    ],
    correctIndex: 3,
    explanation:
      'O tipo I é mediado por IgE fixada a mastócitos, com resposta imediata (minutos). O tipo II envolve IgG/IgM contra antígenos de superfície celular, com dano por complemento e citotoxicidade. O tipo III é causado por imunocomplexos circulantes que se depositam em tecidos. O tipo IV é uma reação tardia mediada por linfócitos T que recrutam macrófagos, sem participação de anticorpos.',
  },
];

@Component({
  selector: 'app-landing-demo-quiz',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './landing-demo-quiz.component.html',
  styleUrls: ['./landing-demo-quiz.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingDemoQuizComponent {
  protected readonly checkIcon = Check;
  protected readonly xIcon = X;
  protected readonly lockIcon = Lock;
  protected readonly arrowRightIcon = ArrowRight;
  protected readonly restartIcon = RotateCcw;

  protected readonly questions = DEMO_QUESTIONS;

  protected readonly currentIndex = signal(0);
  protected readonly answers = signal<readonly number[]>([]);
  protected readonly currentAnswer = signal<number | null>(null);
  protected readonly finished = signal(false);

  protected readonly currentQuestion = computed(() => this.questions[this.currentIndex()]);
  protected readonly isLastQuestion = computed(
    () => this.currentIndex() === this.questions.length - 1,
  );
  protected readonly answeredCorrectly = computed(
    () => this.currentAnswer() === this.currentQuestion().correctIndex,
  );
  protected readonly score = computed(
    () => this.answers().filter((answer, i) => answer === this.questions[i].correctIndex).length,
  );
  protected readonly missedTopics = computed(() =>
    this.questions
      .filter((question, i) => this.answers()[i] !== question.correctIndex)
      .map((question) => question.topic),
  );

  protected selectOption(index: number): void {
    if (this.currentAnswer() !== null) return;
    this.currentAnswer.set(index);
  }

  protected next(): void {
    const answer = this.currentAnswer();
    if (answer === null) return;

    this.answers.update((answers) => [...answers, answer]);
    this.currentAnswer.set(null);

    if (this.isLastQuestion()) {
      this.finished.set(true);
    } else {
      this.currentIndex.update((index) => index + 1);
    }
  }

  protected restart(): void {
    this.currentIndex.set(0);
    this.answers.set([]);
    this.currentAnswer.set(null);
    this.finished.set(false);
  }
}
