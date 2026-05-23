import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import { AvisoModalComponent } from './aviso-modal.component';
import { AvisoService } from '../../../core/services/aviso.service';

const meta: Meta<AvisoModalComponent> = {
  title: 'Shared/AvisoModal',
  component: AvisoModalComponent,
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: AvisoService,
          useValue: {
            avisoAtual: signal({
              id: 'preview',
              titulo: 'Nova funcionalidade disponível!',
              mensagem: 'Agora você pode acompanhar seu desempenho com gráficos detalhados por disciplina.',
              imagem_url: 'https://placehold.co/560x300/6366f1/ffffff?text=Aviso',
              ativo: true,
              criado_em: new Date().toISOString(),
            }),
            temAvisos: signal(true),
            marcarVisto: () => Promise.resolve(),
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<AvisoModalComponent>;

export const ComTexto: Story = {};

export const SomenteImagem: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: AvisoService,
          useValue: {
            avisoAtual: signal({
              id: 'preview-img',
              titulo: null,
              mensagem: null,
              imagem_url: 'https://placehold.co/560x400/6366f1/ffffff?text=Aviso',
              ativo: true,
              criado_em: new Date().toISOString(),
            }),
            temAvisos: signal(true),
            marcarVisto: () => Promise.resolve(),
          },
        },
      ],
    }),
  ],
};

export const Vazio: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: AvisoService,
          useValue: {
            avisoAtual: signal(null),
            temAvisos: signal(false),
            marcarVisto: () => Promise.resolve(),
          },
        },
      ],
    }),
  ],
};
