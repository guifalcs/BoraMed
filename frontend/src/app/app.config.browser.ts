import { ErrorHandler, mergeApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { environment } from '../environments/environment';
import { appConfig } from './app.config';

class SentryErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);
    if (environment.sentryDsn) {
      void import('@sentry/angular').then(({ createErrorHandler }) => {
        createErrorHandler().handleError(error);
      });
    }
  }
}

export const browserConfig = mergeApplicationConfig(appConfig, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    ...(environment.sentryDsn ? [{ provide: ErrorHandler, useClass: SentryErrorHandler }] : []),
  ],
});
