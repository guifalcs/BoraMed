import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';

describe('authGuard', () => {
  function setup(isAuthenticated: boolean) {
    const authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
      isRecoverySession: vi.fn().mockReturnValue(false),
    };
    const profileMock = {
      profile: vi.fn().mockReturnValue(null),
      loadProfile: vi.fn().mockResolvedValue(undefined),
    };
    const subscriptionMock = {
      statusAcessoServidor: vi.fn().mockResolvedValue({
        nivel: 'gratuito',
        tentativasLimite: 3,
        tentativasRestantes: 3,
        tentativasUsadas: 0,
      }),
      vincular: vi.fn().mockResolvedValue({ ok: true }),
    };
    const routerMock = { createUrlTree: vi.fn().mockReturnValue('/login-tree') };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ProfileService, useValue: profileMock },
        { provide: SubscriptionService, useValue: subscriptionMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    return { authMock, profileMock, subscriptionMock, routerMock };
  }

  it('deve permitir acesso quando autenticado', async () => {
    const { authMock } = setup(true);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
    expect(authMock.initialize).toHaveBeenCalled();
  });

  it('deve redirecionar para /login quando não autenticado', async () => {
    const { authMock, routerMock } = setup(false);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, {} as never),
    );
    expect(result).toBe('/login-tree');
    expect(authMock.initialize).toHaveBeenCalled();
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
