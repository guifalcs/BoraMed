import type { Meta, StoryObj } from '@storybook/angular';
import { PdfViewerComponent } from './pdf-viewer.component';

const meta: Meta<PdfViewerComponent> = {
  title: 'Materiais/PdfViewer',
  component: PdfViewerComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<PdfViewerComponent>;

export const SemArquivo: Story = {
  args: { signedUrl: null },
};

export const ComArquivo: Story = {
  args: {
    signedUrl: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  },
};
