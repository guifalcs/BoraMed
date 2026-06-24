import { afterNextRender, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { inject as injectAnalytics } from '@vercel/analytics';
import { UiToastsContainerComponent } from './shared/components/ui/toast/ui-toasts-container.component';
import { NavigationProgressService } from './core/services/navigation-progress.service';

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
    afterNextRender(() => injectAnalytics());
  }
}
