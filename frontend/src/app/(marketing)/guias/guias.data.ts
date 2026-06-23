/**
 * Conteúdo dos guias de estudo (motor de SEO de conteúdo).
 *
 * Cada guia é uma página pública, indexável e pré-renderizada, escrita para
 * captar buscas de estudantes de medicina (ex.: "como estudar para prova de
 * medicina", "simulado de medicina"). Conteúdo autoral e independente — não
 * referencia marcas de instituições de ensino.
 *
 * Para criar um novo guia: adicione um objeto ao array `GUIAS`. O slug vira a
 * URL (/guias/<slug>), entra no sitemap e é pré-renderizado automaticamente.
 */

export interface GuiaSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface GuiaFaq {
  readonly question: string;
  readonly answer: string;
}

export interface Guia {
  /** Identificador da URL: /guias/<slug>. */
  readonly slug: string;
  /** <title> da página (< 60 caracteres, sem a marca — o sufixo é aplicado). */
  readonly metaTitle: string;
  /** Meta description (120-158 caracteres). */
  readonly metaDescription: string;
  /** H1 da página. */
  readonly h1: string;
  /** Resumo/lead exibido no topo e usado como descrição do card. */
  readonly resumo: string;
  /** Data ISO da última atualização (Article schema + "lastmod" do sitemap). */
  readonly atualizadoEm: string;
  /** Tempo estimado de leitura, em minutos. */
  readonly tempoLeituraMin: number;
  /** Palavras-chave alvo (uso editorial; não viram meta keywords). */
  readonly keywords: readonly string[];
  /** Corpo do artigo em seções (cada uma vira um H2). */
  readonly secoes: readonly GuiaSection[];
  /** Perguntas frequentes (geram FAQPage schema + rich result). */
  readonly faq: readonly GuiaFaq[];
}

