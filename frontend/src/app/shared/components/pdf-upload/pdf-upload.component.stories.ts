import type { Meta, StoryObj } from '@storybook/angular';
import { PdfUploadComponent } from './pdf-upload.component';

const meta: Meta<PdfUploadComponent> = {
  title: 'Materiais/PdfUpload',
  component: PdfUploadComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<PdfUploadComponent>;

export const SemArquivo: Story = {
  args: { currentPath: null, prefix: 'resumos-apg' },
};

export const ComArquivo: Story = {
  args: {
    currentPath: 'resumos-apg/abc123.pdf',
    prefix: 'resumos-apg',
  },
};
