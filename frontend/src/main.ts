import { bootstrapApplication } from '@angular/platform-browser';
import { inject as injectAnalytics } from '@vercel/analytics';
import { browserConfig } from './app/app.config.browser';
import { AppComponent } from './app/app.component';

injectAnalytics();
bootstrapApplication(AppComponent, browserConfig).catch((err) => console.error(err));
