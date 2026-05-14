import { mergeApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { appConfig } from './app.config';

export const browserConfig = mergeApplicationConfig(appConfig, {
  providers: [provideBrowserGlobalErrorListeners()],
});
