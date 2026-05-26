import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  OnDestroy,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Brain,
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

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private scrollListener: (() => void) | null = null;
  private scrollFrame = 0;

  protected readonly menuIcon = Menu;
  protected readonly closeIcon = X;
  protected readonly chevronIcon = ChevronDown;
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
    { label: 'Simulados', href: '#solucao' },
    { label: 'Laboratório', href: '#modulos' },
    { label: 'FAQ', href: '#faq' },
  ];

  protected readonly stats = [
    { value: 'server-side', label: 'sorteio de questões' },
    { value: '3', label: 'módulos de treino' },
    { value: '100%', label: 'conteúdo autoral' },
  ] as const;

  protected readonly tickerItems = [
    'Treinos nacionais',
    'Simulados por tema',
    'Questões autorais',
    'Revisão guiada',
    'Histórico',
    'Laboratório',
    'Streak de estudo',
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
      title: 'Simulados com montagem inteligente',
      description:
        'Defina prova, temas ou modo de laboratório e comece uma tentativa com regras claras.',
      features: ['Questões autorais', 'Sorteio server-side', 'Timer e progresso', 'Modo estudo', 'Retomar tentativa'],
      icon: BookOpenCheck,
    },
    {
      id: 'revisar',
      label: 'Revisar',
      title: 'Erros viram rota de revisão',
      description:
        'Depois do simulado, veja onde perdeu pontos e volte direto para os pontos críticos.',
      features: ['Resumo da nota', 'Temas críticos', 'Revisão de erros', 'Explicação por questão', 'Refazer em modo estudo'],
      icon: Route,
    },
    {
      id: 'acompanhar',
      label: 'Acompanhar',
      title: 'Histórico para medir consistência',
      description:
        'Acompanhe tentativas, desempenho por tema e sinais de constância sem transformar o estudo em jogo infantil.',
      features: ['Histórico', 'Evolução da nota', 'Desempenho por tema', 'Conquistas discretas', 'Ranking controlado'],
      icon: LineChart,
    },
  ];

  protected readonly steps: readonly TimelineStep[] = [
    {
      label: 'Hoje',
      title: 'Crie sua conta',
      points: ['Informe seus dados', 'Escolha seu objetivo', 'Entre no dashboard'],
      icon: Sparkles,
    },
    {
      label: 'Primeiro treino',
      title: 'Monte um simulado',
      points: ['Escolha prova, tema ou laboratório', 'Defina quantidade', 'Responda com timer'],
      icon: BookOpenCheck,
    },
    {
      label: 'Depois',
      title: 'Revise pelo diagnóstico',
      points: ['Veja nota e temas críticos', 'Revise erros', 'Refaça em modo estudo'],
      icon: Activity,
    },
  ];

  protected readonly capabilities: readonly Capability[] = [
    {
      title: 'Diagnosticar',
      description: 'Veja aproveitamento por tema, histórico e padrões de erro.',
      icon: BarChart3,
    },
    {
      title: 'Direcionar',
      description: 'Volte direto para revisão de erros e temas com menor aproveitamento.',
      icon: Route,
    },
    {
      title: 'Treinar',
      description: 'Gere novas tentativas com regras consistentes e montagem no servidor.',
      icon: Brain,
    },
  ];

  protected readonly reviewTopics = [
    { name: 'Cardiovascular', pct: 58 },
    { name: 'Farmacologia', pct: 71 },
    { name: 'Anatomia', pct: 43 },
  ] as const;

  protected readonly streakDays = [
    true, true, false, true, true, true, false,
    true, true, true, false, false, true, true,
  ] as const;

  protected readonly faqs: readonly FaqItem[] = [
    {
      question: 'O BoraMed tem vínculo oficial com alguma instituição?',
      answer:
        'Não. O BoraMed é uma plataforma independente com questões autorais no modelo das avaliações.',
    },
    {
      question: 'As questões são oficiais?',
      answer:
        'Não. As questões são autorais e criadas para treinar raciocínio e formato de prova sem usar acervo oficial.',
    },
    {
      question: 'Como os simulados são montados?',
      answer:
        'A montagem e o sorteio das questões acontecem no servidor, preservando regras consistentes e evitando lógica sensível no cliente.',
    },
    {
      question: 'Existe simulado de laboratório?',
      answer: 'Sim. Questões de laboratório usam imagem como parte obrigatória do enunciado.',
    },
    {
      question: 'Consigo revisar meus erros?',
      answer:
        'Sim. Após finalizar, você pode revisar erros, temas críticos e refazer em modo estudo.',
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
    const siteUrl = 'https://bora-med.vercel.app';
    const title = 'BoraMed | Simulados médicos com questões autorais';
    const shortTitle = 'BoraMed | Simulados médicos autorais';
    const description =
      'Treine para avaliações nacionais com simulados médicos autorais, revisão por desempenho e questões no modelo das provas.';
    const ogImage = `${siteUrl}/og-image.png`;

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:locale', content: 'pt_BR' });
    this.meta.updateTag({ property: 'og:site_name', content: 'BoraMed' });
    this.meta.updateTag({ property: 'og:url', content: `${siteUrl}/` });
    this.meta.updateTag({ property: 'og:title', content: shortTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:image', content: ogImage });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: 'BoraMed — Simulados médicos autorais' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: shortTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: ogImage });

    this.setCanonicalUrl(siteUrl);
    this.setStructuredData(siteUrl);
  }

  private setCanonicalUrl(siteUrl: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      head.appendChild(link);
    }
    link.href = `${siteUrl}/`;
  }

  private setStructuredData(siteUrl: string): void {
    this.document.querySelectorAll('script[data-boramed-landing-jsonld]').forEach((node) => {
      node.remove();
    });

    const organizationScript = this.document.createElement('script');
    organizationScript.type = 'application/ld+json';
    organizationScript.setAttribute('data-boramed-landing-jsonld', 'org');
    organizationScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'BoraMed',
      url: siteUrl,
      logo: `${siteUrl}/logo.webp`,
      description: 'Plataforma independente de simulados médicos com questões autorais.',
      email: 'contato@boramed.com.br',
      inLanguage: 'pt-BR',
    });
    this.document.head.appendChild(organizationScript);

    const softwareScript = this.document.createElement('script');
    softwareScript.type = 'application/ld+json';
    softwareScript.setAttribute('data-boramed-landing-jsonld', 'software');
    softwareScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'BoraMed',
      url: siteUrl,
      applicationCategory: 'EducationalApplication',
      applicationSubCategory: 'MedicalEducation',
      operatingSystem: 'Web',
      inLanguage: 'pt-BR',
      description:
        'Plataforma independente de simulados médicos com questões autorais no modelo das avaliações.',
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
    this.document.head.appendChild(softwareScript);

    const faqScript = this.document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.setAttribute('data-boramed-landing-jsonld', 'faq');
    faqScript.textContent = JSON.stringify({
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
    this.document.head.appendChild(faqScript);
  }
}
