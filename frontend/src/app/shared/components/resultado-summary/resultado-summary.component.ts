import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { ResultadoTentativa } from '../../../core/models/tentativa';
import { UiButtonComponent } from '../ui/button/ui-button.component';

interface TemaPrioritario {
  id: string;
  nome: string;
  taxa: number;
}

@Component({
  selector: 'app-resultado-summary',
  standalone: true,
  imports: [UiButtonComponent, DecimalPipe, RouterLink],
  templateUrl: './resultado-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultadoSummaryComponent {
  resultado = input.required<ResultadoTentativa>();
  isPersonalizado = input(false);
  backRota = input<string>('/dashboard/simulados');
  backLabel = input<string>('Todos os simulados');
  notaAnterior = input<number | null>(null);

  protected readonly provaId = computed(() => this.resultado().tentativa.prova_id);

  /** Prova deletada pelo admin: o resultado segue visível, mas sem ações de revisar/refazer */
  protected readonly provaRemovida = computed(() => this.provaId() === null);

  protected readonly nota = computed(() => this.resultado().tentativa.nota ?? 0);

  protected readonly deltaNota = computed(() => {
    const anterior = this.notaAnterior();
    if (anterior === null) return null;
    return Math.round((this.nota() - anterior) * 10) / 10;
  });

  protected readonly notaClass = computed(() => {
    const n = this.nota();
    if (n >= 70) return 'text-[var(--color-success)]';
    if (n >= 50) return 'text-[var(--color-warning)]';
    return 'text-[var(--color-danger)]';
  });

  protected readonly notaMensagem = computed(() => {
    const n = this.nota();
    if (n >= 70) return 'Ótimo desempenho!';
    if (n >= 50) return 'Desempenho razoável. Continue praticando.';
    return 'Precisa de mais prática. Revise os conteúdos.';
  });

  /** Há discursivas na tentativa (pontuação por pontos, não binária). */
  protected readonly temDiscursivas = computed(() =>
    this.resultado().respostas.some((r) => r.enviada_em || r.pontos != null),
  );

  /** Acertos = corretas (MC) + abertas com pontos >= 70 (mesmo threshold do app). */
  protected readonly acertos = computed(() => {
    if (!this.temDiscursivas()) return this.resultado().tentativa.acertos;
    return this.resultado().respostas.filter(
      (r) => r.correta === true || (r.pontos != null && r.pontos >= 70),
    ).length;
  });

  protected readonly total = computed(
    () => this.resultado().tentativa.total_pontuaveis ?? this.resultado().tentativa.total_questoes,
  );

  protected readonly tempoFormatado = computed(() => {
    const total = this.resultado().tentativa.tempo_acumulado_segundos;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  });

  protected readonly tempoMedioPorQuestao = computed(() => {
    const total = this.resultado().tentativa.tempo_acumulado_segundos;
    const qtd = this.resultado().tentativa.total_questoes;
    if (qtd === 0 || total === 0) return null;
    const media = Math.round(total / qtd);
    const m = Math.floor(media / 60);
    const s = media % 60;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  });

  protected readonly temaPrioritario = computed<TemaPrioritario | null>(() => {
    const temas = this.resultado().distribuicao_temas
      .filter((d) => d.total > 0)
      .map((d) => ({
        id: d.tema.id,
        nome: d.tema.nome,
        taxa: Math.round((d.acertos / d.total) * 100),
      }))
      .sort((a, b) => a.taxa - b.taxa);

    return temas[0] ?? null;
  });

  // Só expõe tema prioritário quando há aproveitamento abaixo de 70% (limiar de sucesso).
  // Evita classificar como "crítico" um tema em que o aluno foi bem.
  protected readonly temaPrioritarioParaRevisar = computed<TemaPrioritario | null>(() => {
    const tema = this.temaPrioritario();
    if (!tema || tema.taxa >= 70) return null;
    return tema;
  });

  protected readonly temasPrioritarios = computed<TemaPrioritario[]>(() => {
    const temaPrincipal = this.temaPrioritario();
    if (!temaPrincipal) return [];

    return this.resultado().distribuicao_temas
      .filter((d) => d.total > 0)
      .map((d) => ({
        id: d.tema.id,
        nome: d.tema.nome,
        taxa: Math.round((d.acertos / d.total) * 100),
      }))
      .filter((tema) => tema.taxa === temaPrincipal.taxa)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  protected readonly temEmpateEntreTemasPrioritarios = computed(() => this.temasPrioritarios().length > 1);

  protected readonly resumoTemasPrioritarios = computed(() => {
    const temas = this.temasPrioritarios().map((tema) => tema.nome);
    if (temas.length <= 2) {
      return temas.join(' e ');
    }
    return `${temas.slice(0, -1).join(', ')} e ${temas[temas.length - 1]}`;
  });

  protected readonly rotuloTemasPrioritarios = computed(() => {
    const temas = this.temasPrioritarios();
    if (temas.length === 0) return '';
    if (temas.length === 1) return temas[0].nome;
    return `${temas.length} temas com menor aproveitamento`;
  });

  protected readonly tituloTemasPrioritarios = computed(() =>
    this.temasPrioritarios().map((tema) => tema.nome).join(', '),
  );

  /** Erradas: MC incorretas + discursivas com pontos abaixo de 70. */
  protected readonly questoesErradas = computed(() =>
    this.resultado().respostas.filter(
      (resposta) =>
        resposta.correta === false ||
        (resposta.pontos != null && resposta.correta == null && resposta.pontos < 70),
    ).length,
  );

  protected readonly temQuestoesErradas = computed(() => this.questoesErradas() > 0);

  /** Questões anuladas (admin ou pelo aluno) que ficaram fora desta nota. */
  protected readonly questoesAnuladas = computed(() => {
    const anuladasQuestoes = new Set(
      this.resultado().questoes.filter((q) => q.anulada).map((q) => q.id),
    );
    return this.resultado().respostas.filter(
      (r) => r.anulada_usuario || anuladasQuestoes.has(r.questao_id),
    ).length;
  });

  protected readonly rotaRefazerEstudo = computed(() =>
    this.isPersonalizado()
      ? ['/dashboard/simulados/montar']
      : ['/dashboard/simulados', this.provaId()],
  );

  protected readonly modoOposto = computed(() =>
    this.resultado().tentativa.modo === 'estudo' ? 'simulado' : 'estudo',
  );

  protected readonly queryParamsRefazerEstudo = computed(() => {
    const modo = this.modoOposto();

    if (this.isPersonalizado()) {
      const params: Record<string, string | number> = {
        qtd: this.total(),
        modo,
      };

      const tema = this.temaPrioritario();
      if (tema && !this.temEmpateEntreTemasPrioritarios()) {
        params['temaId'] = tema.id;
      }

      return params;
    }

    return { modo };
  });

  protected readonly labelRefazerEstudo = computed(() => {
    const modo = this.modoOposto();
    const label = modo === 'estudo' ? 'modo estudo' : 'modo simulado';
    return this.isPersonalizado() ? `Montar treino em ${label}` : `Refazer em ${label}`;
  });

  protected readonly labelTreinoPrioritario = computed(() => {
    const taxa = this.temaPrioritario()?.taxa ?? 100;
    const plural = this.temEmpateEntreTemasPrioritarios();
    if (taxa < 50) return plural ? 'Revisar temas críticos' : 'Revisar tema crítico';
    return plural ? 'Revisar temas para melhorar' : 'Revisar tema para melhorar';
  });

  protected readonly descricaoTreinoPrioritario = computed(() => {
    const taxa = this.temaPrioritario()?.taxa ?? 0;
    if (taxa < 50) return `${taxa}% de acertos — tema que precisa de atenção urgente.`;
    return `${taxa}% de acertos — vale reforçar na próxima revisão.`;
  });

  protected readonly queryParamsTreinoPrioritario = computed(() => {
    const params: Record<string, string | number> = { qtd: 10, modo: 'estudo' };
    const tema = this.temaPrioritario();
    if (tema && !this.temEmpateEntreTemasPrioritarios()) {
      params['temaId'] = tema.id;
    }
    return params;
  });
}
