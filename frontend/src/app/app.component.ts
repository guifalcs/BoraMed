import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiToastsContainerComponent } from './shared/components/ui/toast/ui-toasts-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UiToastsContainerComponent],
  standalone: true,
  template: `
    <router-outlet />
    <app-ui-toasts-container />
  `,
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
