import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { AdminUserSearchComponent } from './admin-user-search.component';
import { AdminService } from '../../../core/services/admin.service';
import type { Profile } from '../../../core/models/auth.types';

function perfilMock(overrides: Partial<Profile>): Profile {
  return {
    id: crypto.randomUUID(),
    email: 'aluno@example.com',
    criado_em: '2026-01-10T12:00:00Z',
    nome_completo: 'Aluno Exemplo',
    avatar_url: null,
    tipo_usuario: 'estudante_medicina',
    periodo: 3,
    faculdade_rede: 'rede_afya',
    competir_publico: true,
    papel: 'aluno',
    atualizado_em: '2026-06-01T12:00:00Z',
    ultimo_login: '2026-07-01T09:30:00Z',
    banido: false,
    banido_em: null,
    banido_por: null,
    motivo_banimento: null,
    ...overrides,
  };
}

const usuariosMock: Profile[] = [
  perfilMock({ nome_completo: 'Ana Beatriz Souza', email: 'ana.souza@example.com' }),
  perfilMock({ nome_completo: 'Bruno Carvalho', email: 'bruno.carvalho@example.com' }),
  perfilMock({ nome_completo: null, email: 'sem.nome@example.com' }),
];

function adminServiceMock(usuarios: Profile[], delayMs = 400): Partial<AdminService> {
  return {
    listarUsuarios: async (busca: string) => {
      await new Promise((r) => setTimeout(r, delayMs));
      const termo = busca.toLowerCase();
      const filtrados = usuarios.filter(
        (u) =>
          (u.nome_completo ?? '').toLowerCase().includes(termo) ||
          u.email.toLowerCase().includes(termo),
      );
      return {
        ok: true as const,
        data: {
          usuarios: filtrados.map((u) => ({ ...u, assinatura: null })),
          total: filtrados.length,
        },
      };
    },
  };
}

const meta: Meta<AdminUserSearchComponent> = {
  title: 'Shared/AdminUserSearch',
  component: AdminUserSearchComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      providers: [{ provide: AdminService, useValue: adminServiceMock(usuariosMock) }],
    }),
  ],
};

export default meta;
type Story = StoryObj<AdminUserSearchComponent>;

/** Estado inicial vazio: digite para buscar (mock responde "ana", "bruno", "sem"). */
export const Default: Story = {};

export const PlaceholderCustomizado: Story = {
  args: {
    placeholder: 'Buscar aluno…',
  },
};

/** Com um usuário já selecionado via input (ex.: deep-link por id). */
export const UsuarioPreSelecionado: Story = {
  args: {
    usuarioInicial: usuariosMock[0],
  },
};

/** Busca sem resultados: o dropdown não abre. */
export const SemResultados: Story = {
  decorators: [
    moduleMetadata({
      providers: [{ provide: AdminService, useValue: adminServiceMock([]) }],
    }),
  ],
};

/** Resposta lenta para visualizar o spinner de loading. */
export const BuscaLenta: Story = {
  decorators: [
    moduleMetadata({
      providers: [{ provide: AdminService, useValue: adminServiceMock(usuariosMock, 3000) }],
    }),
  ],
};
