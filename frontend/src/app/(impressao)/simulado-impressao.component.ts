import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { ChevronLeft, Printer } from 'lucide-angular';
import { ImpressaoSimuladoService } from '../core/services/impressao-simulado.service';
import type { SimuladoImpressao, OpcoesImpressao, TamanhoFonteImpressao } from '../core/models/impressao';
import { OPCOES_IMPRESSAO_PADRAO } from '../core/models/impressao';
import type { QuestaoComAlternativas } from '../core/models/questao';
import { QuestaoImpressaoComponent } from './questao-impressao.component';
import { UiIconComponent } from '../shared/components/ui/icon/ui-icon.component';
import { UiButtonComponent } from '../shared/components/ui/button/ui-button.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';

const PREFS_KEY = 'impressao_opcoes';

type OpcoesPersistidas = Pick<OpcoesImpressao, 'marcacaoNaQuestao' | 'mostrarTema' | 'cartaoResposta' | 'mostrarImagens' | 'tamanhoFonte'>;

function carregarPrefs(): Partial<OpcoesPersistidas> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<OpcoesPersistidas>) : {};
  } catch {
    return {};
  }
}

interface GabaritoItem {
  numero: number;
  letra: string | null;
  explicacao: string | null;
  /** Gabarito de questão discursiva (no lugar da letra). */
  respostaModelo: string | null;
}

@Component({
  selector: 'app-simulado-impressao',
  standalone: true,
  imports: [RouterLink, QuestaoImpressaoComponent, UiIconComponent, UiButtonComponent, EmptyStateComponent],
  templateUrl: './simulado-impressao.component.html',
  styleUrls: ['./simulado-impressao.component.css'],
  providers: [provideMarkdown()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimuladoImpressaoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly impressaoService = inject(ImpressaoSimuladoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly printerIcon = Printer;

  protected readonly simulado = signal<SimuladoImpressao | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly opcoes = signal<OpcoesImpressao>({
    ...OPCOES_IMPRESSAO_PADRAO,
    ...(this.isBrowser ? carregarPrefs() : {}),
  });

  protected readonly dataHoje = new Date().toLocaleDateString('pt-BR');

  private readonly imagensCarregadas = signal(0);
  private readonly prontoFallback = signal(false);

  protected readonly questoes = computed(() => this.simulado()?.questoes ?? []);

  protected readonly totalImagens = computed(() => {
    if (!this.opcoes().mostrarImagens) return 0;
    return this.questoes().filter((q) => !!q.imagem_url).length;
  });

  protected readonly prontoParaImprimir = computed(
    () =>
      !this.isLoading() &&
      !this.erro() &&
      (this.imagensCarregadas() >= this.totalImagens() || this.prontoFallback()),
  );

  protected readonly fonteBase = computed(() => {
    const map: Record<TamanhoFonteImpressao, string> = {
      compacto: '10.5pt',
      normal: '11.5pt',
      grande: '13pt',
    };
    return map[this.opcoes().tamanhoFonte];
  });

  protected readonly subtitulo = computed(() => {
    const s = this.simulado();
    if (!s) return '';
    const partes = [`${s.qtdQuestoes} ${s.qtdQuestoes === 1 ? 'questão' : 'questões'}`];
    if (s.periodo) partes.push(`${s.periodo}º período`);
    if (s.formato) partes.push(this.formatoLabel(s.formato));
    return partes.join(' · ');
  });

  protected readonly podeIncluirGabarito = computed(() => this.simulado()?.gabaritoLiberado ?? false);

  protected readonly gabarito = computed<GabaritoItem[]>(() => {
    if (!this.opcoes().gabaritoAoFinal || !this.podeIncluirGabarito()) return [];
    return this.questoes().map((q, i) => ({
      numero: i + 1,
      letra: this.letraCorreta(q),
      explicacao: q.explicacao,
      respostaModelo: q.formato === 'resposta_aberta_curta' ? (q.resposta_modelo ?? null) : null,
    }));
  });

  protected readonly letrasCartao = ['A', 'B', 'C', 'D', 'E'];
  protected readonly tamanhosFonte: TamanhoFonteImpressao[] = ['compacto', 'normal', 'grande'];

  protected fonteBtnClass(t: TamanhoFonteImpressao): string {
    const base = 'flex-1 rounded border px-1.5 py-0.5 text-center text-xs capitalize';
    return this.opcoes().tamanhoFonte === t
      ? `${base} border-[var(--color-primary)] text-[var(--color-primary)]`
      : `${base} border-[var(--color-border)] text-[var(--color-text-muted)]`;
  }

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        const { marcacaoNaQuestao, mostrarTema, cartaoResposta, mostrarImagens, tamanhoFonte } = this.opcoes();
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify({ marcacaoNaQuestao, mostrarTema, cartaoResposta, mostrarImagens, tamanhoFonte }));
        } catch {}
      });
    }

    const modo = this.route.snapshot.data['modo'] as string | undefined;
    if (modo === 'efemero') {
      this.carregarEfemero();
    } else {
      void this.carregarPorProva();
    }

    if (this.isBrowser) {
      setTimeout(() => this.prontoFallback.set(true), 4000);
    }
  }

  private carregarEfemero(): void {
    if (!this.isBrowser) return;
    const efemero = this.impressaoService.simuladoEfemero();
    if (efemero) {
      this.simulado.set(efemero);
    } else {
      this.erro.set('Simulado não encontrado. Volte e gere o simulado novamente.');
    }
    this.isLoading.set(false);
  }

  private async carregarPorProva(): Promise<void> {
    const provaId = this.route.snapshot.paramMap.get('provaId') ?? '';
    const pedirGabarito = this.route.snapshot.queryParamMap.get('gabarito') === '1';

    const result = await this.impressaoService.buscarParaImpressao(provaId, true);
    if (result.ok) {
      this.simulado.set(result.data);
      if (pedirGabarito && result.data.gabaritoLiberado) {
        this.opcoes.update((o) => ({ ...o, gabaritoAoFinal: true }));
      }
    } else {
      this.erro.set(result.error);
    }
    this.isLoading.set(false);
  }

  protected toggleOpcao(chave: keyof OpcoesImpressao): void {
    this.opcoes.update((o) => ({ ...o, [chave]: !o[chave] }));
  }

  protected setMostrarImagens(valor: boolean): void {
    this.imagensCarregadas.set(0);
    this.opcoes.update((o) => ({ ...o, mostrarImagens: valor }));
  }

  protected setTamanhoFonte(valor: TamanhoFonteImpressao): void {
    this.opcoes.update((o) => ({ ...o, tamanhoFonte: valor }));
  }

  protected onImagemCarregada(): void {
    this.imagensCarregadas.update((n) => n + 1);
  }

  protected imprimir(): void {
    if (this.isBrowser) {
      window.print();
    }
  }

  private letraCorreta(questao: QuestaoComAlternativas): string | null {
    const correta = questao.alternativas.find((a) => a.correta === true);
    return correta?.letra ?? null;
  }

  private formatoLabel(formato: string): string {
    const map: Record<string, string> = {
      nacional: 'Nacional',
      processual: 'Processual',
      laboratorio: 'Laboratório',
      multiestacoes: 'Multiestações',
    };
    return map[formato] ?? formato;
  }
}
