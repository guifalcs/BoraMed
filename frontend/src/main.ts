import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
import { browserConfig } from './app/app.config.browser';
import { AppComponent } from './app/app.component';

if (environment.sentryDsn) {
  void import('@sentry/angular').then((Sentry) => {
    Sentry.init({
      dsn: environment.sentryDsn,
      environment: environment.production ? 'production' : 'development',
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.1,
    });
  });
}

bootstrapApplication(AppComponent, browserConfig)
  .then(() => import('@vercel/analytics').then(({ inject }) => inject()))
  .catch((err) => console.error(err));
