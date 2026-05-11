import { Injectable, DestroyRef, inject, signal, computed } from '@angular/core';

@Injectable()
export class TimerService {
  private readonly destroyRef = inject(DestroyRef);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private readonly _seconds = signal(0);

  readonly seconds = this._seconds.asReadonly();

  readonly formatted = computed(() => {
    const total = this._seconds();
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
  }

  start(initialSeconds = 0): void {
    this._seconds.set(initialSeconds);
    this.clearInterval();
    this.intervalId = setInterval(() => {
      this._seconds.update((s) => s + 1);
    }, 1000);
  }

  pause(): void {
    this.clearInterval();
  }

  resume(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this._seconds.update((s) => s + 1);
    }, 1000);
  }

  stop(): void {
    this.clearInterval();
    this._seconds.set(0);
  }

  private clearInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
