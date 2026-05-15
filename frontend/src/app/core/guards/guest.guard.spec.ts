import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi } from 'vitest';
import { guestGuard } from './guest.guard';
import { AuthService } from '../services/auth.service';

describe('guestGuard', () => {
  function setup(isAuthenticated: boolean) {
    const authMock = { isAuthenticated: vi.fn().mockReturnValue(isAuthenticated) };
    const routerMock = { createUrlTree: vi.fn().mockReturnValue('/dashboard-tree') };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    return { authMock, routerMock };
  }

  it('deve permitir acesso quando não autenticado', () => {
    setup(false);
    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('deve redirecionar para /dashboard quando autenticado', () => {
    const { routerMock } = setup(true);
    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as never, {} as never),
    );
    expect(result).toBe('/dashboard-tree');
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });
});
