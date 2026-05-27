import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  DesafioDiario,
  DesafioAlternativa,
  DesafioQuestao,
  DesafioEstatistica,
  DesafioMinhaResposta,
  GamificacaoStats,
  ResponderDesafioResult,
} from '../models/gamificacao';
import { parseConquistas } from './conquista.service';

type DesafioResult<T> = { ok: true; data: T } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class DesafioService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _desafio = signal<DesafioDiario | null>(null);

  readonly desafio = this._desafio.asReadonly();

  async carregarDesafio(): Promise<DesafioResult<DesafioDiario>> {
    try {
      const { data, error } = await this.supabase.rpc('get_desafio_diario');
      if (error) throw error;
      const desafio = parseDesafio(data);
      this._desafio.set(desafio);
      return { ok: true, data: desafio };
    } catch (err) {
      console.error('Erro ao carregar desafio:', err);
      return { ok: false, error: 'Não foi possível carregar o desafio de hoje.' };
    }
  }

  async responderDesafio(
    alternativaId: string,
    tempoSegundos?: number,
  ): Promise<DesafioResult<ResponderDesafioResult>> {
    try {
      const { data, error } = await this.supabase.rpc('responder_desafio_diario', {
        p_alternativa_id: alternativaId,
        p_tempo_segundos: tempoSegundos ?? null,
      });
      if (error) throw error;
      const result = parseResponderResult(data);
      // Refetch para obter alternativas com campo `correta` (retornado apenas após resposta)
      await this.carregarDesafio();
      return { ok: true, data: result };
    } catch (err) {
      console.error('Erro ao responder desafio:', err);
      return { ok: false, error: 'Não foi possível registrar sua resposta.' };
    }
  }
}

function parseResponderResult(value: unknown): ResponderDesafioResult {
  const r = asRecord(value);
  return {
    ja_respondeu: r['ja_respondeu'] === true,
    correta: r['correta'] === true,
    xp_ganho: toNumber(r['xp_ganho']),
    novas_conquistas: parseConquistas(r['novas_conquistas']),
    stats: parseLocalStats(r['stats']),
    estatistica: parseEstatistica(r['estatistica']),
  };
}

function parseLocalStats(value: unknown): GamificacaoStats {
  const r = asRecord(value);
  return {
    xp_total: toNumber(r['xp_total']),
    xp_semana_atual: toNumber(r['xp_semana_atual']),
    semana_iso: typeof r['semana_iso'] === 'string' ? r['semana_iso'] : null,
    nivel: toNumber(r['nivel']),
    streak_atual: toNumber(r['streak_atual']),
    streak_recorde: toNumber(r['streak_recorde']),
    freezes_disponiveis: toNumber(r['freezes_disponiveis']),
    competir_publico: typeof r['competir_publico'] === 'boolean' ? r['competir_publico'] : true,
  };
}

function parseDesafio(value: unknown): DesafioDiario {
  const r = asRecord(value);
  if (r['disponivel'] === false) {
    return {
      disponivel: false,
      data: null,
      questao: null,
      alternativas: [],
      estatistica: { total_responderam: 0, percentual_acerto: 0 },
      minha_resposta: null,
    };
  }
  return {
    disponivel: true,
    data: typeof r['data'] === 'string' ? r['data'] : null,
    questao: parseQuestao(r['questao']),
    alternativas: parseAlternativas(r['alternativas']),
    estatistica: parseEstatistica(r['estatistica']),
    minha_resposta: parseMinhaResposta(r['minha_resposta']),
  };
}

function parseQuestao(value: unknown): DesafioQuestao | null {
  const r = asRecord(value);
  const id = r['id'];
  const enunciado = r['enunciado'];
  if (typeof id !== 'string' || typeof enunciado !== 'string') return null;
  return {
    id,
    enunciado,
    enunciado_apoio: typeof r['enunciado_apoio'] === 'string' ? r['enunciado_apoio'] : null,
    imagem_url: typeof r['imagem_url'] === 'string' ? r['imagem_url'] : null,
    disciplina: typeof r['disciplina'] === 'string' ? r['disciplina'] : null,
    explicacao: typeof r['explicacao'] === 'string' ? r['explicacao'] : null,
  };
}

function parseAlternativas(value: unknown): DesafioAlternativa[] {
  if (!Array.isArray(value)) return [];
  const result: DesafioAlternativa[] = [];
  for (const item of value) {
    const r = asRecord(item);
    const id = r['id'];
    const letra = r['letra'];
    const texto = r['texto'];
    if (typeof id !== 'string' || typeof letra !== 'string' || typeof texto !== 'string') {
      continue;
    }
    const alt: DesafioAlternativa = {
      id,
      letra,
      texto,
      ordem: toNumber(r['ordem']),
    };
    if (typeof r['correta'] === 'boolean') {
      alt.correta = r['correta'];
    }
    result.push(alt);
  }
  return result;
}

function parseEstatistica(value: unknown): DesafioEstatistica {
  const r = asRecord(value);
  return {
    total_responderam: toNumber(r['total_responderam']),
    percentual_acerto: toNumber(r['percentual_acerto']),
  };
}

function parseMinhaResposta(value: unknown): DesafioMinhaResposta | null {
  const r = asRecord(value);
  const altId = r['alternativa_id'];
  if (typeof altId !== 'string') return null;
  return {
    alternativa_id: altId,
    correta: r['correta'] === true,
    xp_ganho: toNumber(r['xp_ganho']),
    respondido_em:
      typeof r['respondido_em'] === 'string' ? r['respondido_em'] : new Date().toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
