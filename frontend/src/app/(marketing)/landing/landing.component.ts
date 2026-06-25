import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  OnDestroy,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';
import { SITE_URL } from '../../core/seo/seo.config';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  LineChart,
  Menu,
  Route,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  Timer,
  X,
} from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

interface NavItem {
  readonly label: string;
  readonly href: string;
}

interface TrainingMode {
  readonly title: string;
  readonly description: string;
  readonly badge: string;
  readonly icon: LucideIconData;
  readonly variant: 'national' | 'process' | 'lab';
  readonly image?: {
    readonly src: string;
    readonly alt: string;
    readonly width: number;
    readonly height: number;
  };
}

interface SolutionTab {
  readonly id: 'treinar' | 'revisar' | 'acompanhar';
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly icon: LucideIconData;
}

interface TimelineStep {
  readonly label: string;
  readonly title: string;
  readonly points: readonly string[];
  readonly icon: LucideIconData;
}

interface Capability {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIconData;
}

interface PricingPlan {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly price: string;
  readonly period: string;
  readonly note?: string;
  readonly economy?: string;
  readonly features: readonly string[];
  readonly featured: boolean;
}

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './landing.component.html',
  styleUrls: [
    './landing.component.css',
    './landing-intelligence.component.css',
    './landing-pricing.component.css',
    './landing-bento.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnDestroy {
  private readonly seo = inject(SeoService);
  private readonly zone = inject(NgZone);
  private scrollListener: (() => void) | null = null;
  private scrollFrame = 0;

  protected readonly menuIcon = Menu;
  protected readonly closeIcon = X;
  protected readonly chevronIcon = ChevronDown;
  protected readonly checkIcon = Check;
  protected readonly arrowRightIcon = ArrowRight;
  protected readonly targetIcon = Target;
  protected readonly timerIcon = Timer;
  protected readonly activityIcon = Activity;
  protected readonly sparklesIcon = Sparkles;
  protected readonly shieldIcon = ShieldCheck;

  protected readonly heroReady = signal(false);
  protected readonly isScrolled = signal(false);
  protected readonly isMenuOpen = signal(false);
  protected readonly activeTab = signal<SolutionTab['id']>('treinar');
  protected readonly openFaq = signal<number | null>(0);

  protected readonly navItems: readonly NavItem[] = [
    { label: 'Início', href: '#inicio' },
    { label: 'Treinos', href: '#treinos' },
    { label: 'Como funciona', href: '#solucao' },
    { label: 'Planos', href: '#planos' },
    { label: 'FAQ', href: '#faq' },
  ];

  protected readonly stats = [
    { value: '+2.400', label: 'questões autorais' },
    { value: '3', label: 'modos de treinar' },
    { value: '100%', label: 'no modelo da prova' },
  ] as const;

  protected readonly tickerItems = [
    'Treinos nacionais',
    'Simulados por tema',
    'Questões autorais',
    'Revisão guiada',
    'Histórico',
    'Laboratório',
    'Streak de estudo',
    'Comunidade no WhatsApp',
  ];

  protected readonly trainingModes: readonly TrainingMode[] = [
    {
      title: 'Treinos Nacionais',
      badge: 'Modelo nacional',
      description:
        'Simulados autorais no modelo das avaliações nacionais, com foco inicial em alunos da rede Afya.',
      icon: Stethoscope,
      variant: 'national',
      image: {
        src: '/landing-page/modo-nacional.webp',
        alt: 'Interface de treino nacional BoraMed com questões e score',
        width: 1672,
        height: 941,
      },
    },
    {
      title: 'Simulados Processuais',
      badge: 'Por tema',
      description:
        'Escolha temas e quantidade de questões. A montagem aleatória acontece no servidor.',
      icon: ClipboardList,
      variant: 'process',
      image: {
        src: '/landing-page/modo-processual.webp',
        alt: 'Seleção de temas médicos para simulado processual',
        width: 1672,
        height: 941,
      },
    },
    {
      title: 'Laboratório',
      badge: 'Com imagem',
      description:
        'Questões autorais com imagem de lâminas ou peças para treinar reconhecimento e raciocínio visual.',
      icon: FlaskConical,
      variant: 'lab',
      image: {
        src: '/landing-page/modo-laboratorio.webp',
        alt: 'Questão de laboratório com lâmina histológica',
        width: 1672,
        height: 941,
      },
    },
  ];

  protected readonly solutionTabs: readonly SolutionTab[] = [
    {
      id: 'treinar',
      label: 'Treinar',
      title: 'Comece a treinar em segundos',
      description:
        'Escolha a prova, os temas ou o laboratório e comece um simulado na hora — com tempo cronometrado, como no dia da prova.',
      features: ['Questões 100% autorais', 'Tempo cronometrado', 'Progresso em tempo real', 'Modo estudo sem pressão', 'Retome de onde parou'],
      icon: BookOpenCheck,
    },
    {
      id: 'revisar',
      label: 'Revisar',
      title: 'Cada erro vira uma rota de revisão',
      description:
        'Ao fim do simulado, você vê exatamente onde perdeu pontos e volta direto para os temas que precisam de atenção.',
      features: ['Nota e resumo na hora', 'Temas mais críticos', 'Revisão de cada erro', 'Comentário por questão', 'Refaça em modo estudo'],
      icon: Route,
    },
    {
      id: 'acompanhar',
      label: 'Acompanhar',
      title: 'Sua evolução, prova após prova',
      description:
        'Acompanhe cada tentativa, veja a nota subir e mantenha a constância que aprova — com ranking entre estudantes para te manter no ritmo.',
      features: ['Histórico completo', 'Evolução da nota', 'Desempenho por tema', 'Sequência de estudo (streak)', 'Ranking entre estudantes'],
      icon: LineChart,
    },
  ];

  protected readonly steps: readonly TimelineStep[] = [
    {
      label: 'Hoje',
      title: 'Crie sua conta',
      points: ['Cadastro rápido e sem burocracia', 'Defina seu objetivo', 'Acesse a plataforma na hora'],
      icon: Sparkles,
    },
    {
      label: 'Primeiro treino',
      title: 'Monte seu simulado',
      points: ['Escolha prova, tema ou laboratório', 'Defina quantas questões', 'Treine com tempo real'],
      icon: BookOpenCheck,
    },
    {
      label: 'Depois',
      title: 'Evolua pelo diagnóstico',
      points: ['Veja sua nota e pontos fracos', 'Revise cada erro comentado', 'Refaça até dominar'],
      icon: Activity,
    },
  ];

  protected readonly capabilities: readonly Capability[] = [
    {
      title: 'Diagnosticar',
      description: 'Descubra, com dados, exatamente onde está perdendo pontos.',
      icon: BarChart3,
    },
    {
      title: 'Direcionar',
      description: 'Foque o estudo nos temas que mais impactam a sua nota.',
      icon: Route,
    },
    {
      title: 'Treinar',
      description: 'Monte novos simulados e treine até o conteúdo virar automático.',
      icon: Brain,
    },
  ];

  protected readonly pricingPlans: readonly PricingPlan[] = [
    {
      slug: 'mensal',
      name: 'Mensal',
      tagline: 'Flexível — sem fidelidade, cancele quando quiser',
      price: 'R$ 49,90',
      period: '/mês',
      note: 'Renova automaticamente. Cancele a qualquer momento.',
      features: [
        'Todos os simulados: nacionais, processuais e laboratório',
        'Banco completo de questões autorais',
        'Histórico e estatísticas de desempenho',
        'Ranking competitivo, XP e conquistas',
        'Revisão comentada das questões',
        'Acesso à comunidade exclusiva no WhatsApp',
      ],
      featured: false,
    },
    {
      slug: 'semestral',
      name: 'Semestral',
      tagline: 'Melhor custo-benefício — pague em até 6x',
      price: 'R$ 33,32',
      period: '/mês',
      note: 'R$ 199,90 no semestre, em até 6x sem juros.',
      economy: 'R$ 99,50',
      features: [
        'Tudo do plano mensal incluso',
        'Banco completo de questões autorais',
        'Histórico e estatísticas de desempenho',
        'Ranking competitivo, XP e conquistas',
        'Revisão comentada das questões',
        'Acesso à comunidade exclusiva no WhatsApp',
      ],
      featured: true,
    },
  ];

  protected readonly reviewTopics = [
    { name: 'Cardiovascular', pct: 58 },
    { name: 'Farmacologia', pct: 71 },
    { name: 'Anatomia', pct: 43 },
  ] as const;

  // Temas ordenados do pior para o melhor aproveitamento (rota de revisão).
  protected readonly sortedReviewTopics = [...this.reviewTopics].sort((a, b) => a.pct - b.pct);

  protected readonly streakDays = [
    true, true, false, true, true, true, false,
    true, true, true, false, false, true, true,
  ] as const;

  protected readonly faqs: readonly FaqItem[] = [
    {
      question: 'As questões são iguais às da prova da Afya?',
      answer:
        'Não. As questões são 100% autorais, criadas no mesmo formato e nível de cobrança das avaliações — para você treinar o raciocínio que a prova exige, sem usar nenhum acervo oficial.',
    },
    {
      question: 'O BoraMed tem vínculo oficial com a Afya?',
      answer:
        'Não. O BoraMed é uma plataforma independente, sem vínculo com a Afya ou qualquer instituição. Apenas seguimos o modelo das avaliações para deixar o seu treino o mais realista possível.',
    },
    {
      question: 'Posso cancelar quando quiser?',
      answer:
        'Sim. O plano mensal não tem fidelidade — você cancela a qualquer momento. O semestral sai mais barato por mês e pode ser parcelado em até 6x sem juros.',
    },
    {
      question: 'Consigo estudar pelo celular?',
      answer:
        'Sim. O BoraMed funciona direto no navegador do celular, tablet ou computador — sem precisar instalar nada e com seu progresso salvo em todos os dispositivos.',
    },
    {
      question: 'Como revisar meus erros depois do simulado?',
      answer:
        'Ao finalizar, você vê sua nota, os temas em que mais errou e a explicação de cada questão — e pode refazer tudo em modo estudo, sem tempo, até dominar o conteúdo.',
    },
    {
      question: 'Existe simulado de laboratório?',
      answer:
        'Sim. As questões de laboratório trazem imagens reais de lâminas e peças no enunciado, para treinar o reconhecimento visual que a prova prática cobra.',
    },
    {
      question: 'A assinatura dá acesso à comunidade?',
      answer:
        'Sim. Toda assinatura inclui acesso à comunidade exclusiva do BoraMed no WhatsApp, onde estudantes trocam dúvidas, materiais e dicas de estudo.',
    },
  ];

  constructor() {
    this.configureSeo();
    afterNextRender(() => {
      requestAnimationFrame(() => this.heroReady.set(true));

      this.zone.runOutsideAngular(() => {
        this.scrollListener = () => {
          if (this.scrollFrame) return;
          this.scrollFrame = requestAnimationFrame(() => {
            this.scrollFrame = 0;
            const scrolled = window.scrollY > 20;
            if (scrolled !== this.isScrolled()) this.isScrolled.set(scrolled);
          });
        };
        window.addEventListener('scroll', this.scrollListener, { passive: true });
      });
    });
  }

  ngOnDestroy(): void {
    if (this.scrollListener) window.removeEventListener('scroll', this.scrollListener);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
  }

  protected selectedTab(): SolutionTab {
    return this.solutionTabs.find((tab) => tab.id === this.activeTab()) ?? this.solutionTabs[0];
  }

  protected setActiveTab(tabId: SolutionTab['id']): void {
    this.activeTab.set(tabId);
  }

  // Faixa de cor da barra por aproveitamento: crítico, atenção ou bom.
  protected topicTier(pct: number): 'low' | 'mid' | 'high' {
    if (pct < 50) return 'low';
    if (pct < 70) return 'mid';
    return 'high';
  }

  protected toggleFaq(index: number): void {
    this.openFaq.update((current) => (current === index ? null : index));
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  protected toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
  }

  private configureSeo(): void {
    this.seo.update({
      title: 'BoraMed | Simulados de medicina no modelo da Afya',
      description:
        'Treine no modelo das provas da Afya: simulados de medicina autorais, questões comentadas e revisão guiada por desempenho. Plataforma independente — comece já.',
      path: '/',
      titleHasBrand: true,
    });

    // Schemas globais da marca — identidade no Knowledge Graph e caixa de
    // busca nos resultados do Google (sitelinks search box).
    this.seo.setWebSiteSchema();
    this.seo.setOrganizationSchema();

    this.seo.setJsonLd('software', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'BoraMed',
      url: `${SITE_URL}/`,
      applicationCategory: 'EducationalApplication',
      applicationSubCategory: 'MedicalEducation',
      operatingSystem: 'Web',
      inLanguage: 'pt-BR',
      description:
        'Plataforma independente de simulados de medicina com questões autorais no modelo das provas da Afya. Sem vínculo oficial com a Afya.',
      audience: {
        '@type': 'Audience',
        audienceType: 'Estudantes de medicina',
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'BRL',
      },
    });

    this.seo.setJsonLd('faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: this.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }
}
