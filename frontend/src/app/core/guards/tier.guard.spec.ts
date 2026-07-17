import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tierAvancadoGuard } from './tier.guard';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';
import type { Profile } from '../models/auth.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-abc',
    email: 'user@example.com',
    nome_completo: 'Fulano de Tal',
    tipo_usuario: 'medico',
    periodo: null,
    faculdade_rede: null,
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

describe('tierAvancadoGuard', () => {
  let authMock: {
    initialize: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
  };
  let profileMock: {
    profile: ReturnType<typeof vi.fn>;
    loadProfile: ReturnType<typeof vi.fn>;
  };
  let subscriptionMock: {
    tierAtivoServidor: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };

  function setup(options: {
    isAuthenticated?: boolean;
    profile?: Profile | null;
    tier?: 'essencial' | 'avancado' | null;
  } = {}) {
    const { isAuthenticated = true, profile = fakeProfile(), tier = 'avancado' } = options;

    authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
    };
    profileMock = {
      profile: vi.fn().mockReturnValue(profile),
      loadProfile: vi.fn().mockResolvedValue(undefined),
    };
    subscriptionMock = {
      tierAtivoServidor: vi.fn().mockResolvedValue(tier),
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
      tierAvancadoGuard({} as never, {} as never),
    );

    expect(authMock.initialize).toHaveBeenCalled();
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe('/login');
  });

  it('retorna true para papel "admin" sem chamar tierAtivoServidor', async () => {
    setup({ profile: fakeProfile({ papel: 'admin' }) });

    const result = await TestBed.runInInjectionContext(() =>
      tierAvancadoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.tierAtivoServidor).not.toHaveBeenCalled();
  });

  it('retorna true para papel "super_admin" sem chamar tierAtivoServidor', async () => {
    setup({ profile: fakeProfile({ papel: 'super_admin' }) });

    const result = await TestBed.runInInjectionContext(() =>
      tierAvancadoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.tierAtivoServidor).not.toHaveBeenCalled();
  });

  it('chama loadProfile quando profile ainda não está carregado', async () => {
    setup({ profile: null });

    await TestBed.runInInjectionContext(() => tierAvancadoGuard({} as never, {} as never));

    expect(profileMock.loadProfile).toHaveBeenCalled();
  });

  it('retorna true quando tier é "avancado"', async () => {
    setup({ tier: 'avancado' });

    const result = await TestBed.runInInjectionContext(() =>
      tierAvancadoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
  });

  it('redireciona para /planos quando tier é "essencial"', async () => {
    setup({ tier: 'essencial' });

    const result = await TestBed.runInInjectionContext(() =>
      tierAvancadoGuard({} as never, {} as never),
    );

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/planos']);
    expect(result).toBe('/planos');
  });

  it('redireciona para /planos quando tier é null (sem acesso)', async () => {
    setup({ tier: null });

    const result = await TestBed.runInInjectionContext(() =>
      tierAvancadoGuard({} as never, {} as never),
    );

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/planos']);
    expect(result).toBe('/planos');
  });
});
