import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  function setup(isAuthenticated: boolean) {
    const authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
    };
    const routerMock = { createUrlTree: vi.fn().mockReturnValue('/login-tree') };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    return { authMock, routerMock };
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
