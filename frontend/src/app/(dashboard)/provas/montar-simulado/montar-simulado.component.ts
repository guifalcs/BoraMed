import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChevronLeft, Shuffle, Filter } from 'lucide-angular';
import { TemaService } from '../../../core/services/tema.service';
import { TentativaService } from '../../../core/services/tentativa.service';
import type { TemaComContagem } from '../../../core/models/tema';
import type { ModoProva } from '../../../core/models/tentativa';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { ModoSelectorComponent } from '../../../shared/components/modo-selector/modo-selector.component';

@Component({
  selector: 'app-montar-simulado',
  standalone: true,
  imports: [RouterLink, UiButtonComponent, UiIconComponent, ModoSelectorComponent],
  templateUrl: './montar-simulado.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MontarSimuladoComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly temaService = inject(TemaService);
  private readonly tentativaService = inject(TentativaService);

  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly shuffleIcon = Shuffle;
  protected readonly filterIcon = Filter;

  protected readonly temas = signal<TemaComContagem[]>([]);
  protected readonly isLoadingTemas = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly temasSelecionados = signal<Set<string>>(new Set());
  protected readonly quantidade = signal(10);
  protected readonly modoSelecionado = signal<ModoProva>('simulado');
  protected readonly gerando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly opcoesQtd = [5, 10, 15, 20, 30];

  /** Total de questões disponíveis considerando os temas selecionados */
  protected readonly questoesDisponiveis = computed(() => {
    const selecionados = this.temasSelecionados();
    const allTemas = this.temas();
    if (selecionados.size === 0) {
      // Sem filtro → total geral (soma sem duplicatas estimada)
      return allTemas.reduce((sum, t) => sum + t.qtd_questoes, 0);
    }
    return allTemas
      .filter((t) => selecionados.has(t.id))
      .reduce((sum, t) => sum + t.qtd_questoes, 0);
  });

  /** Temas que possuem pelo menos 1 questão */
  protected readonly temasComQuestoes = computed(() =>
    this.temas().filter((t) => t.qtd_questoes > 0),
  );

  /** Resumo textual dos temas selecionados */
  protected readonly resumoTemas = computed(() => {
    const selecionados = this.temasSelecionados();
    if (selecionados.size === 0) return 'Todos os temas';
    const nomes = this.temas()
      .filter((t) => selecionados.has(t.id))
      .map((t) => t.nome);
    if (nomes.length <= 3) return nomes.join(', ');
    return `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`;
  });

  /** Mensagem de aviso (não impede envio, apenas avisa) */
  protected readonly aviso = computed<string | null>(() => {
    const disponivel = this.questoesDisponiveis();
    const qtd = this.quantidade();
    if (disponivel === 0 && this.temasSelecionados().size > 0) {
      return 'Os temas selecionados não possuem questões cadastradas. Escolha outros temas.';
    }
    if (disponivel > 0 && disponivel < qtd) {
      return `Apenas ${disponivel} questão(ões) disponível(is) para os temas selecionados. O simulado será gerado com ${disponivel} questões.`;
    }
    return null;
  });

  /** Se o botão deve ficar desabilitado */
  protected readonly desabilitado = computed(() => {
    if (this.gerando()) return true;
    if (this.isLoadingTemas()) return true;
    const disponivel = this.questoesDisponiveis();
    if (this.temasSelecionados().size > 0 && disponivel === 0) return true;
    return false;
  });

  /** Label do botão */
  protected readonly botaoLabel = computed(() => {
    if (this.gerando()) return 'Gerando...';
    if (this.desabilitado() && !this.gerando()) return 'Selecione temas com questões';
    return 'Gerar simulado';
  });

  async ngOnInit(): Promise<void> {
    const result = await this.temaService.listarTemasComContagem();
    if (result.ok) {
      this.temas.set(result.data);
    } else {
      this.loadError.set(result.error);
    }
    this.isLoadingTemas.set(false);
  }

  protected toggleTema(temaId: string): void {
    this.erro.set(null);
    this.temasSelecionados.update((set) => {
      const next = new Set(set);
      if (next.has(temaId)) {
        next.delete(temaId);
      } else {
        next.add(temaId);
      }
      return next;
    });
  }

  protected limparTemas(): void {
    this.erro.set(null);
    this.temasSelecionados.set(new Set());
  }

  protected selecionarTodosComQuestoes(): void {
    this.erro.set(null);
    const ids = this.temasComQuestoes().map((t) => t.id);
    this.temasSelecionados.set(new Set(ids));
  }

  protected setQuantidade(qtd: number): void {
    this.erro.set(null);
    this.quantidade.set(qtd);
  }

  protected onModoChange(modo: ModoProva): void {
    this.modoSelecionado.set(modo);
  }

  protected async gerar(): Promise<void> {
    if (this.desabilitado()) return;

    this.gerando.set(true);
    this.erro.set(null);

    const temaIds = Array.from(this.temasSelecionados());
    const result = await this.tentativaService.gerarSimuladoPersonalizado(
      temaIds.length > 0 ? temaIds : null,
      this.quantidade(),
      this.modoSelecionado(),
    );

    this.gerando.set(false);

    if (result.ok) {
      const { prova_id, tentativa } = result.data;
      this.tentativaService.setProvaNome('Simulado personalizado');
      void this.router.navigate(['/dashboard/simulados', prova_id, 'tentativa', tentativa.id]);
    } else {
      this.erro.set(result.error);
    }
  }
}
