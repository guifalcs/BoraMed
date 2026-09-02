import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { AppNotificacao } from '../models/app-notification.types';

@Injectable({ providedIn: 'root' })
export class AppNotificacaoService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _notificacoes = signal<AppNotificacao[]>([]);

  readonly notificacoes = this._notificacoes.asReadonly();
  readonly naoLidas = computed(() => this._notificacoes().filter(n => !n.lida).length);

  async carregar(limit = 20): Promise<void> {
    const { data, error } = await this.supabase.rpc('buscar_notificacoes', { p_limit: limit });
    if (!error && data) {
      this._notificacoes.set(data as AppNotificacao[]);
    }
  }

  async marcarLida(id: string): Promise<void> {
    await this.supabase.rpc('marcar_notificacao_lida', { p_id: id });
    this._notificacoes.update(lista =>
      lista.map(n => n.id === id ? { ...n, lida: true, lida_em: n.lida_em ?? new Date().toISOString() } : n)
    );
  }

  async marcarTodasLidas(): Promise<void> {
    await this.supabase.rpc('marcar_todas_notificacoes_lidas');
    this._notificacoes.update(lista => lista.map(n => ({ ...n, lida: true, lida_em: n.lida_em ?? new Date().toISOString() })));
  }
}
