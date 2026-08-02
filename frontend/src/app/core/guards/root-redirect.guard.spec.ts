import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { rootRedirectGuard } from './root-redirect.guard';

describe('rootRedirectGuard', () => {
  function setup(authenticated: boolean, recovery = false) {
    const authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(authenticated),
      isRecoverySession: vi.fn().mockReturnValue(recovery),
    };
    const routerMock = { createUrlTree: vi.fn().mockReturnValue('/redirect-tree') };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    return { authMock, routerMock };
  }

  it('mantém a landing para visitantes sem sessão', async () => {
    const { authMock, routerMock } = setup(false);

    const result = await TestBed.runInInjectionContext(() =>
      rootRedirectGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(authMock.initialize).toHaveBeenCalledOnce();
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });

  it('redireciona usuários autenticados para o dashboard', async () => {
    const { authMock, routerMock } = setup(true);

    const result = await TestBed.runInInjectionContext(() =>
      rootRedirectGuard({} as never, {} as never),
    );

    expect(result).toBe('/redirect-tree');
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(authMock.initialize).toHaveBeenCalledOnce();
  });

  it('mantém o fluxo de recuperação na tela de redefinição', async () => {
    const { routerMock } = setup(true, true);

    await TestBed.runInInjectionContext(() => rootRedirectGuard({} as never, {} as never));

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/redefinir-senha']);
  });
});
