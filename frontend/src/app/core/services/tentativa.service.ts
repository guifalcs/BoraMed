import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { GamificacaoService } from './gamificacao.service';
import { NotificationService } from './notification.service';
import type { Tentativa, TentativaResposta, ResultadoTentativa, ModoProva } from '../models/tentativa';
import type { QuestaoComAlternativas } from '../models/questao';
import type { ProvaResult } from './prova.service';

@Injectable({ providedIn: 'root' })
export class TentativaService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly gamificacao = inject(GamificacaoService);
  private readonly notifications = inject(NotificationService);
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
    } catch {
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

      await this.registrarXpTentativa(tentativaId);

      return { ok: true, data: resultado };
    } catch {
      return { ok: false, error: 'Não foi possível finalizar a tentativa.' };
    }
  }

  private async registrarXpTentativa(tentativaId: string): Promise<void> {
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
  ): Promise<ProvaResult<{ prova_id: string; tentativa: Tentativa; questoes: QuestaoComAlternativas[] }>> {
    const tipoQuestao = formato === 'todos' ? null : formato;
    try {
      const { data, error } = await this.supabase.rpc('gerar_simulado_personalizado', {
        p_tema_ids: temaIds && temaIds.length > 0 ? temaIds : null,
        p_qtd: qtd,
        p_modo: modo,
        p_tipo_questao: tipoQuestao,
        p_formato: formato === 'todos' ? null : formato,
      });

      if (error) {
        const msg = error.message || 'Não foi possível gerar o simulado.';
        return { ok: false, error: msg };
      }

      const result = data as { prova_id: string; tentativa: Tentativa; questoes: QuestaoComAlternativas[] };
      this._tentativaAtiva.set(result.tentativa);
      this._questoes.set(result.questoes);
      this._respostas.set([]);

      return { ok: true, data: result };
    } catch (e: unknown) {
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
