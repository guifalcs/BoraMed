import type { Meta, StoryObj } from '@storybook/angular';
import { GradeItemComponent } from './grade-item.component';

const meta: Meta<GradeItemComponent> = {
  title: 'Provas/GradeItem',
  component: GradeItemComponent,
  tags: ['autodocs'],
  args: { numero: 1, isAtual: false, isMarcada: false, respondida: false, errou: false },
};

export default meta;
type Story = StoryObj<GradeItemComponent>;

export const Idle: Story = {};

export const Atual: Story = { args: { isAtual: true } };

export const Respondida: Story = { args: { respondida: true } };

export const Errada: Story = { args: { respondida: true, errou: true } };

export const Marcada: Story = { args: { isMarcada: true } };

export const MarcadaAtual: Story = { args: { isAtual: true, isMarcada: true } };
