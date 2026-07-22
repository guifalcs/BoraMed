import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { GamificacaoService } from './gamificacao.service';
import { NotificationService } from './notification.service';
import { CacheService, CACHE_KEYS } from './cache.service';
import { TIER_UPGRADE_REQUIRED, isTierUpgradeError } from '../utils/tier-error.util';
import type { Tentativa, TentativaResposta, ResultadoTentativa, ModoProva } from '../models/tentativa';
import type { RespostaCorrecao, StatusCorrecoesTentativa } from '../models/correcao';
import type { QuestaoComAlternativas } from '../models/questao';
import type { ProvaResult } from './prova.service';

@Injectable({ providedIn: 'root' })
export class TentativaService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly gamificacao = inject(GamificacaoService);
  private readonly notifications = inject(NotificationService);
  private readonly cache = inject(CacheService);
  private hydrationPromise: Promise<void> | null = null;

  private readonly _tentativaAtiva = signal<Tentativa | null>(null);
  private readonly _questoes = signal<QuestaoComAlternativas[]>([]);
  private readonly _respostas = signal<TentativaResposta[]>([]);
  private readonly _provaNome = signal<string>('');
  private readonly _lastResultado = signal<ResultadoTentativa | null>(null);

  readonly tentativaAtiva = this._tentativaAtiva.asReadonly();
  readonly questoes = this._questoes.asReadonly();
  readonly respostas = this._respostas.asReadonly();
  readonly provaNome = this._provaNome.asReadonly();
  readonly lastResultado = this._lastResultado.asReadonly();

  constructor() {
    if (this.isBrowser) {
      this._lastResultado.set(TentativaService.readLastResultadoFromStorage());
    }
  }

  private static readLastResultadoFromStorage(): ResultadoTentativa | null {
    try {
      const raw = sessionStorage.getItem('lastResultado');
      return raw ? (JSON.parse(raw) as ResultadoTentativa) : null;
    } catch {
      return null;
    }
  }

  setProvaNome(nome: string): void {
    this._provaNome.set(nome);
  }

  setLastResultado(resultado: ResultadoTentativa): void {
    this._lastResultado.set(resultado);
    if (this.isBrowser) {
      try {
        sessionStorage.setItem('lastResultado', JSON.stringify(resultado));
      } catch {}
    }
  }

  async hidratarTentativaAtiva(): Promise<void> {
    const tentativaAtual = this._tentativaAtiva();
    if (!this.isBrowser) return;
    if (tentativaAtual && tentativaAtual.status !== 'finalizada' && tentativaAtual.modo !== 'visualizar') {
      return;
    }
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this.buscarTentativaAtivaRecente()
      .then((result) => {
        if (result.ok) {
          this._tentativaAtiva.set(result.data);
        }
      })
      .finally(() => {
        this.hydrationPromise = null;
      });

    return this.hydrationPromise;
  }

  async buscarTentativaAtiva(provaId: string): Promise<ProvaResult<Tentativa | null>> {
    try {
      const user = this.auth.user();
      if (!user) return { ok: true, data: null };

      const { data, error } = await this.supabase
        .from('tentativa')
        .select('*')
        .eq('user_id', user.id)
        .eq('prova_id', provaId)
        .in('status', ['em_andamento', 'pausada'])
        .neq('modo', 'visualizar')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { ok: true, data: (data as Tentativa | null) };
    } catch {
      return { ok: false, error: 'Não foi possível verificar tentativas ativas.' };
    }
  }

  async buscarTentativaAtivaRecente(): Promise<ProvaResult<Tentativa | null>> {
    try {
      const user = this.auth.user();
      if (!user) return { ok: true, data: null };

      const { data, error } = await this.supabase
        .from('tentativa')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['em_andamento', 'pausada'])
        .neq('modo', 'visualizar')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { ok: true, data: (data as Tentativa | null) };
    } catch {
      return { ok: false, error: 'Não foi possível carregar a tentativa em andamento.' };
    }
  }

  async prepararVisualizacao(
    provaId: string,
  ): Promise<ProvaResult<{ questoes: QuestaoComAlternativas[] }>> {
    try {
      // Gabarito de revisão via RPC (colunas de resposta revogadas das tabelas).
      const { data, error } = await this.supabase.rpc('get_revisao_prova', { p_prova_id: provaId });
      if (error) throw error;
      const questoes = ((data as { questoes?: unknown } | null)?.questoes ?? []) as QuestaoComAlternativas[];

      const tentativaSintetica: Tentativa = {
        id: provaId,
        user_id: '',
        prova_id: provaId,
        modo: 'visualizar',
        status: 'em_andamento',
        total_questoes: questoes.length,
        total_respondidas: 0,
        acertos: 0,
        nota: null,
        iniciada_em: new Date().toISOString(),
        pausada_em: null,
        tempo_acumulado_segundos: 0,
        finalizada_em: null,
        criado_em: new Date().toISOString(),
      };

      this._tentativaAtiva.set(tentativaSintetica);
      this._questoes.set(questoes);
      this._respostas.set([]);

      return { ok: true, data: { questoes } };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as questões.' };
    }
  }

  /**
   * Carrega questões de um simulado personalizado via tentativa_resposta,
   * já que as questões não pertencem à prova (pertencem às provas originais).
   */
  async prepararVisualizacaoPersonalizado(
    provaId: string,
  ): Promise<ProvaResult<{ questoes: QuestaoComAlternativas[] }>> {
    try {
      // Mesma RPC de revisão; cobre provas regulares e personalizadas.
      const { data, error } = await this.supabase.rpc('get_revisao_prova', { p_prova_id: provaId });
      if (error) throw error;
      const questoes = ((data as { questoes?: unknown } | null)?.questoes ?? []) as QuestaoComAlternativas[];

      this._questoes.set(questoes);
      this._respostas.set([]);

      return { ok: true, data: { questoes } };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as questões.' };
    }
  }

  async iniciar(
    provaId: string,
    modo: ModoProva,
  ): Promise<ProvaResult<{ tentativa: Tentativa; questoes: QuestaoComAlternativas[] }>> {
    try {
      const { data, error } = await this.supabase.rpc('iniciar_tentativa', {
        p_prova_id: provaId,
        p_modo: modo,
      });

      if (error) throw error;

      const result = data as { tentativa: Tentativa; questoes: QuestaoComAlternativas[] };
      this._tentativaAtiva.set(result.tentativa);
      this._questoes.set(result.questoes);
      this._respostas.set([]);

      return { ok: true, data: result };
    } catch (e: unknown) {
      if (isTierUpgradeError(e)) return { ok: false, error: TIER_UPGRADE_REQUIRED };
      return { ok: false, error: 'Não foi possível iniciar a tentativa.' };
    }
  }

  async retomar(
    tentativaId: string,
  ): Promise<ProvaResult<{ tentativa: Tentativa; questoes: QuestaoComAlternativas[] }>> {
    try {
      const { data, error } = await this.supabase.rpc('retomar_tentativa', {
        p_tentativa_id: tentativaId,
      });

      if (error) throw error;

      const result = data as { tentativa: Tentativa; questoes: QuestaoComAlternativas[] };
      this._tentativaAtiva.set(result.tentativa);
      this._questoes.set(result.questoes);

      const { data: respostasData, error: respostasError } = await this.supabase
        .from('tentativa_resposta')
        .select('*')
        .eq('tentativa_id', tentativaId)
        .order('ordem_na_tentativa', { ascending: true })
        .order('id', { ascending: true });

      if (!respostasError) {
        this._respostas.set((respostasData ?? []) as TentativaResposta[]);
      }

      return { ok: true, data: result };
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      if (message.includes('Tentativa já finalizada')) {
        return { ok: false, error: 'Esta tentativa já foi finalizada. Abra o resultado pelo histórico.' };
      }
      if (message.includes('Tentativa não encontrada') || message.includes('sem permissão')) {
        return { ok: false, error: 'Tentativa não encontrada ou sem permissão para acesso.' };
      }
      return { ok: false, error: 'Não foi possível retomar a tentativa. Tente novamente em instantes.' };
    }
  }

  async salvarResposta(
    tentativaId: string,
    questaoId: string,
    alternativaId: string,
  ): Promise<ProvaResult<TentativaResposta>> {
    try {
      const { data, error } = await this.supabase
        .rpc('salvar_resposta_tentativa', {
          p_tentativa_id: tentativaId,
          p_questao_id: questaoId,
          p_alternativa_id: alternativaId,
        });

      if (error) throw error;

      const resposta = data as TentativaResposta;
      this._respostas.update((prev) => {
        const idx = prev.findIndex((r) => r.questao_id === questaoId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = resposta;
          return next;
        }
        return [...prev, resposta];
      });

      return { ok: true, data: resposta };
    } catch {
      return { ok: false, error: 'Não foi possível salvar a resposta.' };
    }
  }

  /**
   * Aluno anula/desanula a questão na tentativa ativa (só questões sem recurso
   * e não anuladas pelo admin). A questão sai das métricas da tentativa.
   */
  async anularQuestao(
    tentativaId: string,
    questaoId: string,
    anular: boolean,
  ): Promise<ProvaResult<TentativaResposta>> {
    try {
      const { data, error } = await this.supabase.rpc('anular_questao_usuario', {
        p_tentativa_id: tentativaId,
        p_questao_id: questaoId,
        p_anular: anular,
      });

      if (error) throw error;

      const resposta = data as TentativaResposta;
      this.atualizarRespostaLocal(resposta);
      return { ok: true, data: resposta };
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      if (message.includes('recurso cadastrado')) {
        return { ok: false, error: 'Questão com recurso cadastrado não pode ser anulada.' };
      }
      if (message.includes('ja anulada')) {
        return { ok: false, error: 'Esta questão já foi anulada pela administração.' };
      }
      return { ok: false, error: 'Não foi possível anular a questão.' };
    }
  }

  /** Salva rascunho de resposta aberta (editável até o envio definitivo). */
  async salvarRespostaTexto(
    tentativaId: string,
    questaoId: string,
    texto: string,
  ): Promise<ProvaResult<TentativaResposta>> {
    try {
      const { data, error } = await this.supabase.rpc('salvar_resposta_texto', {
        p_tentativa_id: tentativaId,
        p_questao_id: questaoId,
        p_texto: texto,
      });

      if (error) throw error;

      const resposta = data as TentativaResposta;
      this.atualizarRespostaLocal(resposta);
      return { ok: true, data: resposta };
    } catch (e: unknown) {
      if (getErrorMessage(e).includes('ja enviada')) {
        return { ok: false, error: 'Esta resposta já foi enviada e não pode ser alterada.' };
      }
      return { ok: false, error: 'Não foi possível salvar o rascunho.' };
    }
  }

  /** Envio definitivo da resposta aberta: trava a edição e registra a correção pendente. */
  async enviarRespostaAberta(
    tentativaId: string,
    questaoId: string,
    texto: string,
  ): Promise<ProvaResult<{ resposta: TentativaResposta; correcao: RespostaCorrecao }>> {
    try {
      const { data, error } = await this.supabase.rpc('enviar_resposta_aberta', {
        p_tentativa_id: tentativaId,
        p_questao_id: questaoId,
        p_texto: texto,
      });

      if (error) throw error;

      const result = data as { resposta: TentativaResposta; correcao: RespostaCorrecao };
      this.atualizarRespostaLocal(result.resposta);
      return { ok: true, data: result };
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      if (message.includes('ja enviada')) {
        return { ok: false, error: 'Esta resposta já foi enviada.' };
      }
      if (message.includes('vazia')) {
        return { ok: false, error: 'Escreva uma resposta antes de enviar.' };
      }
      return { ok: false, error: 'Não foi possível enviar a resposta.' };
    }
  }

  /** Correções de IA das respostas enviadas (restauração pós-F5; RLS: dono lê). */
  async listarCorrecoes(
    tentativaRespostaIds: string[],
  ): Promise<ProvaResult<RespostaCorrecao[]>> {
    if (tentativaRespostaIds.length === 0) return { ok: true, data: [] };
    try {
      const { data, error } = await this.supabase
        .from('resposta_correcao')
        .select('*')
        .in('tentativa_resposta_id', tentativaRespostaIds);
      if (error) throw error;
      return { ok: true, data: (data ?? []) as RespostaCorrecao[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as correções.' };
    }
  }

  /** Status agregado das correções de IA da tentativa (polling do resultado). */
  async getStatusCorrecoes(tentativaId: string): Promise<ProvaResult<StatusCorrecoesTentativa>> {
    try {
      const { data, error } = await this.supabase.rpc('get_status_correcoes', {
        p_tentativa_id: tentativaId,
      });
      if (error) throw error;
      return { ok: true, data: data as StatusCorrecoesTentativa };
    } catch {
      return { ok: false, error: 'Não foi possível consultar o status das correções.' };
    }
  }

  /**
   * Fecha a nota da tentativa quando todas as correções terminaram.
   * `forcarSemIa` marca as restantes como sem_ia (timeout da tela de resultado).
   */
  async consolidarCorrecoes(
    tentativaId: string,
    forcarSemIa = false,
  ): Promise<ProvaResult<ResultadoTentativa & { consolidada: boolean }>> {
    try {
      const { data, error } = await this.supabase.rpc('consolidar_correcoes_tentativa', {
        p_tentativa_id: tentativaId,
        p_forcar_sem_ia: forcarSemIa,
      });
      if (error) throw error;
      return { ok: true, data: data as ResultadoTentativa & { consolidada: boolean } };
    } catch {
      return { ok: false, error: 'Não foi possível consolidar as correções.' };
    }
  }

  private atualizarRespostaLocal(resposta: TentativaResposta): void {
    this._respostas.update((prev) => {
      const idx = prev.findIndex((r) => r.questao_id === resposta.questao_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = resposta;
        return next;
      }
      return [...prev, resposta];
    });
  }

  async pausar(tentativaId: string, tempoSegundos?: number): Promise<ProvaResult<void>> {
    // Atualização otimista e síncrona — antes do await, para que qualquer
    // leitura imediata do signal (ex: retorno rápido via smart nav) já
    // encontre tempo_acumulado_segundos correto.
    this._tentativaAtiva.update((t) =>
      t
        ? {
            ...t,
            status: 'pausada',
            pausada_em: new Date().toISOString(),
            tempo_acumulado_segundos: tempoSegundos ?? t.tempo_acumulado_segundos,
          }
        : t,
    );

    try {
      const { error } = await this.supabase.rpc('pausar_tentativa', {
        p_tentativa_id: tentativaId,
        p_tempo_segundos: tempoSegundos ?? null,
      });

      if (error) throw error;
      return { ok: true, data: undefined };
    } catch {
      return { ok: false, error: 'Não foi possível pausar a tentativa.' };
    }
  }

  async finalizar(tentativaId: string, tempoSegundos?: number): Promise<ProvaResult<ResultadoTentativa>> {
    try {
      const { data, error } = await this.supabase.rpc('finalizar_tentativa', {
        p_tentativa_id: tentativaId,
        p_tempo_segundos: tempoSegundos ?? null,
      });

      if (error) throw error;

      const resultado = data as ResultadoTentativa;
      this._tentativaAtiva.update((t) =>
        t ? { ...t, status: 'finalizada', finalizada_em: new Date().toISOString() } : t,
      );

      // Invalida os painéis que dependem das tentativas/estatísticas — sem isso,
      // o Início e o Histórico exibem dados defasados (sem a nova tentativa, XP e
      // streak antigos) por até 5 min, dando a impressão de que nada aconteceu.
      this.cache.remove(CACHE_KEYS.inicio);
      this.cache.remove(CACHE_KEYS.historico);

      // Com correções de IA pendentes a nota ainda não fechou — o XP é
      // concedido pela tela de resultado após a consolidação (RPC idempotente).
      if (!resultado.correcoes_pendentes) {
        await this.registrarXpTentativa(tentativaId);
      }

      return { ok: true, data: resultado };
    } catch {
      return { ok: false, error: 'Não foi possível finalizar a tentativa.' };
    }
  }

  async registrarXpTentativa(tentativaId: string): Promise<void> {
    const result = await this.gamificacao.concederXpTentativa(tentativaId);
    if (result.ok && result.data.xp_ganho > 0) {
      this.notifications.success(`+${result.data.xp_ganho} XP conquistados`);
    }
    if (result.ok && result.data.novas_conquistas.length > 0) {
      const primeira = result.data.novas_conquistas[0];
      this.notifications.success(`Conquista desbloqueada: ${primeira.nome}`);
    }
  }

  async gerarSimuladoPersonalizado(
    temaIds: string[] | null,
    qtd: number,
    modo: ModoProva = 'simulado',
    formato: 'todos' | 'nacional' | 'processual' | 'laboratorio' = 'todos',
    formatoQuestao: 'fechadas' | 'discursivas' | 'misto' = 'fechadas',
  ): Promise<ProvaResult<{ prova_id: string; tentativa: Tentativa; questoes: QuestaoComAlternativas[] }>> {
    const tipoQuestao = formato === 'todos' ? null : formato;
    try {
      const { data, error } = await this.supabase.rpc('gerar_simulado_personalizado', {
        p_tema_ids: temaIds && temaIds.length > 0 ? temaIds : null,
        p_qtd: qtd,
        p_modo: modo,
        p_tipo_questao: tipoQuestao,
        p_formato: formato === 'todos' ? null : formato,
        p_formato_questao: formatoQuestao,
      });

      if (error) {
        if (isTierUpgradeError(error)) return { ok: false, error: TIER_UPGRADE_REQUIRED };
        const msg = error.message || 'Não foi possível gerar o simulado.';
        return { ok: false, error: msg };
      }

      const result = data as { prova_id: string; tentativa: Tentativa; questoes: QuestaoComAlternativas[] };
      this._tentativaAtiva.set(result.tentativa);
      this._questoes.set(result.questoes);
      this._respostas.set([]);

      return { ok: true, data: result };
    } catch (e: unknown) {
      if (isTierUpgradeError(e)) return { ok: false, error: TIER_UPGRADE_REQUIRED };
      const msg = e instanceof Error ? e.message : 'Não foi possível gerar o simulado.';
      return { ok: false, error: msg };
    }
  }

  async buscarNotaAnterior(provaId: string, tentativaAtualId: string): Promise<number | null> {
    try {
      const user = this.auth.user();
      if (!user) return null;

      const { data, error } = await this.supabase
        .from('tentativa')
        .select('nota')
        .eq('user_id', user.id)
        .eq('prova_id', provaId)
        .eq('status', 'finalizada')
        .neq('id', tentativaAtualId)
        .neq('modo', 'visualizar')
        .not('nota', 'is', null)
        .order('finalizada_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return (data as { nota: number }).nota;
    } catch {
      return null;
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}
