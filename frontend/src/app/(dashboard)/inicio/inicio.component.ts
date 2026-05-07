import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-inicio',
  standalone: true,
  template: `
    <div class="placeholder">
      <p class="placeholder-label">Selecione uma seção no menu para começar.</p>
    </div>
  `,
  styles: [`
    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 3rem 1.5rem;
    }
    .placeholder-label {
      color: var(--color-text-muted);
      font-size: 0.9375rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent {}
