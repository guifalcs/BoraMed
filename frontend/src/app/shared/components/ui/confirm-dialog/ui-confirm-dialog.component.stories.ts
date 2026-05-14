import type { Meta, StoryObj } from '@storybook/angular';
import { UiConfirmDialogComponent } from './ui-confirm-dialog.component';

const meta: Meta<UiConfirmDialogComponent> = {
  title: 'Shared/UI/ConfirmDialog',
  component: UiConfirmDialogComponent,
  tags: ['autodocs'],
  args: {
    titulo: 'Finalizar prova?',
    mensagem: 'Você ainda tem 3 questões sem resposta. Deseja finalizar mesmo assim?',
    labelConfirmar: 'Finalizar',
    labelCancelar: 'Voltar',
    variante: 'primary',
  },
  argTypes: {
    variante: {
      control: 'inline-radio',
      options: ['primary', 'danger'],
    },
  },
};

export default meta;
type Story = StoryObj<UiConfirmDialogComponent>;

export const Default: Story = {};

export const Danger: Story = {
  args: {
    titulo: 'Finalizar prova?',
    mensagem: 'Você ainda tem 5 questões sem resposta. Deseja finalizar mesmo assim?',
    labelConfirmar: 'Finalizar',
    variante: 'danger',
  },
};

export const AllAnswered: Story = {
  args: {
    titulo: 'Finalizar prova?',
    mensagem: 'Todas as questões foram respondidas. Deseja finalizar a prova?',
    labelConfirmar: 'Finalizar',
    variante: 'primary',
  },
};
