import type { Meta, StoryObj } from '@storybook/angular';
import { FileQuestionMark, ShieldAlert, ServerCrash } from 'lucide-angular';
import { ErrorStateComponent } from './error-state.component';

const meta: Meta<ErrorStateComponent> = {
  title: 'Shared/ErrorState',
  component: ErrorStateComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<ErrorStateComponent>;

export const Erro404ComPoloca: Story = {
  args: {
    codigo: '404',
    ilustracao: 'illustrations/404.png',
    titulo: 'Página não diagnosticada',
    mensagem: 'A URL que você buscou não consta no prontuário do sistema.',
    detalhe: 'Anamnese deu negativo.',
    acoes: [
      { label: 'Voltar ao início', variant: 'primary', tipo: 'inicio' },
      { label: 'Ver simulados', variant: 'secondary', tipo: 'simulados' },
    ],
  },
};

export const Erro404: Story = {
  args: {
    codigo: '404',
    icone: FileQuestionMark,
    titulo: 'Página não diagnosticada',
    mensagem: 'A URL que você buscou não consta no prontuário do sistema.',
    detalhe: 'Anamnese deu negativo.',
    acoes: [
      { label: 'Voltar ao início', variant: 'primary', tipo: 'inicio' },
      { label: 'Ver simulados', variant: 'secondary', tipo: 'simulados' },
    ],
  },
};

export const Erro403: Story = {
  args: {
    codigo: '403',
    icone: ShieldAlert,
    titulo: 'Acesso restrito',
    mensagem: 'Você não tem prontuário liberado para acessar essa área.',
    detalhe: null,
    acoes: [
      { label: 'Voltar', variant: 'secondary', tipo: 'voltar' },
      { label: 'Falar com suporte', variant: 'primary', tipo: 'suporte' },
    ],
  },
};

export const Erro500: Story = {
  args: {
    codigo: '500',
    icone: ServerCrash,
    titulo: 'Parada no servidor',
    mensagem: 'Nosso time já está aplicando o desfibrilador.',
    detalhe: null,
    acoes: [
      { label: 'Tentar novamente', variant: 'primary', tipo: 'retry' },
      { label: 'Voltar ao início', variant: 'secondary', tipo: 'inicio' },
    ],
  },
};

export const SemAcoes: Story = {
  args: {
    codigo: '404',
    icone: FileQuestionMark,
    titulo: 'Página não encontrada',
    mensagem: 'O endereço acessado não existe.',
    detalhe: null,
    acoes: [],
  },
};

export const SemDetalhe: Story = {
  args: {
    codigo: '403',
    icone: ShieldAlert,
    titulo: 'Acesso negado',
    mensagem: 'Você não tem permissão para acessar este recurso.',
    detalhe: null,
    acoes: [
      { label: 'Voltar', variant: 'secondary', tipo: 'voltar' },
    ],
  },
};
