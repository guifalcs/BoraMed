import { afterNextRender, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiToastsContainerComponent } from './shared/components/ui/toast/ui-toasts-container.component';
import { NavigationProgressService } from './core/services/navigation-progress.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UiToastsContainerComponent],
  standalone: true,
  template: `
    @if (nav.loading()) {
      <div class="nav-progress" role="progressbar" aria-label="Carregando" aria-busy="true"></div>
    }
    <router-outlet />
    <app-ui-toasts-container />
  `,
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected readonly nav = inject(NavigationProgressService);

  constructor() {
    // Só em produção, como no main.ts: fora da Vercel o `/_vercel/insights/script.js`
    // não existe e o dev-server responde com index.html. O browser tenta executar
    // HTML como JS, o SyntaxError sobe como erro não tratado e a hidratação morre
    // — na prática o app local fica sem nenhum listener (o form de login submetia
    // por GET, com a senha na query string).
    if (environment.production) {
      afterNextRender(() => {
        void import('@vercel/analytics').then(({ inject }) => inject());
      });
    }
  }
}
