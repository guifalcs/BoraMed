import type { Meta, StoryObj } from '@storybook/angular';
import { ImageUploadComponent } from './image-upload.component';

const meta: Meta<ImageUploadComponent> = {
  title: 'Shared/ImageUpload',
  component: ImageUploadComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<ImageUploadComponent>;

export const SemImagem: Story = {
  args: { currentUrl: null },
};

export const ComImagemLandscape: Story = {
  args: {
    currentUrl: 'https://placehold.co/800x400/e2e8f0/64748b?text=Landscape+16x9',
  },
};

export const ComImagemRetrato: Story = {
  args: {
    currentUrl: 'https://placehold.co/400x600/e2e8f0/64748b?text=Retrato+2x3',
  },
};

export const ComImagemQuadrada: Story = {
  args: {
    currentUrl: 'https://placehold.co/500x500/e2e8f0/64748b?text=Quadrada',
  },
};
