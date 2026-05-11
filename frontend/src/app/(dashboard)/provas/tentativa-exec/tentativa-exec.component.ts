import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TentativaService } from '../../../core/services/tentativa.service';
import { TimerService } from '../../../core/services/timer.service';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { Tentativa, ModoProva } from '../../../core/models/tentativa';
import { ProvaHeaderComponent } from '../../../shared/components/prova-header/prova-header.component';
import { QuestaoCardComponent } from '../../../shared/components/questao-card/questao-card.component';

@Component({
  selector: 'app-tentativa-exec',
  standalone: true,
  imports: [RouterLink, ProvaHeaderComponent, QuestaoCardComponent],
  providers: [TimerService],
  templateUrl: './tentativa-exec.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TentativaExecComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tentativaService = inject(TentativaService);
  private readonly timer = inject(TimerService);

  protected readonly tentativa = signal<Tentativa | null>(null);
  protected readonly questoes = signal<QuestaoComAlternativas[]>([]);
  protected readonly questaoAtualIdx = signal(0);
  protected readonly respostas = signal<Map<string, string>>(new Map());
  protected readonly respostasCorretas = signal<Map<string, string>>(new Map());
  protected readonly isLoading = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly timerSeconds = this.timer.seconds;

  protected readonly questaoAtual = computed(() => {
    const q = this.questoes();
    const idx = this.questaoAtualIdx();
    return q[idx] ?? null;
  });

  protected readonly modo = computed<ModoProva>(() => this.tentativa()?.modo ?? 'simulado');

  protected readonly totalRespondidas = computed(() => this.respostas().size);

  protected readonly respostaSelecionadaAtual = computed(() => {
    const q = this.questaoAtual();
    if (!q) return null;
    return this.respostas().get(q.id) ?? null;
  });

  protected readonly alternativaCorretaAtual = computed(() => {
    const q = this.questaoAtual();
    if (!q) return null;
    return this.respostasCorretas().get(q.id) ?? null;
  });

  async ngOnInit(): Promise<void> {
    const tentativaId = this.route.snapshot.paramMap.get('tentativaId') ?? '';

    const tentativaAtiva = this.tentativaService.tentativaAtiva();
    const questoesAtivas = this.tentativaService.questoes();

    if (tentativaAtiva?.id === tentativaId && questoesAtivas.length > 0) {
      this.tentativa.set(tentativaAtiva);
      this.questoes.set(questoesAtivas);

      const respostasMap = new Map<string, string>();
      for (const r of this.tentativaService.respostas()) {
        if (r.alternativa_id) {
          respostasMap.set(r.questao_id, r.alternativa_id);
        }
      }
      this.respostas.set(respostasMap);
      this.timer.start(tentativaAtiva.tempo_acumulado_segundos);
      this.isLoading.set(false);
    } else {
      this.erro.set('Tentativa não encontrada. Volte e tente novamente.');
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.timer.stop();
  }

  protected async onResponder(alternativaId: string): Promise<void> {
    const tentativa = this.tentativa();
    const questao = this.questaoAtual();
    if (!tentativa || !questao) return;

    const anteriorResposta = this.respostas().get(questao.id);
    if (anteriorResposta === alternativaId) return;

    this.respostas.update((m) => {
      const next = new Map(m);
      next.set(questao.id, alternativaId);
      return next;
    });

    const result = await this.tentativaService.salvarResposta(
      tentativa.id,
      questao.id,
      alternativaId,
    );

    if (result.ok && this.modo() === 'estudo') {
      const altCorreta = questao.alternativas.find((a) => a.correta)?.id ?? null;
      if (altCorreta) {
        this.respostasCorretas.update((m) => {
          const next = new Map(m);
          next.set(questao.id, altCorreta);
          return next;
        });
      }

      if (this.questaoAtualIdx() < this.questoes().length - 1) {
        setTimeout(() => this.questaoAtualIdx.update((i) => i + 1), 1200);
      }
    }
  }

  protected irParaQuestao(idx: number): void {
    this.questaoAtualIdx.set(idx);
  }

  protected proximaQuestao(): void {
    if (this.questaoAtualIdx() < this.questoes().length - 1) {
      this.questaoAtualIdx.update((i) => i + 1);
    }
  }

  protected questaoAnterior(): void {
    if (this.questaoAtualIdx() > 0) {
      this.questaoAtualIdx.update((i) => i - 1);
    }
  }

  protected async onPausar(): Promise<void> {
    const tentativa = this.tentativa();
    if (!tentativa) return;

    this.timer.pause();
    await this.tentativaService.pausar(tentativa.id);
    void this.router.navigate(['/dashboard/provas', tentativa.prova_id]);
  }

  protected async onFinalizar(): Promise<void> {
    const tentativa = this.tentativa();
    if (!tentativa) return;

    this.salvando.set(true);
    this.timer.pause();

    const result = await this.tentativaService.finalizar(tentativa.id);

    this.salvando.set(false);

    if (result.ok) {
      void this.router.navigate([
        '/dashboard/provas',
        tentativa.prova_id,
        'tentativa',
        tentativa.id,
        'resultado',
      ]);
    }
  }
}
