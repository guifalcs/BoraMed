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

// TODO(boramed-team): substituir pelas 3 questões autorais REAIS (validadas pelo
// time de conteúdo) antes de publicar. As questões abaixo são exemplos de
// estrutura e nível de cobrança — não passaram por revisão de conteúdo.
const DEMO_QUESTIONS: readonly DemoQuizQuestion[] = [
  {
    id: 'demo-cardio',
    topic: 'Cardiologia',
    statement:
      'Paciente de 58 anos, hipertenso, chega ao pronto atendimento com dor torácica em aperto há 40 minutos, irradiando para o membro superior esquerdo, associada a sudorese. O ECG mostra supradesnivelamento do segmento ST em DII, DIII e aVF. Qual parede ventricular está mais provavelmente acometida?',
    options: [
      { letter: 'A', text: 'Parede anterior' },
      { letter: 'B', text: 'Parede inferior' },
      { letter: 'C', text: 'Parede lateral alta' },
      { letter: 'D', text: 'Parede septal' },
    ],
    correctIndex: 1,
    explanation:
      'DII, DIII e aVF exploram a parede inferior do ventrículo esquerdo. Supradesnivelamento de ST nessas derivações indica infarto de parede inferior, geralmente por oclusão da coronária direita.',
  },
  {
    id: 'demo-farmaco',
    topic: 'Farmacologia',
    statement:
      'Sobre o mecanismo de ação dos inibidores da bomba de prótons, como o omeprazol, é correto afirmar que eles atuam por meio de:',
    options: [
      { letter: 'A', text: 'Bloqueio dos receptores H2 da histamina nas células parietais' },
      { letter: 'B', text: 'Neutralização direta do ácido clorídrico na luz gástrica' },
      { letter: 'C', text: 'Inibição irreversível da H+/K+-ATPase nas células parietais' },
      { letter: 'D', text: 'Estímulo da secreção de muco e bicarbonato pela mucosa' },
    ],
    correctIndex: 2,
    explanation:
      'Os inibidores da bomba de prótons inibem de forma irreversível a H+/K+-ATPase, etapa final da secreção ácida — por isso são mais potentes que os antagonistas H2, que atuam em uma via a montante.',
  },
  {
    id: 'demo-anato',
    topic: 'Anatomia',
    statement:
      'Após uma tireoidectomia total, a paciente evolui no pós-operatório imediato com rouquidão persistente. Qual estrutura foi mais provavelmente lesada durante o procedimento?',
    options: [
      { letter: 'A', text: 'Nervo frênico' },
      { letter: 'B', text: 'Nervo hipoglosso' },
      { letter: 'C', text: 'Alça cervical' },
      { letter: 'D', text: 'Nervo laríngeo recorrente' },
    ],
    correctIndex: 3,
    explanation:
      'O nervo laríngeo recorrente inerva quase todos os músculos intrínsecos da laringe e tem relação íntima com a glândula tireoide — sua lesão em tireoidectomias causa paralisia de prega vocal e rouquidão.',
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
