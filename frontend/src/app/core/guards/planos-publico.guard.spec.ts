import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { ANCORA_PLANOS_LANDING, planosPublicoGuard } from './planos-publico.guard';

describe('planosPublicoGuard', () => {
  function setup(authenticated: boolean, plataforma: 'browser' | 'server' = 'browser') {
    const authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(authenticated),
    };
    const routerMock = { createUrlTree: vi.fn().mockReturnValue('/landing-tree') };
    const replace = vi.fn();
    const documentMock = { defaultView: { location: { replace } } };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
        { provide: DOCUMENT, useValue: documentMock },
        { provide: PLATFORM_ID, useValue: plataforma },
      ],
    });

    return { authMock, routerMock, replace };
  }

  it('deixa quem tem sessão seguir para a tela de planos do app', async () => {
    const { authMock, routerMock, replace } = setup(true);

    const result = await TestBed.runInInjectionContext(() =>
      planosPublicoGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(authMock.initialize).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });

  it('manda visitante sem sessão para a seção de planos da landing', async () => {
    const { replace } = setup(false);

    const result = await TestBed.runInInjectionContext(() =>
      planosPublicoGuard({} as never, {} as never),
    );

    // `false` porque quem navega é o browser, não o Router.
    expect(result).toBe(false);
    expect(replace).toHaveBeenCalledWith(ANCORA_PLANOS_LANDING);
  });

  it('fora do browser, devolve UrlTree da landing em vez de tocar em location', async () => {
    const { routerMock, replace } = setup(false, 'server');

    const result = await TestBed.runInInjectionContext(() =>
      planosPublicoGuard({} as never, {} as never),
    );

    expect(result).toBe('/landing-tree');
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/'], { fragment: 'planos' });
    expect(replace).not.toHaveBeenCalled();
  });
});
