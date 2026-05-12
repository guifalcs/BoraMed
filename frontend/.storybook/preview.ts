import type { Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideMarkdown } from 'ngx-markdown';

const preview: Preview = {
  decorators: [
    applicationConfig({ providers: [provideMarkdown()] }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
