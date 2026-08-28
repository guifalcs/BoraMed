import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nivelPagoGuard } from './nivel-pago.guard';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';
import type { Profile } from '../models/auth.types';
import type { NivelAcesso } from '../models/subscription.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-abc',
    email: 'user@example.com',
    nome_completo: 'Fulano de Tal',
    tipo_usuario: 'medico',
    periodo: null,
    faculdade_unidade: null,
    avatar_url: null,
    competir_publico: true,
    papel: 'aluno',
    ultimo_login: null,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    banido: false,
    banido_em: null,
    banido_por: null,
    motivo_banimento: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('nivelPagoGuard', () => {
  let authMock: {
    initialize: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
  };
  let profileMock: {
    profile: ReturnType<typeof vi.fn>;
    loadProfile: ReturnType<typeof vi.fn>;
  };
  let subscriptionMock: {
    nivelAcessoServidor: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };

  function setup(
    options: {
      isAuthenticated?: boolean;
      profile?: Profile | null;
      nivel?: NivelAcesso;
    } = {},
  ) {
    const { isAuthenticated = true, profile = fakeProfile(), nivel = 'avancado' } = options;

    authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
    };
    profileMock = {
      profile: vi.fn().mockReturnValue(profile),
      loadProfile: vi.fn().mockResolvedValue(undefined),
    };
    subscriptionMock = {
      nivelAcessoServidor: vi.fn().mockResolvedValue(nivel),
    };
    routerMock = {
      createUrlTree: vi.fn().mockImplementation((cmds: string[]) => cmds.join('/')),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ProfileService, useValue: profileMock },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redireciona para /login quando não autenticado', async () => {
    setup({ isAuthenticated: false });

    const result = await TestBed.runInInjectionContext(() =>
      nivelPagoGuard({} as never, {} as never),
    );

    expect(authMock.initialize).toHaveBeenCalled();
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe('/login');
  });

  it('retorna true para papel "admin" sem consultar o nível', async () => {
    setup({ profile: fakeProfile({ papel: 'admin' }), nivel: 'gratuito' });

    const result = await TestBed.runInInjectionContext(() =>
      nivelPagoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.nivelAcessoServidor).not.toHaveBeenCalled();
  });

  it('retorna true para papel "super_admin" sem consultar o nível', async () => {
    setup({ profile: fakeProfile({ papel: 'super_admin' }), nivel: 'gratuito' });

    const result = await TestBed.runInInjectionContext(() =>
      nivelPagoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.nivelAcessoServidor).not.toHaveBeenCalled();
  });

  it('chama loadProfile quando profile ainda não está carregado', async () => {
    setup({ profile: null });

    await TestBed.runInInjectionContext(() => nivelPagoGuard({} as never, {} as never));

    expect(profileMock.loadProfile).toHaveBeenCalled();
  });

  it.each<NivelAcesso>(['essencial', 'avancado'])('libera o nível pago "%s"', async (nivel) => {
    setup({ nivel });

    const result = await TestBed.runInInjectionContext(() =>
      nivelPagoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
  });

  it('redireciona para /planos quando o nível é gratuito', async () => {
    setup({ nivel: 'gratuito' });

    const result = await TestBed.runInInjectionContext(() =>
      nivelPagoGuard({} as never, { url: '/imprimir/simulado/abc' } as never),
    );

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/planos'], {
      queryParams: { origem: 'impressao' },
    });
    expect(result).toBe('/planos');
  });
});
