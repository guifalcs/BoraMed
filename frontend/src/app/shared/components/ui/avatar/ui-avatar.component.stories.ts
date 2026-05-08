import type { Meta, StoryObj } from '@storybook/angular';

import { UiAvatarComponent } from './ui-avatar.component';

const meta: Meta<UiAvatarComponent> = {
  title: 'Shared/UI/Avatar',
  component: UiAvatarComponent,
  tags: ['autodocs'],
  args: {
    avatarUrl: null,
    name: 'Guilherme Falcão',
    size: 'md',
  },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<UiAvatarComponent>;

export const WithImage: Story = {
  args: {
    avatarUrl: 'https://i.pravatar.cc/150?img=12',
    name: 'Guilherme Falcão',
    size: 'md',
  },
};

export const InitialsFallback: Story = {
  args: {
    avatarUrl: null,
    name: 'Guilherme Falcão',
    size: 'md',
  },
};

export const SingleNameFallback: Story = {
  args: {
    avatarUrl: null,
    name: 'Guilherme',
    size: 'md',
  },
};

export const SizeSmall: Story = {
  args: {
    avatarUrl: null,
    name: 'Guilherme Falcão',
    size: 'sm',
  },
};

export const SizeMedium: Story = {
  args: {
    avatarUrl: null,
    name: 'Guilherme Falcão',
    size: 'md',
  },
};

export const SizeLarge: Story = {
  args: {
    avatarUrl: null,
    name: 'Guilherme Falcão',
    size: 'lg',
  },
};

export const BrokenImageFallback: Story = {
  args: {
    avatarUrl: 'https://invalid.example.com/broken-image.png',
    name: 'Guilherme Falcão',
    size: 'md',
  },
};
