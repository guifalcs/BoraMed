import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Aviso } from '../models/aviso.types';

@Injectable({ providedIn: 'root' })
export class AvisoService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _pendentes = signal<Aviso[]>([]);

  readonly avisoAtual = computed(() => this._pendentes()[0] ?? null);
  readonly temAvisos = computed(() => this._pendentes().length > 0);

  async verificarAvisos(): Promise<void> {
    const { data, error } = await this.supabase.rpc('buscar_avisos_pendentes');
    if (!error && data) {
      this._pendentes.set(data as Aviso[]);
    }
  }

  async marcarVisto(avisoId: string): Promise<void> {
    await this.supabase.rpc('marcar_aviso_visto', { p_aviso_id: avisoId });
    this._pendentes.update(lista => lista.filter(a => a.id !== avisoId));
  }
}
