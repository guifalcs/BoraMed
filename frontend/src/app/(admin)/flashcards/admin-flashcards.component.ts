import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Heart,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-angular';
import {
  AdminService,
  AdminFlashcardCardPayload,
  AdminFlashcardDeck,
  AdminFlashcardDeckPayload,
  AdminFlashcardsStats,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import {
  DataTableComponent,
  DataTableColumn,
} from '../../shared/components/data-table/data-table.component';
import { DataTableColumnDirective } from '../../shared/components/data-table/data-table-column.directive';
import { ImageUploadComponent } from '../../shared/components/image-upload/image-upload.component';

type Aba = 'decks' | 'metricas';
type ViewDecks = 'lista' | 'editor';

interface CardEdit {
  frente: string;
  verso: string;
  frente_imagem_url: string | null;
  verso_imagem_url: string | null;
}

const DATA_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function novoCardEdit(): CardEdit {
  return { frente: '', verso: '', frente_imagem_url: null, verso_imagem_url: null };
}

@Component({
  selector: 'app-admin-flashcards',
  standalone: true,
  imports: [
    FormsModule,
    UiConfirmDialogComponent,
    UiIconComponent,
    KpiCardComponent,
    DataTableComponent,
    DataTableColumnDirective,
    ImageUploadComponent,
    BaseChartDirective,
  ],
  templateUrl: './admin-flashcards.component.html',
  styleUrl: './admin-flashcards.component.css',
  providers: [provideCharts(withDefaultRegisterables())],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFlashcardsComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly iconBack = ArrowLeft;
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconUp = ArrowUp;
  protected readonly iconDown = ArrowDown;
  protected readonly iconLayers = Layers;
  protected readonly iconPencil = Pencil;
  protected readonly iconHeart = Heart;
  protected readonly iconUsers = Users;
  protected readonly iconChart = BarChart3;
  protected readonly iconSparkles = Sparkles;

  protected readonly aba = signal<Aba>('decks');

  // ---- Decks oficiais ----
  protected readonly view = signal<ViewDecks>('lista');
  protected readonly decks = signal<AdminFlashcardDeck[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly salvando = signal(false);
  protected readonly deckParaDeletar = signal<AdminFlashcardDeck | null>(null);

  protected readonly deckColumns: DataTableColumn[] = [
    { key: 'titulo', header: 'Título', sortable: true },
    { key: 'cards_count', header: 'Cards', sortable: true },
    { key: 'likes_count', header: 'Likes', sortable: true },
    { key: 'publico', header: 'Publicado', sortable: true },
    { key: 'atualizado_em', header: 'Atualizado', sortable: true },
    { key: 'acoes', header: '' },
  ];

  // ---- Editor ----
  protected readonly editandoId = signal<string | null>(null);
  protected readonly editTitulo = signal('');
  protected readonly editDescricao = signal('');
  protected readonly editPublico = signal(false);
  protected readonly editCards = signal<CardEdit[]>([novoCardEdit()]);

  protected readonly podeSalvar = computed(() => {
    const titulo = this.editTitulo().trim();
    const cards = this.editCards();
    if (titulo.length < 3 || titulo.length > 120) return false;
    if (cards.length < 1 || cards.length > 200) return false;
    return cards.every((c) => c.frente.trim().length > 0 && c.verso.trim().length > 0);
  });

  // ---- Métricas ----
  protected readonly stats = signal<AdminFlashcardsStats | null>(null);
  protected readonly isLoadingStats = signal(false);

  protected readonly kpisMetricas = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return [
      { label: 'Decks oficiais', valor: String(s.total_decks_oficiais), icone: this.iconLayers },
      { label: 'Decks de usuários', valor: String(s.total_decks_usuarios), icone: this.iconUsers },
      { label: 'Decks públicos', valor: String(s.total_decks_publicos), icone: this.iconSparkles },
      { label: 'Cards', valor: String(s.total_cards), icone: this.iconLayers },
      { label: 'Likes', valor: String(s.total_likes), icone: this.iconHeart },
      { label: 'Criadores', valor: String(s.total_criadores), icone: this.iconUsers },
    ];
  });

  protected readonly serieDecksPorDiaData = computed<ChartData<'bar'>>(() => {
    const serie = this.stats()?.serie_decks_por_dia ?? [];
    return {
      labels: serie.map((p) => this.formatDiaCurto(p.dia)),
      datasets: [
        {
          label: 'Decks criados',
          data: serie.map((p) => p.total),
          backgroundColor: '#6366f1',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 26,
        },
      ],
    };
  });

  protected readonly barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0, color: '#64748b', font: { size: 11 } } },
    },
  };

  protected readonly topPublicos = computed(() => this.stats()?.top_publicos_por_likes ?? []);

  async ngOnInit(): Promise<void> {
    await this.carregarDecks();
  }

  protected onTabChange(aba: Aba): void {
    this.aba.set(aba);
    if (aba === 'metricas' && !this.stats()) {
      void this.carregarStats();
    }
  }

  private async carregarDecks(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarFlashcardDecksOficiais();
    if (result.ok) {
      this.decks.set(result.data);
    } else {
      this.toast.error('Erro ao carregar decks oficiais.');
    }
    this.isLoading.set(false);
  }

  private async carregarStats(): Promise<void> {
    this.isLoadingStats.set(true);
    const result = await this.adminService.getFlashcardsStats();
    if (result.ok) {
      this.stats.set(result.data);
    } else {
      this.toast.error('Erro ao carregar métricas de flashcards.');
    }
    this.isLoadingStats.set(false);
  }

  protected novoDeck(): void {
    this.editandoId.set(null);
    this.editTitulo.set('');
    this.editDescricao.set('');
    this.editPublico.set(false);
    this.editCards.set([novoCardEdit()]);
    this.view.set('editor');
  }

  protected async editarDeck(deck: AdminFlashcardDeck): Promise<void> {
    const result = await this.adminService.obterFlashcardDeckOficial(deck.id);
    if (!result.ok) {
      this.toast.error('Erro ao carregar deck.');
      return;
    }
    this.editandoId.set(deck.id);
    this.editTitulo.set(result.data.titulo);
    this.editDescricao.set(result.data.descricao ?? '');
    this.editPublico.set(result.data.publico);
    this.editCards.set(
      result.data.cards.length > 0
        ? result.data.cards.map((c) => ({
            frente: c.frente,
            verso: c.verso,
            frente_imagem_url: c.frente_imagem_url,
            verso_imagem_url: c.verso_imagem_url,
          }))
        : [novoCardEdit()],
    );
    this.view.set('editor');
  }

  protected cancelarEdicao(): void {
    this.view.set('lista');
    this.editandoId.set(null);
  }

  protected adicionarCard(): void {
    this.editCards.update((lista) => [...lista, novoCardEdit()]);
  }

  protected removerCard(index: number): void {
    this.editCards.update((lista) => lista.filter((_, i) => i !== index));
  }

  protected moverCard(index: number, direcao: -1 | 1): void {
    this.editCards.update((lista) => {
      const alvo = index + direcao;
      if (alvo < 0 || alvo >= lista.length) return lista;
      const copia = [...lista];
      [copia[index], copia[alvo]] = [copia[alvo], copia[index]];
      return copia;
    });
  }

  protected setFrenteImagem(index: number, url: string | null): void {
    this.editCards.update((lista) =>
      lista.map((c, i) => (i === index ? { ...c, frente_imagem_url: url } : c)),
    );
  }

  protected setVersoImagem(index: number, url: string | null): void {
    this.editCards.update((lista) =>
      lista.map((c, i) => (i === index ? { ...c, verso_imagem_url: url } : c)),
    );
  }

  protected setFrenteTexto(index: number, valor: string): void {
    this.editCards.update((lista) => lista.map((c, i) => (i === index ? { ...c, frente: valor } : c)));
  }

  protected setVersoTexto(index: number, valor: string): void {
    this.editCards.update((lista) => lista.map((c, i) => (i === index ? { ...c, verso: valor } : c)));
  }

  protected async salvarDeck(): Promise<void> {
    if (!this.podeSalvar()) return;
    this.salvando.set(true);

    const payload: AdminFlashcardDeckPayload = {
      titulo: this.editTitulo().trim(),
      descricao: this.editDescricao().trim() || null,
      publico: this.editPublico(),
      cards: this.editCards().map((c): AdminFlashcardCardPayload => ({
        frente: c.frente.trim(),
        verso: c.verso.trim(),
        frente_imagem_url: c.frente_imagem_url,
        verso_imagem_url: c.verso_imagem_url,
      })),
    };

    const id = this.editandoId();
    const result = id
      ? await this.adminService.atualizarFlashcardDeckOficial(id, payload)
      : await this.adminService.criarFlashcardDeckOficial(payload);

    if (result.ok) {
      this.toast.success(id ? 'Deck atualizado.' : 'Deck criado.');
      this.view.set('lista');
      this.editandoId.set(null);
      await this.carregarDecks();
    } else {
      this.toast.error('Erro ao salvar deck. Tente novamente.');
    }
    this.salvando.set(false);
  }

  protected solicitarDelete(deck: AdminFlashcardDeck): void {
    this.deckParaDeletar.set(deck);
  }

  protected cancelarDelete(): void {
    this.deckParaDeletar.set(null);
  }

  protected async confirmarDelete(): Promise<void> {
    const deck = this.deckParaDeletar();
    if (!deck) return;
    this.deckParaDeletar.set(null);
    const result = await this.adminService.excluirFlashcardDeckOficial(deck.id);
    if (result.ok) {
      this.decks.update((lista) => lista.filter((d) => d.id !== deck.id));
      this.toast.success('Deck excluído.');
    } else {
      this.toast.error('Erro ao excluir deck.');
    }
  }

  protected formatarData(data: string | null | undefined): string {
    if (!data) return '—';
    return DATA_FMT.format(new Date(data));
  }

  private formatDiaCurto(dia: string): string {
    const [, mes, dataDia] = dia.split('-');
    return `${dataDia}/${mes}`;
  }
}
