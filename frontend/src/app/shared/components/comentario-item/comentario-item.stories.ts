import type { Meta, StoryObj } from '@storybook/angular';
import { ComentarioItemComponent } from './comentario-item.component';
import type { ComentarioQuestao } from '../../../core/models/comentario';

const base: ComentarioQuestao = {
  id: 'c1',
  parent_id: null,
  conteudo: 'Esta questão é sobre anafilaxia — a conduta inicial é sempre adrenalina IM, não corticoide.',
  status: 'ativo',
  editado: false,
  nome_display: 'Arthur Barata',
  avatar_url: null,
  user_id: 'u1',
  is_me: false,
  likes: 3,
  dislikes: 0,
  meu_voto: 0,
  criado_em: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  respostas: [],
};

const reply1: ComentarioQuestao = {
  id: 'c2',
  parent_id: 'c1',
  conteudo: 'Concordo. Lembrar também que o sítio de aplicação preferencial é o vasto lateral da coxa.',
  status: 'ativo',
  editado: false,
  nome_display: 'Maria Silva',
  avatar_url: null,
  user_id: 'u2',
  is_me: false,
  likes: 1,
  dislikes: 0,
  meu_voto: 0,
  criado_em: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  respostas: [],
};

const reply2: ComentarioQuestao = {
  id: 'c3',
  parent_id: 'c1',
  conteudo: 'Boa explicação, salvei aqui.',
  status: 'ativo',
  editado: true,
  nome_display: 'João Pedro',
  avatar_url: null,
  user_id: 'u3',
  is_me: true,
  likes: 0,
  dislikes: 0,
  meu_voto: 0,
  criado_em: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  respostas: [],
};

const meta: Meta<ComentarioItemComponent> = {
  title: 'Comentarios/ComentarioItem',
  component: ComentarioItemComponent,
  tags: ['autodocs'],
  args: {
    comentario: base,
    nivel: 0,
  },
};

export default meta;
type Story = StoryObj<ComentarioItemComponent>;

export const RaizSemRespostas: Story = {};

export const RaizComRespostas: Story = {
  args: {
    comentario: {
      ...base,
      respostas: [reply1, reply2],
    },
  },
};

export const ComVotosLike: Story = {
  args: {
    comentario: {
      ...base,
      likes: 7,
      meu_voto: 1,
    },
  },
};

export const ComVotosDislike: Story = {
  args: {
    comentario: {
      ...base,
      dislikes: 2,
      meu_voto: -1,
    },
  },
};

export const Anonimo: Story = {
  args: {
    comentario: {
      ...base,
      user_id: null,
      avatar_url: null,
      nome_display: 'Anônimo',
    },
  },
};

export const Dono: Story = {
  args: {
    comentario: {
      ...base,
      is_me: true,
      editado: true,
    },
  },
};

export const Removido: Story = {
  args: {
    comentario: {
      ...base,
      status: 'removido',
      conteudo: null,
    },
  },
};

export const NivelResposta: Story = {
  args: {
    comentario: {
      ...base,
      id: 'c2',
      parent_id: 'c1',
      conteudo: 'Complementando: a dose padrão é 0,3 mg para adultos.',
      nome_display: 'Maria Silva',
    },
    nivel: 1,
  },
};

export const MuitosLikes: Story = {
  args: {
    comentario: {
      ...base,
      likes: 127,
      dislikes: 14,
      meu_voto: 1,
    },
  },
};
