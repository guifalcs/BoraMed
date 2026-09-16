import { Injectable, computed, inject, signal } from '@angular/core';
import { AvisoService } from './aviso.service';
import { SupabaseService } from './supabase.service';
import type { PesquisaPendente, RespostaItemInput } from '../models/pesquisa.types';

/** Mapeia os `raise exception` de `responder_pesquisa` para texto de UI. */
const ERROS_RESPOSTA: Record<string, string> = {
  P0021: 'Esta pesquisa não está mais disponível.',
  P0022: 'Você já respondeu esta pesquisa.',
  P0023: 'Esta pergunta aceita apenas uma alternativa.',
  P0024: 'Responda as perguntas obrigatórias.',
};

/**
 * Pesquisas in-app. Mesma mecânica do `AvisoService`: o dashboard chama
 * `verificar()` ao entrar e o modal consome a primeira da fila.
 */
@Injectable({ providedIn: 'root' })
export class PesquisaService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly avisoService = inject(AvisoService);
  private readonly _pendentes = signal<PesquisaPendente[]>([]);

  readonly pesquisaAtual = computed(() => this._pendentes()[0] ?? null);
  readonly temPesquisas = computed(() => this._pendentes().length > 0);

  /**
   * Carrega a fila. Precisa rodar DEPOIS de `AvisoService.verificarAvisos()`:
   * havendo aviso pendente, a pesquisa nem é buscada e fica para a próxima
   * entrada. A decisão é aqui, e não na visibilidade do modal, senão fechar o
   * aviso faria a pesquisa pular na cara do aluno no mesmo instante — dois
   * modais na mesma entrada, que é o que se quer evitar.
   */
  async verificar(): Promise<void> {
    if (this.avisoService.temAvisos()) return;

    const { data, error } = await this.supabase.rpc('buscar_pesquisas_pendentes');
    if (!error && data) {
      this._pendentes.set(data as PesquisaPendente[]);
    }
  }

  async responder(
    pesquisaId: string,
    itens: RespostaItemInput[],
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await this.supabase.rpc('responder_pesquisa', {
      p_pesquisa_id: pesquisaId,
      p_itens: itens,
    });

    if (error) {
      return { ok: false, error: ERROS_RESPOSTA[error.code ?? ''] ?? 'Não deu para enviar agora. Tente de novo.' };
    }

    this.remover(pesquisaId);
    return { ok: true };
  }

  /**
   * "Agora não": a pesquisa não volta a aparecer para este usuário. Só sai da
   * fila se o banco confirmou — tirar mesmo com erro faria a pesquisa voltar
   * na próxima entrada, depois de o aluno ter dito que não queria.
   */
  async dispensar(pesquisaId: string): Promise<boolean> {
    const { error } = await this.supabase.rpc('dispensar_pesquisa', { p_pesquisa_id: pesquisaId });
    if (error) return false;

    this.remover(pesquisaId);
    return true;
  }

  private remover(pesquisaId: string): void {
    this._pendentes.update((lista) => lista.filter((p) => p.id !== pesquisaId));
  }
}
