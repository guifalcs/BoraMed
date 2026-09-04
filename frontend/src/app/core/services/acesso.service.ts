import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';

/** Chave do id de dispositivo no localStorage. */
const DEVICE_KEY = 'boramed_device_id';

/** Intervalo entre pings enquanto o app está aberto. */
const INTERVALO_MS = 30 * 60 * 1000;

/**
 * Registra no servidor de onde a conta está sendo usada (IP + dispositivo),
 * para o monitoramento de contas compartilhadas em /admin/acessos.
 *
 * O IP não é enviado daqui: quem o resolve é o RPC, a partir do header que o
 * Cloudflare escreve na borda do Supabase. O cliente só contribui com um id de
 * dispositivo — um UUID no localStorage que distingue dois navegadores atrás do
 * mesmo IP. É apagável pelo usuário e serve como indício, nunca como prova.
 *
 * Falhas são silenciosas de propósito: monitoramento não pode atrapalhar o uso.
 */
@Injectable({ providedIn: 'root' })
export class AcessoService implements OnDestroy {
  private readonly supabase = inject(SupabaseService).client;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private timer: ReturnType<typeof setInterval> | null = null;
  private ultimoPing = 0;

  /** Idempotente: chamadas repetidas não criam timers duplicados. */
  iniciar(): void {
    if (!this.isBrowser || this.timer) return;
    void this.ping();
    this.timer = setInterval(() => void this.ping(), INTERVALO_MS);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  parar(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isBrowser) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    this.parar();
  }

  // A aba pode ficar horas em segundo plano com o timer estrangulado pelo
  // navegador; ao voltar ao primeiro plano, repõe o ping se já passou a janela.
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void this.ping();
  };

  private async ping(): Promise<void> {
    if (!this.isBrowser) return;
    // Folga de 1 min: o setInterval pode disparar poucos ms antes da janela
    // fechar e o ping seria descartado até a rodada seguinte.
    if (Date.now() - this.ultimoPing < INTERVALO_MS - 60_000) return;
    this.ultimoPing = Date.now();
    try {
      await this.supabase.rpc('registrar_acesso', { p_device_id: this.deviceId() });
    } catch {
      /* monitoramento é best-effort */
    }
  }

  private deviceId(): string | null {
    try {
      const salvo = localStorage.getItem(DEVICE_KEY);
      if (salvo) return salvo;
      const novo = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, novo);
      return novo;
    } catch {
      // Storage bloqueado (aba anônima com restrição, iframe): segue sem id.
      return null;
    }
  }
}
