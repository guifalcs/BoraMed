import { Page, Locator } from '@playwright/test';

export class SimuladosPage {
  // ── Provas Home (seleção de categoria) ──────────────────────────────────

  readonly redeAfyaCard: Locator;
  readonly outrasFaculdadesCard: Locator;
  readonly heading: Locator;
  readonly montarSimuladoCard: Locator;
  readonly montarSimuladoUpgradeLabel: Locator;

  // ── Provas Afya (listagem) ──────────────────────────────────────────────

  readonly provaCards: Locator;
  readonly emptyState: Locator;
  readonly skeletonItems: Locator;
  readonly subtipoFilter: Locator;
  readonly periodoFilter: Locator;

  // ── Prova Detalhe ──────────────────────────────────────────────────────

  readonly provaTitle: Locator;
  readonly iniciarButton: Locator;
  readonly retomarButton: Locator;
  readonly visualizarLink: Locator;
  readonly modoSelector: Locator;

  // ── Tentativa Exec ─────────────────────────────────────────────────────

  readonly questaoCard: Locator;
  readonly alternativas: Locator;
  readonly proximaButton: Locator;
  readonly finalizarButton: Locator;
  readonly pausarButton: Locator;

  // ── Resultado ──────────────────────────────────────────────────────────

  readonly resultadoHeading: Locator;
  readonly notaDisplay: Locator;
  readonly revisarLink: Locator;

  constructor(private readonly page: Page) {
    // Home
    this.heading = page.getByRole('heading', { name: 'Simulados' });
    this.redeAfyaCard = page.getByRole('link', { name: /Rede Afya/i });
    this.outrasFaculdadesCard = page.getByText('Outras faculdades');
    // Card "Montar simulado": bloqueado (cadeado + CTA /planos) para o tier essencial.
    this.montarSimuladoCard = page.getByRole('link', { name: /Montar simulado/i });
    this.montarSimuladoUpgradeLabel = page.getByText('Disponível no plano Avançado');

    // Listagem
    this.provaCards = page.locator('app-prova-card');
    this.emptyState = page.locator('app-empty-state');
    this.skeletonItems = page.locator('.animate-pulse');
    this.subtipoFilter = page.locator('app-filtros-provas').first();
    this.periodoFilter = page.locator('app-filtros-provas').last();

    // Detalhe
    this.provaTitle = page.locator('h1');
    this.iniciarButton = page.getByRole('button', { name: /Iniciar prova/i });
    this.retomarButton = page.getByRole('button', { name: /Retomar/i });
    this.visualizarLink = page.getByText('Só quero ver as questões e o gabarito');
    this.modoSelector = page.locator('app-modo-selector');

    // Tentativa
    this.questaoCard = page.locator('app-questao-card');
    this.alternativas = page.locator('app-questao-card button');
    this.proximaButton = page.getByRole('button', { name: /Próxima/i });
    this.finalizarButton = page.getByRole('button', { name: /Finalizar/i });
    this.pausarButton = page.getByRole('button', { name: /Pausar/i });

    // Resultado
    this.resultadoHeading = page.getByRole('heading', { name: /Resultado/i });
    this.notaDisplay = page.locator('[data-testid="nota"]');
    this.revisarLink = page.getByRole('link', { name: /Revisar questões/i });
  }

  // ── Navigation helpers ─────────────────────────────────────────────────

  async gotoHome() {
    await this.page.goto('/dashboard/simulados');
  }

  async gotoRedeAfya() {
    await this.page.goto('/dashboard/simulados/rede-afya');
  }

  async gotoProva(provaId: string) {
    await this.page.goto(`/dashboard/simulados/${provaId}`);
  }

  async gotoVisualizar(provaId: string) {
    await this.page.goto(`/dashboard/simulados/${provaId}/visualizar`);
  }

  // ── Interaction helpers ────────────────────────────────────────────────

  async clickRedeAfya() {
    await this.redeAfyaCard.click();
  }

  async clickFirstProva() {
    await this.provaCards.first().locator('button').click();
  }

  async iniciarProva() {
    await this.iniciarButton.click();
  }

  async selecionarAlternativa(index: number) {
    await this.alternativas.nth(index).click();
  }

  async avancarQuestao() {
    await this.proximaButton.click();
  }

  async finalizarTentativa() {
    await this.finalizarButton.click();
  }

  // ── Wait helpers ────────────────────────────────────────────────────────

  async waitForProvasLoaded() {
    await this.page.waitForSelector('app-prova-card, app-empty-state', { timeout: 15000 });
  }

  async waitForDetalheLoaded() {
    await this.page.waitForSelector('h1, app-empty-state', { timeout: 15000 });
  }

  async waitForTentativaLoaded() {
    await this.page.waitForSelector('app-questao-card', { timeout: 15000 });
  }

  async waitForResultado() {
    await this.page.waitForSelector('[data-testid="nota"], h1', { timeout: 15000 });
  }
}
