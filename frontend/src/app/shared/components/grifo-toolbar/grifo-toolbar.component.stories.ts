import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { GrifoToolbarComponent } from './grifo-toolbar.component';
import { GrifoService } from '../../../core/services/grifo.service';
import { CORES_PADRAO, type FerramentaGrifo } from '../../utils/grifo';

/**
 * O estojo lê o estado direto do `GrifoService`, então cada story empurra o
 * serviço para a situação que quer mostrar antes de renderizar.
 */
function comEstado(config: {
  ativo: boolean;
  ferramenta?: FerramentaGrifo;
  /** Grifa um trecho fictício na questão da story (liga o botão de limpar). */
  questaoGrifada?: boolean;
}) {
  return applicationConfig({
    providers: [
      {
        provide: GrifoService,
        useFactory: () => {
          const servico = new GrifoService();
          servico.iniciar('story');
          if (config.ferramenta) servico.selecionarFerramenta(config.ferramenta);
          if (config.questaoGrifada) servico.grifar('q1', 'enunciado', 0, 12);
          servico.modoAtivo.set(config.ativo);
          return servico;
        },
      },
    ],
  });
}

const meta: Meta<GrifoToolbarComponent> = {
  title: 'Provas/GrifoToolbar',
  component: GrifoToolbarComponent,
  tags: ['autodocs'],
  args: { questaoId: 'q1' },
  // O dock é `fixed`: o palco com altura evita que ele encoste na borda do preview.
  render: (args) => ({
    props: args,
    template: `
      <div style="height: 220px; position: relative;">
        <app-grifo-toolbar [questaoId]="questaoId" />
      </div>
    `,
  }),
};

export default meta;
type Story = StoryObj<GrifoToolbarComponent>;

/** Fechado: só o botão, como o aluno vê ao abrir a prova. */
export const Guardado: Story = {
  decorators: [comEstado({ ativo: false })],
};

/** Aberto na cor padrão. */
export const ComMarcaTexto: Story = {
  decorators: [comEstado({ ativo: true, ferramenta: CORES_PADRAO[0] })],
};

/** Outra cor escolhida: o botão principal assume a cor da ponta. */
export const CorVerde: Story = {
  decorators: [comEstado({ ativo: true, ferramenta: CORES_PADRAO[1] })],
};

/** Borracha na mão: a dica muda junto. */
export const Borracha: Story = {
  decorators: [comEstado({ ativo: true, ferramenta: 'borracha' })],
};

/** Cor escolhida no espectro: entra como atalho ao lado dos fixos, e o ícone
 *  do botão principal inverte para branco por cima de uma cor escura. */
export const CorDoEspectro: Story = {
  decorators: [comEstado({ ativo: true, ferramenta: '#1d4ed8' })],
};

/** Questão já grifada: aparece o botão de limpar tudo. */
export const QuestaoComGrifos: Story = {
  decorators: [comEstado({ ativo: true, ferramenta: CORES_PADRAO[2], questaoGrifada: true })],
};
