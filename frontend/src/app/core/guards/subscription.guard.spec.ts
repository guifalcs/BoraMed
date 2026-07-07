import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscriptionGuard } from './subscription.guard';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService, PENDING_PREAPPROVAL_KEY } from '../services/subscription.service';
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

describe('subscriptionGuard', () => {
  let authMock: {
    initialize: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
  };
  let profileMock: {
    profile: ReturnType<typeof vi.fn>;
    loadProfile: ReturnType<typeof vi.fn>;
  };
  let subscriptionMock: {
    temAssinaturaAtivaServidor: ReturnType<typeof vi.fn>;
    vincular: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };

  function setup(options: {
    isAuthenticated?: boolean;
    profile?: Profile | null;
    temAssinaturaAtiva?: boolean;
    isBrowser?: boolean;
  } = {}) {
    const {
      isAuthenticated = true,
      profile = fakeProfile(),
      temAssinaturaAtiva = true,
      isBrowser = true,
    } = options;

    authMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
    };
    profileMock = {
      profile: vi.fn().mockReturnValue(profile),
      loadProfile: vi.fn().mockResolvedValue(undefined),
    };
    subscriptionMock = {
      temAssinaturaAtivaServidor: vi.fn().mockResolvedValue(temAssinaturaAtiva),
      vincular: vi.fn().mockResolvedValue({ ok: true }),
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
        { provide: PLATFORM_ID, useValue: isBrowser ? 'browser' : 'server' },
      ],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Garante sessionStorage limpo entre testes
    sessionStorage.removeItem(PENDING_PREAPPROVAL_KEY);
  });

  // ── Autenticação ───────────────────────────────────────────────────────────

  it('redireciona para /login quando não autenticado', async () => {
    setup({ isAuthenticated: false });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(authMock.initialize).toHaveBeenCalled();
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe('/login');
  });

  // ── Admins bypassam o paywall ──────────────────────────────────────────────

  it('retorna true para papel "admin" sem chamar temAssinaturaAtivaServidor', async () => {
    setup({ profile: fakeProfile({ papel: 'admin' }) });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.temAssinaturaAtivaServidor).not.toHaveBeenCalled();
  });

  it('retorna true para papel "super_admin" sem chamar temAssinaturaAtivaServidor', async () => {
    setup({ profile: fakeProfile({ papel: 'super_admin' }) });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.temAssinaturaAtivaServidor).not.toHaveBeenCalled();
  });

  // ── Carregamento de perfil ─────────────────────────────────────────────────

  it('chama loadProfile quando profile ainda não está carregado', async () => {
    setup({ profile: null });
    // profile() retorna null na primeira chamada (não carregado) e depois o
    // perfil de aluno para que o guard não aborte por admin — mas como o mock é
    // estático, o guard verifica papel de null: undefined, portanto não é admin.
    // temAssinaturaAtiva resolverá true para que o guard retorne true.

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(profileMock.loadProfile).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('não chama loadProfile quando profile já está carregado', async () => {
    setup({ profile: fakeProfile() });

    await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(profileMock.loadProfile).not.toHaveBeenCalled();
  });

  // ── Verificação de assinatura ──────────────────────────────────────────────

  it('retorna true quando temAssinaturaAtivaServidor resolve true', async () => {
    setup({ temAssinaturaAtiva: true });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(subscriptionMock.temAssinaturaAtivaServidor).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('redireciona para /planos quando temAssinaturaAtivaServidor resolve false', async () => {
    setup({ temAssinaturaAtiva: false });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/planos']);
    expect(result).toBe('/planos');
  });

  // ── Minha assinatura fora do paywall ───────────────────────────────────────

  it('libera /dashboard/assinatura mesmo sem acesso ativo (para reativar/reassinar)', async () => {
    setup({ temAssinaturaAtiva: false });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, { url: '/dashboard/assinatura' } as never),
    );

    expect(result).toBe(true);
    expect(subscriptionMock.temAssinaturaAtivaServidor).not.toHaveBeenCalled();
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });

  it('mantém o paywall nas demais rotas do dashboard', async () => {
    setup({ temAssinaturaAtiva: false });

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, { url: '/dashboard/simulados' } as never),
    );

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/planos']);
    expect(result).toBe('/planos');
  });

  // ── Fluxo de preapproval pendente ──────────────────────────────────────────

  it('quando há PENDING_PREAPPROVAL_KEY, remove do sessionStorage e chama vincular antes de verificar acesso', async () => {
    setup({ temAssinaturaAtiva: true, isBrowser: true });
    sessionStorage.setItem(PENDING_PREAPPROVAL_KEY, 'preapp-xyz');

    const result = await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(sessionStorage.getItem(PENDING_PREAPPROVAL_KEY)).toBeNull();
    expect(subscriptionMock.vincular).toHaveBeenCalledWith('preapp-xyz');
    expect(subscriptionMock.temAssinaturaAtivaServidor).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('não chama vincular quando sessionStorage não tem PENDING_PREAPPROVAL_KEY', async () => {
    setup({ temAssinaturaAtiva: true, isBrowser: true });

    await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    expect(subscriptionMock.vincular).not.toHaveBeenCalled();
  });

  it('não acessa sessionStorage quando isBrowser é false (plataforma servidor)', async () => {
    setup({ temAssinaturaAtiva: true, isBrowser: false });
    sessionStorage.setItem(PENDING_PREAPPROVAL_KEY, 'preapp-xyz');

    await TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as never, {} as never),
    );

    // No ambiente servidor, o guard não deve chamar vincular
    expect(subscriptionMock.vincular).not.toHaveBeenCalled();
    // Limpa para não afetar outros testes
    sessionStorage.removeItem(PENDING_PREAPPROVAL_KEY);
  });

  // ── PENDING_PREAPPROVAL_KEY importado corretamente ─────────────────────────

  it('PENDING_PREAPPROVAL_KEY é exportado por subscription.guard.ts', () => {
    expect(PENDING_PREAPPROVAL_KEY).toBe('boramed_pending_preapproval');
  });
});
