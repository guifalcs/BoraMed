import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  NgZone,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';
import { SITE_URL } from '../../core/seo/seo.config';
import {
  ArrowRight,
  Check,
  CreditCard,
  Maximize2,
  Menu,
  MessageCircle,
  Plus,
  ShieldCheck,
  Timer,
  X,
} from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import {
  UiSegmentedToggleComponent,
  type SegmentedToggleOption,
} from '../../shared/components/ui/segmented-toggle/ui-segmented-toggle.component';
import { LandingAuroraComponent } from './landing-aurora.component';
import { LandingCicloComponent } from './landing-ciclo.component';
import { LandingDemoQuizComponent } from './landing-demo-quiz.component';

interface NavItem {
  readonly label: string;
  readonly href: string;
}

interface ProofItem {
  readonly value: string;
  readonly label: string;
}

interface Testimonial {
  readonly quote: string;
  readonly name: string;
  readonly context?: string;
}

interface Assurance {
  readonly icon: LucideIconData;
  readonly title: string;
  readonly text: string;
}

type PlanTier = 'essencial' | 'avancado';
type PlanCycle = 'mensal' | 'semestral';

interface PricingPlan {
  readonly tier: PlanTier;
  readonly cycle: PlanCycle;
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
  imports: [
    RouterLink,
    UiIconComponent,
    UiSegmentedToggleComponent,
    LandingAuroraComponent,
    LandingCicloComponent,
    LandingDemoQuizComponent,
  ],
  templateUrl: './landing.component.html',
  styleUrls: [
    './landing-shared.css',
    './landing.component.css',
    './landing-bento.component.css',
    './landing-social-proof.component.css',
    './landing-pricing.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnDestroy {
  private readonly seo = inject(SeoService);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(EnvironmentInjector);
  private readonly router = inject(Router);
  private scrollListener: (() => void) | null = null;
  private scrollFrame = 0;

  protected readonly menuIcon = Menu;
  protected readonly closeIcon = X;
  protected readonly plusIcon = Plus;
  protected readonly checkIcon = Check;
  protected readonly xIcon = X;
  protected readonly arrowRightIcon = ArrowRight;
  protected readonly timerIcon = Timer;
  protected readonly zoomIcon = Maximize2;

  protected readonly isScrolled = signal(false);
  protected readonly isMenuOpen = signal(false);
  protected readonly openFaq = signal<number | null>(0);
  protected readonly flashFlipped = signal(false);

  protected readonly navItems: readonly NavItem[] = [
    { label: 'Teste grátis', href: '#demo' },
    { label: 'Aurora', href: '#aurora' },
    { label: 'Como funciona', href: '#como-funciona' },
    { label: 'Planos', href: '#planos' },
    { label: 'Dúvidas', href: '#faq' },
  ];

  // Faixa logo abaixo da hero: o que tem dentro, em quatro fatos verificáveis
  // (todos repetidos em detalhe mais abaixo na página ou nos planos).
  protected readonly proofItems: readonly ProofItem[] = [
    { value: '5.000+', label: 'questões autorais no modelo das avaliações' },
    { value: '1º ao 8º', label: 'período cobertos nos treinos nacionais' },
    { value: '0 a 100', label: 'nota da Aurora em cada questão discursiva' },
    { value: 'R$ 0', label: 'para começar: 3 simulados, sem cartão' },
  ];

  // Prévia da hero: diagnóstico por tema, do pior para o melhor aproveitamento.
  // Só o tema crítico ganha cor; os outros ficam neutros para o olho ir direto
  // ao que precisa de revisão.
  protected readonly heroTopics = [
    { name: 'Anatomia', pct: 43, critical: true },
    { name: 'Cardiovascular', pct: 58, critical: false },
    { name: 'Farmacologia', pct: 71, critical: false },
  ] as const;

  // Cartão-resposta do card de Treinos Nacionais: índice da alternativa
  // marcada em cada questão (0 = A … 4 = E).
  protected readonly answerSheet = [0, 2, 1, 4, 3, 1, 0, 2] as const;
  protected readonly answerLetters = ['A', 'B', 'C', 'D', 'E'] as const;

  // Temas reais do acervo processual do 1º período (nomes encurtados).
  protected readonly topicChips = [
    { name: 'Ciclo Cardíaco', selected: true },
    { name: 'Sinais Vitais', selected: true },
    { name: 'Embriologia Geral', selected: false },
    { name: 'Genética', selected: true },
    { name: 'Hemostasia', selected: false },
    { name: 'Sistema Linfático', selected: false },
  ] as const;

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

  // Benefícios resumidos — mesma lista usada no card de planos in-app.
  // TODO(integração): trocar por dados vindos de listarPlanos() quando o
  // plano Essencial existir no backend.
  private static readonly ESSENCIAL_FEATURES: readonly string[] = [
    'Treinos no modelo das avaliações nacionais, até o 8º período',
    'Correção das questões abertas pela Aurora (IA)',
    'Caderno de Erros: revise por tema e refaça as questões que você errou',
    'Modo competitivo',
    'Histórico e estatísticas de desempenho',
    'Impressão dos treinos em PDF',
    'Suporte 24h',
  ];

  private static readonly AVANCADO_FEATURES: readonly string[] = [
    'Tudo do plano Essencial',
    'Montar simulados sem limite (processual e laboratório) do 1º período, com impressão em PDF',
    'Materiais de estudo',
    'Flashcards: decks oficiais, seus e da comunidade',
  ];

  protected readonly pricingPlans: readonly PricingPlan[] = [
    {
      tier: 'essencial',
      cycle: 'mensal',
      slug: 'essencial-mensal',
      name: 'Essencial',
      tagline: 'Provas nacionais até o 8º período',
      price: 'R$ 23,90',
      period: '/mês',
      note: 'Pagamento único. Não renova automaticamente. Renove só se quiser.',
      ctaLabel: 'Começar no Essencial',
      features: LandingComponent.ESSENCIAL_FEATURES,
      featured: false,
    },
    {
      tier: 'essencial',
      cycle: 'semestral',
      slug: 'essencial-semestral',
      name: 'Essencial',
      tagline: 'Provas nacionais até o 8º período',
      price: 'R$ 13,90',
      period: '/mês',
      note: 'R$ 83,40 no semestre, em até 6x sem juros.',
      economy: 'R$ 60,00',
      anchorPrice: 'R$ 143,40',
      anchorNote: 'preço de 6 meses no plano mensal',
      ctaLabel: 'Garantir 6 meses com desconto',
      features: LandingComponent.ESSENCIAL_FEATURES,
      featured: false,
    },
    {
      tier: 'avancado',
      cycle: 'mensal',
      slug: 'mensal',
      name: 'Avançado',
      tagline: 'Acesso completo, do 1º ao 8º período',
      price: 'R$ 69,90',
      period: '/mês',
      note: 'Pagamento único. Não renova automaticamente. Renove só se quiser.',
      ctaLabel: 'Começar no Avançado',
      features: LandingComponent.AVANCADO_FEATURES,
      featured: true,
    },
    {
      tier: 'avancado',
      cycle: 'semestral',
      slug: 'semestral',
      name: 'Avançado',
      tagline: 'Acesso completo, do 1º ao 8º período',
      price: 'R$ 49,90',
      period: '/mês',
      note: 'R$ 299,40 no semestre, em até 6x sem juros.',
      economy: 'R$ 120,00',
      anchorPrice: 'R$ 419,40',
      anchorNote: 'preço de 6 meses no plano mensal',
      ctaLabel: 'Garantir 6 meses com desconto',
      features: LandingComponent.AVANCADO_FEATURES,
      featured: true,
    },
  ];

  /** Semestral é o ciclo padrão — melhor custo-benefício e maior conversão. */
  protected readonly cicloSelecionado = signal<PlanCycle>('semestral');

  // -42% é o maior desconto do semestral (Essencial: R$ 83,40 contra
  // R$ 143,40 de 6 meses avulsos). O Avançado economiza 29%.
  protected readonly cicloOptions: SegmentedToggleOption[] = [
    { value: 'mensal', label: 'Mensal' },
    { value: 'semestral', label: 'Semestral', badge: '-42%' },
  ];

  /**
   * Plano gratuito: âncora baixa da grade de preços e principal alavanca de
   * topo de funil. Não entra em `pricingPlans` porque não tem ciclo e por isso
   * não participa do toggle mensal/semestral.
   */
  protected readonly freePlan = {
    name: 'Grátis',
    tagline: 'Para conhecer a plataforma',
    price: 'R$ 0',
    period: '',
    note: 'Sem cartão de crédito. Sem prazo para usar.',
    ctaLabel: 'Começar grátis',
    features: [
      '2 treinos no modelo das avaliações nacionais',
      '1 simulado montado por você, escolhendo os temas',
      'Correção e gabarito comentado ao final',
      'Histórico, modo competitivo e desafio diário',
    ] as readonly string[],
    naoInclui: [
      'Simulados sem limite',
      'Caderno de Erros',
      'Materiais de estudo e flashcards',
      'Impressão em PDF',
    ] as readonly string[],
  };

  protected readonly visiblePricingPlans = computed(() =>
    this.pricingPlans.filter((plan) => plan.cycle === this.cicloSelecionado()),
  );

  // Garantias abaixo da grade de preços: uma linha só, sem caixas coloridas.
  protected readonly assurances: readonly Assurance[] = [
    {
      icon: ShieldCheck,
      title: 'Garantia de 7 dias',
      text: 'Não gostou? Devolvemos 100% do valor, sem perguntas, como prevê o Código de Defesa do Consumidor.',
    },
    {
      icon: MessageCircle,
      title: 'Comunidade no WhatsApp',
      text: 'Toda assinatura dá acesso ao grupo do BoraMed: dúvidas, materiais e networking.',
    },
    {
      icon: CreditCard,
      title: 'Pix, boleto ou cartão em até 6x',
      text: 'Pagamento sem sair da plataforma, em campos seguros do Mercado Pago.',
    },
  ];

  protected readonly faqs: readonly FaqItem[] = [
    {
      question: 'O que torna as questões do BoraMed diferentes?',
      answer:
        'Nosso diferencial são as questões autorais, criadas no mesmo formato e nível de cobrança das avaliações que você faz, para treinar o raciocínio que a prova exige. Tudo é organizado no modelo real do dia da avaliação. Os treinos processuais e de laboratório cobrem, hoje, o conteúdo do primeiro período; os demais períodos estão em produção.',
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
      question: 'Preciso cancelar para não ser cobrado de novo?',
      answer:
        'Não. Tanto o Essencial quanto o Avançado são pagamentos únicos, sem renovação automática, nos ciclos mensal (1 mês de acesso) ou semestral (6 meses). Quando expirar, você renova só se quiser.',
    },
    {
      question: 'Como funciona a garantia de 7 dias?',
      answer:
        'Assinou e não gostou? Em até 7 dias após a compra você pede o reembolso e devolvemos 100% do valor, sem perguntas, conforme o Código de Defesa do Consumidor.',
    },
    {
      question: 'Consigo estudar pelo celular?',
      answer:
        'Sim. O BoraMed funciona direto no navegador do celular, tablet ou computador, sem precisar instalar nada e com seu progresso salvo em todos os dispositivos.',
    },
    {
      question: 'Como revisar meus erros depois do simulado?',
      answer:
        'Ao finalizar, você vê sua nota, os temas em que mais errou e a explicação de cada questão. Toda questão errada também vai para o seu Caderno de Erros, agrupada por tema, onde você pode refazer avulso ou montar um simulado novo só com o que ainda precisa dominar. Recurso disponível para assinantes Essencial e Avançado.',
    },
    {
      question: 'Existe simulado de laboratório?',
      answer:
        'Sim. As questões de laboratório trazem imagens reais de lâminas e peças no enunciado, para treinar o reconhecimento visual que a prova prática cobra. Você pode experimentar já no plano grátis, no simulado que monta escolhendo os temas; para montar sem limite, é o plano Avançado. Hoje o acervo de laboratório cobre o conteúdo do primeiro período e segue crescendo.',
    },
    {
      question: 'Como funcionam os flashcards?',
      answer:
        'Os flashcards fazem parte do plano Avançado. Você estuda com decks prontos do BoraMed ou cria os seus, com imagens na pergunta e na resposta. Toque para revelar a resposta e marque o que acertou. Se quiser, publique seus decks no feed da comunidade. Outros estudantes usam e curtem os melhores, e você vê quem curtiu os seus.',
    },
    {
      question: 'A assinatura dá acesso à comunidade?',
      answer:
        'Sim. Toda assinatura inclui acesso à comunidade exclusiva do BoraMed no WhatsApp, onde estudantes trocam dúvidas, materiais e dicas de estudo.',
    },
    {
      question: 'Quais formas de pagamento posso usar?',
      answer:
        'Tudo acontece sem sair da plataforma, em campos seguros do Mercado Pago. Você paga com cartão, Pix ou boleto. No semestral, pode parcelar no cartão em até 6x sem juros.',
    },
  ];

  constructor() {
    this.configureSeo();
    afterNextRender(() => {
      void this.redirectAuthenticatedRoot();

      this.zone.runOutsideAngular(() => {
        this.scrollListener = () => {
          if (this.scrollFrame) return;
          this.scrollFrame = requestAnimationFrame(() => {
            this.scrollFrame = 0;
            const scrolled = window.scrollY > 8;
            if (scrolled !== this.isScrolled()) this.isScrolled.set(scrolled);
          });
        };
        window.addEventListener('scroll', this.scrollListener, { passive: true });
      });
    });
  }

  /**
   * Fallback para a hidratação SSR: em algumas entradas diretas o HTML
   * pré-renderizado da landing já foi montado antes de os guards rodarem.
   * Mantém a autenticação fora do bundle inicial e só age enquanto a URL é a
   * raiz, sem interferir em OAuth ou em navegações internas.
   */
  private async redirectAuthenticatedRoot(): Promise<void> {
    if (this.router.url !== '/' || window.location.search) return;

    const { AuthService } = await import('../../core/services/auth.service');
    const auth = this.injector.get(AuthService);
    await auth.initialize();

    if (this.router.url !== '/') return;
    if (auth.isRecoverySession()) {
      await this.router.navigateByUrl('/redefinir-senha', { replaceUrl: true });
      return;
    }
    if (auth.isAuthenticated()) {
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    }
  }

  ngOnDestroy(): void {
    if (this.scrollListener) window.removeEventListener('scroll', this.scrollListener);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
  }

  protected onCicloChange(value: string): void {
    this.cicloSelecionado.set(value === 'mensal' ? 'mensal' : 'semestral');
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
        'Mais de 5 mil questões em simulados de medicina autorais no modelo das avaliações da Afya, com diagnóstico por tema, correção de questões discursivas por IA (Aurora) e flashcards da comunidade. Comece a treinar hoje.',
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
        'Plataforma independente de simulados de medicina com mais de 5 mil questões autorais no modelo das provas da Afya, incluindo correção de questões discursivas por IA (Aurora). Sem vínculo oficial com a Afya.',
      audience: {
        '@type': 'Audience',
        audienceType: 'Estudantes de medicina',
      },
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '13.90',
        highPrice: '69.90',
        priceCurrency: 'BRL',
        offerCount: 4,
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
