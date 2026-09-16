import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { X } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { PesquisaService } from '../../../core/services/pesquisa.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type {
  PesquisaPergunta,
  RespostaItemInput,
} from '../../../core/models/pesquisa.types';

interface ValorResposta {
  texto: string;
  numero: number | null;
  opcaoIds: string[];
}

const VALOR_VAZIO: ValorResposta = { texto: '', numero: null, opcaoIds: [] };

/**
 * Modal de pesquisa na entrada do app. Responder nunca é obrigatório: fechar,
 * Esc ou "Agora não" dispensam de vez (`dispensar_pesquisa`).
 *
 * Só aparece quando não há aviso na fila — dois modais empilhados na mesma
 * entrada seriam ruído; o aviso é comunicação do produto e vem primeiro.
 */
@Component({
  selector: 'app-pesquisa-modal',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './pesquisa-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PesquisaModalComponent {
  private readonly pesquisaService = inject(PesquisaService);
  private readonly auth = inject(AuthService);

  protected readonly pesquisa = this.pesquisaService.pesquisaAtual;
  protected readonly enviado = signal(false);
  // `enviado` mantém o modal montado depois de a pesquisa sair da fila: é
  // nesse intervalo que o agradecimento aparece.
  //
  // Escondido durante impersonação: o serviço é root-scoped e trocar de
  // usuário é navegação de SPA, então a fila carregada na sessão do admin
  // sobrevive — responder ali gravaria resposta no nome do aluno, e "Agora
  // não" queimaria a dispensa dele. Quem decide se a pesquisa aparece para o
  // aluno é o aluno.
  protected readonly visivel = computed(
    () =>
      (this.pesquisaService.temPesquisas() || this.enviado()) &&
      !this.auth.impersonando(),
  );

  protected readonly valores = signal<Record<string, ValorResposta>>({});
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly faltandoDestacadas = signal<string[]>([]);

  protected readonly iconX = X;

  /** Perguntas obrigatórias ainda sem conteúdo. */
  protected readonly faltando = computed(() => {
    const atual = this.pesquisa();
    if (!atual) return [];
    const valores = this.valores();
    return atual.perguntas
      .filter((p) => p.obrigatoria && !temConteudo(valores[p.id]))
      .map((p) => p.id);
  });

  protected valor(perguntaId: string): ValorResposta {
    return this.valores()[perguntaId] ?? VALOR_VAZIO;
  }

  protected escalaValores(pergunta: PesquisaPergunta): number[] {
    const min = pergunta.tipo === 'nps' ? 0 : pergunta.escala_min;
    const max = pergunta.tipo === 'nps' ? 10 : pergunta.escala_max;
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  protected setTexto(perguntaId: string, event: Event): void {
    const alvo = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.atualizar(perguntaId, (v) => ({ ...v, texto: alvo.value }));
  }

  protected setNumero(perguntaId: string, numero: number): void {
    this.atualizar(perguntaId, (v) => ({ ...v, numero: v.numero === numero ? null : numero }));
  }

  protected setOpcaoUnica(perguntaId: string, opcaoId: string): void {
    this.atualizar(perguntaId, (v) => ({
      ...v,
      opcaoIds: v.opcaoIds[0] === opcaoId ? [] : [opcaoId],
    }));
  }

  protected toggleOpcao(perguntaId: string, opcaoId: string): void {
    this.atualizar(perguntaId, (v) => ({
      ...v,
      opcaoIds: v.opcaoIds.includes(opcaoId)
        ? v.opcaoIds.filter((id) => id !== opcaoId)
        : [...v.opcaoIds, opcaoId],
    }));
  }

  protected marcada(perguntaId: string, opcaoId: string): boolean {
    return this.valor(perguntaId).opcaoIds.includes(opcaoId);
  }

  protected destacada(perguntaId: string): boolean {
    return this.faltandoDestacadas().includes(perguntaId);
  }

  protected async enviar(): Promise<void> {
    const atual = this.pesquisa();
    if (!atual || this.enviando()) return;

    const pendentes = this.faltando();
    if (pendentes.length > 0) {
      this.faltandoDestacadas.set(pendentes);
      this.erro.set('Responda as perguntas marcadas com *.');
      return;
    }

    this.enviando.set(true);
    this.erro.set(null);

    const valores = this.valores();
    const itens: RespostaItemInput[] = atual.perguntas
      .filter((p) => temConteudo(valores[p.id]))
      .map((p) => {
        const v = valores[p.id];
        return {
          pergunta_id: p.id,
          texto: v.texto.trim() || null,
          numero: v.numero,
          opcao_ids: v.opcaoIds,
        };
      });

    const resultado = await this.pesquisaService.responder(atual.id, itens);
    this.enviando.set(false);

    if (!resultado.ok) {
      this.erro.set(resultado.error);
      return;
    }

    // A pesquisa já saiu da fila; o agradecimento fica no lugar dela por um
    // instante antes de a próxima (se houver) aparecer.
    this.enviado.set(true);
    setTimeout(() => {
      this.enviado.set(false);
      this.limpar();
    }, 1800);
  }

  protected async dispensar(): Promise<void> {
    const atual = this.pesquisa();
    if (!atual || this.enviando() || this.enviado()) return;

    const ok = await this.pesquisaService.dispensar(atual.id);
    if (!ok) {
      this.erro.set('Não deu para fechar agora. Tente de novo.');
      return;
    }
    this.limpar();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.visivel()) void this.dispensar();
  }

  private atualizar(perguntaId: string, fn: (valor: ValorResposta) => ValorResposta): void {
    this.valores.update((mapa) => ({
      ...mapa,
      [perguntaId]: fn(mapa[perguntaId] ?? VALOR_VAZIO),
    }));
    if (this.faltandoDestacadas().includes(perguntaId)) {
      this.faltandoDestacadas.update((ids) => ids.filter((id) => id !== perguntaId));
    }
    // O aviso de "faltou responder" não pode sobreviver ao usuário corrigindo.
    if (this.erro()) this.erro.set(null);
  }

  private limpar(): void {
    this.valores.set({});
    this.erro.set(null);
    this.faltandoDestacadas.set([]);
  }
}

function temConteudo(valor: ValorResposta | undefined): boolean {
  if (!valor) return false;
  return valor.texto.trim().length > 0 || valor.numero !== null || valor.opcaoIds.length > 0;
}
