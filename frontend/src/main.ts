import { bootstrapApplication } from '@angular/platform-browser';
import { inject as injectAnalytics } from '@vercel/analytics';
import * as Sentry from '@sentry/angular';
import { environment } from './environments/environment';
import { browserConfig } from './app/app.config.browser';
import { AppComponent } from './app/app.component';

if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

injectAnalytics();
bootstrapApplication(AppComponent, browserConfig).catch((err) => console.error(err));