export const GUIAS: readonly Guia[] = [
  {
    slug: 'simulado-modelo-afya',
    metaTitle: 'Simulado no modelo da Afya: como treinar',
    metaDescription:
      'Treine com simulados de medicina no modelo das provas da Afya: questões autorais comentadas e revisão por desempenho. Plataforma independente, sem vínculo com a Afya.',
    h1: 'Simulado de medicina no modelo da Afya',
    resumo:
      'Como treinar com simulados no modelo das provas da Afya usando questões autorais. O BoraMed é independente: não temos vínculo com a Afya nem reproduzimos suas questões.',
    atualizadoEm: '2026-06-23',
    tempoLeituraMin: 5,
    keywords: [
      'simulado modelo Afya',
      'questões no modelo Afya',
      'simulado Afya',
      'provas Afya medicina',
      'prova nacional Afya',
    ],
    secoes: [
      {
        heading: 'O que significa "no modelo da Afya"',
        paragraphs: [
          'Quando falamos em treinar "no modelo da Afya", referimo-nos ao formato e ao estilo das avaliações aplicadas na rede — casos clínicos, raciocínio aplicado e a estrutura das provas nacionais. O BoraMed reproduz esse formato com conteúdo 100% autoral.',
          'Importante deixar claro: o BoraMed é uma plataforma independente. Não temos vínculo, parceria ou afiliação com a Afya, e não reproduzimos as questões reais das provas dela. O que oferecemos são questões próprias, construídas no mesmo estilo, para você treinar com fidelidade ao formato.',
        ],
      },
      {
        heading: 'Por que treinar no formato certo importa',
        paragraphs: [
          'Acertar o formato do treino é metade do caminho. Quem pratica com questões no mesmo estilo das avaliações chega à prova familiarizado com o tipo de enunciado, o tamanho dos casos e o ritmo necessário para administrar o tempo.',
          'Treinar em formato fiel reduz surpresas no dia da prova e melhora o desempenho real, porque você já desenvolveu o raciocínio que o modelo cobra — e não apenas decorou conteúdo.',
        ],
      },
      {
        heading: 'Como o BoraMed reproduz esse modelo',
        paragraphs: [
          'Treinos nacionais: simulados autorais no formato das avaliações nacionais. Simulados processuais: você escolhe tema e quantidade de questões para reforçar pontos fracos. Simulados de laboratório: questões com imagens de lâminas e peças, essenciais para morfologia.',
          'Cada questão vem comentada e a revisão de desempenho mostra, por tema, onde você acerta e onde precisa focar — para o estudo render mais a cada simulado.',
        ],
      },
    ],
    faq: [
      {
        question: 'O BoraMed tem questões da Afya?',
        answer:
          'Não. O BoraMed é independente e não reproduz as questões reais da Afya. Todas as questões são autorais, criadas no modelo das provas para você treinar com fidelidade ao formato.',
      },
      {
        question: 'O BoraMed tem vínculo com a Afya?',
        answer:
          'Não. O BoraMed não possui vínculo, parceria ou afiliação com a Afya nem com qualquer outra instituição de ensino. A referência ao "modelo da Afya" descreve apenas o formato das avaliações.',
      },
      {
        question: 'Como treinar no modelo da Afya?',
        answer:
          'Use simulados autorais construídos no mesmo formato das avaliações nacionais, com casos clínicos cronometrados e revisão dos erros por tema. É o que o BoraMed oferece.',
      },
    ],
  },
  {
    slug: 'como-estudar-para-prova-de-medicina',
    metaTitle: 'Como estudar para prova de medicina: guia completo',
    metaDescription:
      'Método prático para estudar para provas de medicina: cronograma, revisão espaçada, simulados e questões comentadas. Guia passo a passo para render mais.',
    h1: 'Como estudar para prova de medicina',
    resumo:
      'Um método de estudo objetivo para provas de medicina, combinando cronograma realista, revisão espaçada e treino com questões no modelo das avaliações.',
    atualizadoEm: '2026-06-23',
    tempoLeituraMin: 7,
    keywords: [
      'como estudar para prova de medicina',
      'método de estudo medicina',
      'cronograma de estudos medicina',
      'revisão espaçada medicina',
    ],
    secoes: [
      {
        heading: 'Comece pelo edital e pelo formato da prova',
        paragraphs: [
          'Antes de abrir o primeiro material, entenda exatamente o que será cobrado: as grandes áreas (clínica médica, cirurgia, pediatria, ginecologia e obstetrícia, medicina preventiva), o peso de cada uma e o formato das questões. Provas no modelo das avaliações nacionais costumam priorizar raciocínio clínico aplicado a casos, e não memorização pura.',
          'Mapear o formato evita o erro mais comum: estudar muito conteúdo de baixo rendimento. Liste os temas por frequência de cobrança e comece pelos que mais aparecem.',
        ],
      },
      {
        heading: 'Monte um cronograma que você consiga cumprir',
        paragraphs: [
          'Um cronograma realista vale mais do que um cronograma ambicioso e abandonado na primeira semana. Divida o tempo disponível por área proporcionalmente ao peso na prova e reserve blocos fixos para revisão e para resolução de questões.',
          'Regra prática: dedique no mínimo 40% do tempo a questões e simulados. Estudar lendo é confortável, mas o desempenho real só aparece quando você treina no formato da prova.',
        ],
      },
      {
        heading: 'Use revisão espaçada e questões comentadas',
        paragraphs: [
          'A curva do esquecimento é implacável: o que você estuda hoje some em dias se não for revisado. A revisão espaçada — revisar em intervalos crescentes (1 dia, 3 dias, 1 semana) — fixa o conteúdo com muito menos esforço total.',
          'Acople cada revisão a um bloco de questões comentadas do tema. Errar uma questão e ler a explicação imediatamente é uma das formas mais eficientes de aprender, porque conecta a teoria ao raciocínio que a prova exige.',
        ],
      },
      {
        heading: 'Simule a prova de verdade',
        paragraphs: [
          'Fazer simulados completos, cronometrados e no formato da avaliação treina algo que nenhuma leitura treina: gestão de tempo, controle da ansiedade e resistência à fadiga. Faça simulados periódicos e analise os erros por tema para redirecionar o estudo.',
          'No BoraMed você monta simulados por tema e quantidade de questões, ou treina no modelo das avaliações nacionais, com revisão de desempenho que mostra exatamente onde focar.',
        ],
      },
    ],
    faq: [
      {
        question: 'Quanto tempo por dia devo estudar para prova de medicina?',
        answer:
          'Mais importante que a quantidade de horas é a consistência e a proporção de questões. Um bloco diário de 2 a 4 horas com pelo menos 40% do tempo em questões rende mais do que maratonas esporádicas.',
      },
      {
        question: 'É melhor estudar por leitura ou por questões?',
        answer:
          'Os dois, mas com prioridade para questões. A leitura constrói a base; as questões comentadas consolidam o raciocínio clínico e revelam suas lacunas reais.',
      },
      {
        question: 'Com que frequência devo fazer simulados?',
        answer:
          'Faça simulados completos periodicamente (por exemplo, a cada uma ou duas semanas) e simulados temáticos com mais frequência, sempre analisando os erros por área.',
      },
    ],
  },
  {
    slug: 'simulado-de-medicina-como-treinar',
    metaTitle: 'Simulado de medicina: como treinar no modelo das provas',
    metaDescription:
      'O que é um bom simulado de medicina, como treinar no modelo das avaliações nacionais e usar o desempenho para estudar melhor. Guia prático e autoral.',
    h1: 'Simulado de medicina: como treinar no modelo das provas',
    resumo:
      'Como usar simulados de medicina para treinar raciocínio clínico, gestão de tempo e revisão por desempenho — no modelo das avaliações nacionais.',
    atualizadoEm: '2026-06-23',
    tempoLeituraMin: 6,
    keywords: [
      'simulado de medicina',
      'simulado avaliação nacional',
      'simulado online de medicina',
      'simulado medicina por tema',
    ],
    secoes: [
      {
        heading: 'Por que o simulado é o treino mais eficiente',
        paragraphs: [
          'O simulado é o exercício que mais se aproxima da prova real. Ele treina simultaneamente conteúdo, raciocínio clínico, leitura de enunciados longos e administração do tempo — habilidades que a leitura isolada não desenvolve.',
          'Estudos sobre aprendizagem mostram que recuperar a informação (testar-se) fixa muito mais do que reler. Por isso, resolver questões em formato de prova é um dos métodos de estudo com melhor retorno por hora investida.',
        ],
      },
      {
        heading: 'Tipos de simulado e quando usar cada um',
        paragraphs: [
          'Simulado completo no modelo das avaliações nacionais: ideal para medir prontidão geral, treinar resistência e calibrar o tempo por questão. Use periodicamente.',
          'Simulado processual (por tema e quantidade): ideal para atacar pontos fracos específicos. Selecione o tema, defina o número de questões e treine de forma direcionada.',
          'Simulado de laboratório (com imagens de lâminas e peças): essencial para morfologia e anatomia patológica, áreas em que o reconhecimento visual é decisivo.',
        ],
      },
      {
        heading: 'Transforme o resultado em estudo',
        paragraphs: [
          'Um simulado só vale o tempo gasto se for analisado. Revise cada erro lendo a explicação, classifique o motivo (falta de conteúdo, interpretação, distração) e registre os temas recorrentes.',
          'A revisão por desempenho do BoraMed agrega seus acertos e erros por tema ao longo do tempo, mostrando em que áreas você evolui e onde precisa concentrar o próximo bloco de estudo.',
        ],
      },
    ],
    faq: [
      {
        question: 'Onde fazer simulado de medicina online?',
        answer:
          'No BoraMed você faz simulados de medicina online com questões autorais no modelo das avaliações nacionais, com correção e revisão de desempenho por tema.',
      },
      {
        question: 'Qual a diferença entre simulado completo e por tema?',
        answer:
          'O simulado completo mede prontidão geral e treina gestão de tempo; o simulado por tema serve para reforçar pontos fracos específicos de forma direcionada.',
      },
    ],
  },
  {
    slug: 'questoes-de-medicina-por-especialidade',
    metaTitle: 'Questões de medicina por especialidade: guia de estudo',
    metaDescription:
      'Como estudar questões de medicina por especialidade — clínica, cirurgia, pediatria, GO e preventiva. Estratégia de banco de questões comentadas.',
    h1: 'Questões de medicina por especialidade',
    resumo:
      'Como organizar o estudo de questões de medicina por especialidade e usar um banco de questões comentadas para subir o desempenho em cada grande área.',
    atualizadoEm: '2026-06-23',
    tempoLeituraMin: 6,
    keywords: [
      'questões de medicina',
      'questões comentadas de medicina',
      'banco de questões de medicina',
      'questões por especialidade',
    ],
    secoes: [
      {
        heading: 'As cinco grandes áreas',
        paragraphs: [
          'As avaliações de medicina se organizam em cinco grandes áreas: clínica médica, cirurgia, pediatria, ginecologia e obstetrícia, e medicina preventiva e social. Estudar questões agrupadas por área ajuda a reconhecer padrões de cobrança e os temas que mais se repetem.',
          'Comece identificando seu desempenho por área. Distribua o esforço de forma inversa ao rendimento: mais tempo onde você erra mais, sem abandonar a manutenção das áreas em que já vai bem.',
        ],
      },
      {
        heading: 'Como aproveitar um banco de questões',
        paragraphs: [
          'Um banco de questões comentadas é mais do que um amontoado de perguntas: é uma ferramenta de diagnóstico. Resolva em blocos por tema, leia as explicações dos erros e dos acertos por eliminação, e marque para revisão o que ainda gera dúvida.',
          'No BoraMed, as questões são autorais e construídas no modelo das avaliações, com comentários que explicam o raciocínio clínico — não apenas a alternativa correta.',
        ],
      },
      {
        heading: 'Da questão ao caso clínico',
        paragraphs: [
          'Questões de medicina de boa qualidade simulam decisões reais: diagnóstico, conduta, interpretação de exames. Ao estudar, treine o raciocínio completo do caso, não apenas a resposta. Pergunte-se o que mudaria a conduta se um dado do enunciado fosse diferente.',
          'Esse hábito transforma cada questão em vários aprendizados e é exatamente o tipo de pensamento que as provas no modelo das avaliações nacionais buscam avaliar.',
        ],
      },
    ],
    faq: [
      {
        question: 'Vale a pena estudar questões separadas por especialidade?',
        answer:
          'Sim. Agrupar questões por especialidade ajuda a reconhecer padrões de cobrança, medir desempenho por área e direcionar o estudo para os pontos fracos.',
      },
      {
        question: 'O que é um banco de questões comentadas?',
        answer:
          'É um conjunto de questões com explicações detalhadas do raciocínio de cada alternativa, permitindo aprender tanto com os acertos quanto com os erros.',
      },
    ],
  },
  {
    slug: 'avaliacao-nacional-de-medicina-como-funciona',
    metaTitle: 'Avaliação nacional de medicina: como funciona e treinar',
    metaDescription:
      'Entenda o formato das avaliações nacionais de medicina e como treinar com simulados autorais no mesmo modelo para chegar preparado. Guia atualizado.',
    h1: 'Avaliação nacional de medicina: como funciona',
    resumo:
      'O que esperar das avaliações nacionais de medicina, como é o formato das questões e como treinar com simulados autorais no mesmo estilo.',
    atualizadoEm: '2026-06-23',
    tempoLeituraMin: 5,
    keywords: [
      'avaliação nacional de medicina',
      'simulado avaliação nacional',
      'prova nacional de medicina',
      'modelo das avaliações nacionais',
    ],
    secoes: [
      {
        heading: 'O que são as avaliações nacionais',
        paragraphs: [
          'As avaliações nacionais de medicina medem, de forma padronizada, o domínio do estudante sobre as competências esperadas ao longo do curso. O foco está no raciocínio clínico aplicado, em casos que reproduzem decisões da prática real.',
          'Por serem padronizadas e periódicas, recompensam quem treina de forma consistente no formato certo, em vez de quem apenas acumula leitura.',
        ],
      },
      {
        heading: 'Como é o formato das questões',
        paragraphs: [
          'As questões costumam apresentar um caso clínico com história, exame físico e, muitas vezes, exames complementares, pedindo diagnóstico, conduta ou interpretação. Enunciados são longos e exigem leitura atenta e gestão de tempo.',
          'Treinar nesse formato — e não em questões soltas de memorização — é o que mais aproxima seu treino da prova real.',
        ],
      },
      {
        heading: 'Como treinar no modelo certo',
        paragraphs: [
          'O BoraMed oferece treinos nacionais: simulados autorais construídos no modelo das provas da Afya e das avaliações nacionais, com revisão de desempenho. A plataforma é independente, sem vínculo com a Afya, e usa conteúdo 100% próprio inspirado no formato dessas avaliações.',
          'Combine simulados completos para medir prontidão com simulados por tema para reforçar pontos fracos, sempre analisando os erros para fechar lacunas antes da prova.',
        ],
      },
    ],
    faq: [
      {
        question: 'Como treinar para a avaliação nacional de medicina?',
        answer:
          'Treine com simulados no mesmo formato da avaliação: casos clínicos cronometrados, seguidos de revisão dos erros por tema. O BoraMed oferece simulados autorais nesse modelo.',
      },
      {
        question: 'O BoraMed tem vínculo com alguma instituição?',
        answer:
          'Não. O BoraMed é uma plataforma independente, com questões autorais inspiradas no modelo das avaliações nacionais, sem vínculo com instituições de ensino.',
      },
    ],
  },
];

/** Busca um guia pelo slug. */
export function getGuiaBySlug(slug: string): Guia | undefined {
  return GUIAS.find((guia) => guia.slug === slug);
}

/** Lista de slugs (usada para pré-renderização e sitemap). */
export function getGuiaSlugs(): string[] {
  return GUIAS.map((guia) => guia.slug);
}
