import type { Meta, StoryObj } from '@storybook/angular';
import { ProvaHeaderComponent } from './prova-header.component';

const meta: Meta<ProvaHeaderComponent> = {
  title: 'Provas/ProvaHeader',
  component: ProvaHeaderComponent,
  tags: ['autodocs'],
  args: {
    titulo: 'Prova Nacional Afya — N1 · 2024',
    totalQuestoes: 30,
    totalRespondidas: 0,
    segundos: 3600,
    modo: 'simulado',
    salvando: false,
  },
  argTypes: {
    modo: { control: 'inline-radio', options: ['simulado', 'estudo', 'visualizar'] },
  },
};

export default meta;
type Story = StoryObj<ProvaHeaderComponent>;

export const Inicio: Story = {};

export const Meio: Story = { args: { totalRespondidas: 15, segundos: 1800 } };

export const Completo: Story = { args: { totalRespondidas: 30, segundos: 600 } };

export const ModoEstudo: Story = { args: { modo: 'estudo', totalRespondidas: 8, segundos: 1200 } };

export const ModoVisualizar: Story = { args: { modo: 'visualizar', totalRespondidas: 5 } };

export const Salvando: Story = { args: { salvando: true, totalRespondidas: 30 } };
