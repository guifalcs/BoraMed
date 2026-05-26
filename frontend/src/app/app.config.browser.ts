import { APP_INITIALIZER, ErrorHandler, mergeApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';
import { environment } from '../environments/environment';
import { appConfig } from './app.config';

export const browserConfig = mergeApplicationConfig(appConfig, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    ...(environment.sentryDsn ? [
      { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
      { provide: Sentry.TraceService, deps: [Router] },
      { provide: APP_INITIALIZER, useFactory: () => () => {}, deps: [Sentry.TraceService], multi: true },
    ] : []),
  ],
});
