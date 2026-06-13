import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FocoModoService {
  readonly ativo = signal(false);

  toggle(): void {
    this.ativo.update((v) => !v);
  }

  desativar(): void {
    this.ativo.set(false);
  }
}
