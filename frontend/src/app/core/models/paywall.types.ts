/**
 * Contextos que disparam o paywall. Cada um tem copy própria: o pedido de
 * assinatura converte melhor quando fala do recurso que o usuário acabou de
 * tentar usar, e não de "assinar" no abstrato.
 */
export type PaywallContexto =
  | 'materiais'
  | 'flashcards'
  | 'simulado-personalizado'
  | 'limite-tentativas'
  | 'impressao'
  | 'prova-bloqueada'
  | 'recurso-pago';

export interface PaywallConteudo {
  titulo: string;
  subtitulo: string;
  /**
   * Ordenados por efeito de posição serial: o benefício mais forte primeiro,
   * o utilitário no meio, e o diferencial no fim, perto do CTA.
   */
  beneficios: readonly string[];
  /** Fecha com enquadramento de perda, não de ganho. */
  fechamento: string;
  cta: string;
}

export const PAYWALL_CONTEUDO: Record<PaywallContexto, PaywallConteudo> = {
  materiais: {
    titulo: 'Materiais de estudo',
    subtitulo: 'Resumos e apostilas em PDF, organizados por disciplina e período.',
    beneficios: [
      'Biblioteca completa de materiais em PDF',
      'Organizados por disciplina e por período',
      'Leitura direto no navegador',
    ],
    fechamento: 'Incluso no plano Avançado.',
    cta: 'Ver planos',
  },
  flashcards: {
    titulo: 'Flashcards',
    subtitulo: 'Revisão ativa com decks oficiais e da comunidade.',
    beneficios: [
      'Decks oficiais BoraMed prontos para estudar',
      'Crie os seus e compartilhe com a comunidade',
      'Revisão rápida entre um simulado e outro',
    ],
    fechamento: 'Incluso no plano Avançado.',
    cta: 'Ver planos',
  },
  'simulado-personalizado': {
    titulo: 'Montar simulado',
    subtitulo: 'Você escolhe os temas, a quantidade e o formato. A prova sai na hora.',
    beneficios: [
      'Treine exatamente o tema que você errou',
      'Questões processuais e de laboratório com imagem',
      'Gere quantas provas quiser, quando quiser',
    ],
    fechamento: 'Incluso no plano Avançado.',
    cta: 'Ver planos',
  },
  'limite-tentativas': {
    titulo: 'Seus simulados grátis acabaram',
    subtitulo: 'Você já usou os 3 simulados do plano gratuito.',
    beneficios: [
      'Simulados nacionais sem limite',
      'Correção da Aurora nas questões discursivas',
      'Histórico e evolução por tema, prova a prova',
    ],
    fechamento: 'Seu histórico continua salvo. Assine para retomar de onde parou.',
    cta: 'Assinar agora',
  },
  impressao: {
    titulo: 'Impressão em PDF',
    subtitulo: 'Leve o simulado para o papel e treine longe da tela.',
    beneficios: [
      'Simulado formatado para impressão',
      'Gabarito separado, para corrigir depois',
      'Disponível em qualquer treino do acervo',
    ],
    fechamento: 'Incluso a partir do plano Essencial.',
    cta: 'Ver planos',
  },
  'prova-bloqueada': {
    // Este contexto atende gratuito E essencial (os dois batem no P0015 de
    // `iniciar_tentativa`), então a copy não pode presumir plano gratuito nem
    // prometer "sem limite" — quem paga o Essencial já não tem limite e ficaria
    // ouvindo que está no plano grátis na hora do upsell.
    titulo: 'Treino exclusivo do plano Avançado',
    subtitulo: 'Seu plano cobre os treinos nacionais. Este aqui vai além.',
    beneficios: [
      'Acervo completo, não só os treinos nacionais',
      'Provas processuais e de laboratório com imagem',
      'Simulados personalizados por tema, com impressão',
    ],
    fechamento: 'Incluso no plano Avançado.',
    cta: 'Ver planos',
  },
  'recurso-pago': {
    titulo: 'Recurso para assinantes',
    subtitulo: 'Este recurso faz parte dos planos pagos do BoraMed.',
    beneficios: [
      'Simulados nacionais sem limite',
      'Correção da Aurora nas questões discursivas',
      'Materiais e flashcards no plano Avançado',
    ],
    fechamento: 'Escolha o plano que faz sentido para o seu momento.',
    cta: 'Ver planos',
  },
};
