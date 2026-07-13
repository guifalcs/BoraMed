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
  BookOpenCheck,
  Check,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Layers,
  LineChart,
  Menu,
  MessageCircle,
  PenLine,
  Quote,
  Route,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { LandingDemoQuizComponent } from './landing-demo-quiz.component';

interface NavItem {
  readonly label: string;
  readonly href: string;
}

interface TrainingMode {
  readonly title: string;
  readonly description: string;
  readonly badge: string;
  readonly icon: LucideIconData;
  readonly variant: 'national' | 'process' | 'lab' | 'flashcards';
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

interface Testimonial {
  readonly quote: string;
  readonly name: string;
  readonly context?: string;
}

interface PricingPlan {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly price: string;
  readonly period: string;
  readonly note?: string;
  readonly economy?: string;
  readonly anchorPrice?: string;
  readonly anchorNote?: string;
  readonly ctaLabel: string;
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
  imports: [RouterLink, UiIconComponent, LandingDemoQuizComponent],
  templateUrl: './landing.component.html',
  styleUrls: [
    './landing.component.css',
    './landing-aurora.component.css',
    './landing-intelligence.component.css',
    './landing-pricing.component.css',
    './landing-bento.component.css',
    './landing-social-proof.component.css',
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
  protected readonly activityIcon = Activity;
  protected readonly sparklesIcon = Sparkles;
  protected readonly penIcon = PenLine;
  protected readonly shieldIcon = ShieldCheck;
  protected readonly communityIcon = MessageCircle;
  protected readonly quoteIcon = Quote;

  protected readonly heroReady = signal(false);
  protected readonly isScrolled = signal(false);
  protected readonly isMenuOpen = signal(false);
  protected readonly activeTab = signal<SolutionTab['id']>('treinar');
  protected readonly openFaq = signal<number | null>(0);

  protected readonly navItems: readonly NavItem[] = [
    { label: 'Início', href: '#inicio' },
    { label: 'Teste grátis', href: '#demo' },
    { label: 'Correção por IA', href: '#aurora' },
    { label: 'Treinos', href: '#treinos' },
    { label: 'Planos', href: '#planos' },
    { label: 'FAQ', href: '#faq' },
  ];

  protected readonly stats = [
    { value: '+2.400', label: 'questões autorais' },
    { value: '4', label: 'modos de treinar' },
    { value: '100%', label: 'no modelo da prova' },
  ] as const;

  // Depoimentos desativados temporariamente — sem prova social real ainda.
  // Reativar junto com a interface Testimonial, o array testimonials, o
  // quoteIcon e o import de Quote quando houver depoimentos reais de alunos.
  // protected readonly statsQuote = {
  //   quote: 'Micro-depoimento de uma frase sobre resultado na prova.',
  //   author: 'Nome, período · Medicina',
  // } as const;

  protected readonly tickerItems = [
    'Treinos nacionais',
    'Correção por IA · Aurora',
    'Questões discursivas',
    'Simulados por tema',
    'Questões autorais',
    'Revisão guiada',
    'Flashcards com imagens',
    'Decks da comunidade',
    'Histórico',
    'Laboratório',
    'Streak de estudo',
    'Comunidade no WhatsApp',
  ];

  // Exemplo real (estático) de correção da Aurora exibido na seção #aurora —
  // "prova > promessa": mostra a nota 0–100, os pontos atendidos/faltantes e o
  // comentário, exatamente como o aluno vê ao responder uma questão discursiva.
  protected readonly auroraDemo = {
    topic: 'Cirurgia · Vias biliares',
    question: 'Descreva a tríade de Charcot e seu significado clínico na colangite aguda.',
    answer:
      'Febre com calafrios, icterícia e dor no hipocôndrio direito. Indica infecção das vias biliares por obstrução, geralmente por cálculo.',
    score: 90,
    atendidos: [
      'Febre com calafrios',
      'Icterícia',
      'Dor em hipocôndrio direito',
      'Associou à obstrução biliar',
    ],
    faltantes: ['Pêntade de Reynolds (confusão + hipotensão) como sinal de gravidade'],
    comentario:
      'Boa resposta: você acertou os três componentes da tríade e relacionou à obstrução das vias biliares. Para a nota máxima, cite a evolução para a pêntade de Reynolds, que indica colangite grave e muda a conduta.',
  } as const;

  // Disclaimer da Aurora na landing — mesma expectativa da correção no app
  // (apoio ao estudo, não a correção oficial; independência em relação à Afya).
  protected readonly auroraDisclaimer =
    'A Aurora é um apoio ao seu estudo: aponta a direção da resposta e os pontos esperados, não substitui a correção oficial. O BoraMed é uma plataforma independente, sem vínculo com a Afya.';

  protected readonly auroraBenefits: readonly string[] = [
    'Nota de 0 a 100 e feedback na hora — sem esperar ninguém corrigir.',
    'Aponta ponto a ponto: o que você acertou e o que faltou dizer.',
    'Funciona no modo estudo e no simulado, em toda questão discursiva.',
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
    {
      title: 'Flashcards',
      badge: 'Novo · Comunidade',
      description:
        'Estude com decks oficiais, crie os seus com imagens e destrave os decks da comunidade — os melhores sobem com as curtidas dos próprios estudantes.',
      icon: Layers,
      variant: 'flashcards',
    },
  ];

  protected readonly solutionTabs: readonly SolutionTab[] = [
    {
      id: 'treinar',
      label: 'Treinar',
      title: 'Comece a treinar em segundos',
      description:
        'Escolha a prova, os temas ou o laboratório e comece um simulado na hora — com tempo cronometrado, como no dia da prova.',
      features: ['Questões 100% autorais', 'Tempo cronometrado', 'Progresso em tempo real', 'Modo estudo sem pressão', 'Flashcards seus e da comunidade', 'Retome de onde parou'],
      icon: BookOpenCheck,
    },
    {
      id: 'revisar',
      label: 'Revisar',
      title: 'Cada erro vira uma rota de revisão',
      description:
        'Ao fim do simulado, você vê exatamente onde perdeu pontos e volta direto para os temas que precisam de atenção — inclusive nas questões discursivas, corrigidas pela Aurora.',
      features: ['Nota e resumo na hora', 'Correção das discursivas pela Aurora (IA)', 'Temas mais críticos', 'Revisão de cada erro', 'Refaça em modo estudo'],
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
      points: ['Veja sua nota e pontos fracos', 'Discursivas corrigidas pela Aurora', 'Refaça até dominar'],
      icon: Activity,
    },
  ];

  protected readonly testimonials: readonly Testimonial[] = [
    {
      quote: 'Minha experiência com a plataforma foi muito positiva. As questões me ajudaram a treinar pra prova da faculdade.',
      name: 'Henrique Codeço Rocha Soares',
    },
    {
      quote: 'A plataforma é muito boa e fácil de compreender.',
      name: 'Gabriel José Rezende Ferreira Sales',
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
      ctaLabel: 'Começar no mensal',
      features: [
        'Todos os simulados: nacionais, processuais e laboratório',
        'Correção de questões discursivas pela Aurora (IA)',
        'Banco completo de questões autorais',
        'Flashcards: decks oficiais, seus e da comunidade',
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
      anchorPrice: 'R$ 299,40',
      anchorNote: 'preço de 6 meses no plano mensal',
      ctaLabel: 'Garantir 6 meses com desconto',
      features: [
        'Tudo do plano mensal incluso',
        'Correção de questões discursivas pela Aurora (IA)',
        'Banco completo de questões autorais',
        'Flashcards: decks oficiais, seus e da comunidade',
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
      question: 'Como funciona a correção das questões discursivas por IA?',
      answer:
        'Você escreve a resposta e a Aurora, nossa IA corretora, avalia na hora: dá uma nota de 0 a 100, aponta os pontos que você acertou, os que faltaram e comenta os erros. Funciona tanto no modo estudo quanto no simulado, em toda questão discursiva.',
    },
    {
      question: 'A nota da Aurora é a correção oficial da prova?',
      answer:
        'Não. A Aurora é um apoio ao seu estudo: mostra a direção da resposta e os pontos esperados para você treinar, mas não reproduz os critérios exatos dos professores nem substitui a correção oficial. O BoraMed é uma plataforma independente, sem vínculo com a Afya.',
    },
    {
      question: 'Posso cancelar quando quiser?',
      answer:
        'Sim. O plano mensal não tem fidelidade — você cancela a qualquer momento. O semestral sai mais barato por mês e pode ser parcelado em até 6x sem juros.',
    },
    {
      question: 'Como funciona a garantia de 7 dias?',
      answer:
        'Assinou e não gostou? Em até 7 dias após a compra você pede o reembolso e devolvemos 100% do valor, sem perguntas — conforme o Código de Defesa do Consumidor.',
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
      question: 'Como funcionam os flashcards?',
      answer:
        'Você estuda com decks prontos do BoraMed ou cria os seus, com imagens na pergunta e na resposta. Toque para revelar a resposta e marque o que acertou. Se quiser, publique seus decks no feed da comunidade — outros estudantes usam e curtem os melhores, e você vê quem curtiu os seus.',
    },
    {
      question: 'A assinatura dá acesso à comunidade?',
      answer:
        'Sim. Toda assinatura inclui acesso à comunidade exclusiva do BoraMed no WhatsApp, onde estudantes trocam dúvidas, materiais e dicas de estudo.',
    },
    {
      question: 'Quais formas de pagamento posso usar?',
      answer:
        'Tudo acontece sem sair da plataforma, em campos seguros do Mercado Pago. No plano mensal, o pagamento é recorrente no cartão de crédito. No semestral, você escolhe cartão em até 6x, Pix ou boleto.',
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
        'Simulados de medicina 100% autorais no modelo das avaliações da Afya, com diagnóstico por tema, correção de questões discursivas por IA (Aurora) e flashcards da comunidade. Comece a treinar hoje.',
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
        'Plataforma independente de simulados de medicina com questões autorais no modelo das provas da Afya, incluindo correção de questões discursivas por IA (Aurora). Sem vínculo oficial com a Afya.',
      audience: {
        '@type': 'Audience',
        audienceType: 'Estudantes de medicina',
      },
      offers: {
        '@type': 'Offer',
        price: '33.32',
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
