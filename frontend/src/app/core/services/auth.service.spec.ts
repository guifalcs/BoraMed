import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

function makeSupabaseMock() {
  const subscription = { unsubscribe: vi.fn() };
  let authStateCallback: ((event: string, session: unknown) => void) | null = null;

  const auth = {
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      authStateCallback = cb;
      return { data: { subscription } };
    }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({}),
  };

  return {
    client: { auth },
    triggerAuthState: (event: string, session: unknown) => authStateCallback?.(event, session),
    subscription,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let supabaseMock: ReturnType<typeof makeSupabaseMock>;
  let router: Router;

  beforeEach(async () => {
    supabaseMock = makeSupabaseMock();

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AuthService,
        { provide: SupabaseService, useValue: supabaseMock },
      ],
    }).compileComponents();

    service = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('inicialização', () => {
    it('registra onAuthStateChange no construtor', () => {
      expect(supabaseMock.client.auth.onAuthStateChange).toHaveBeenCalled();
    });

    it('inicia com user null e isAuthenticated false', () => {
      expect(service.user()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('isReady começa false', () => {
      expect(service.isReady()).toBe(false);
    });
  });

  describe('initialize()', () => {
    it('define user após getSession retornar uma sessão', async () => {
      const fakeUser = { id: 'u1', email: 'user@example.com' };
      supabaseMock.client.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });

      await service.initialize();

      expect(service.user()).toEqual(fakeUser);
      expect(service.isReady()).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('define user como null se getSession falhar', async () => {
      supabaseMock.client.auth.getSession.mockRejectedValue(new Error('network'));

      await service.initialize();

      expect(service.user()).toBeNull();
      expect(service.isReady()).toBe(true);
    });

    it('identifica sessao de recovery a partir do token inicial', async () => {
      const recoveryToken =
        'header.eyJhbXIiOlt7Im1ldGhvZCI6InJlY292ZXJ5In1dfQ.signature';
      supabaseMock.client.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: recoveryToken,
            user: { id: 'u1', email: 'user@example.com' },
          },
        },
      });

      await service.initialize();

      expect(service.isRecoverySession()).toBe(true);
    });
  });

  describe('login()', () => {
    it('retorna ok: true em caso de sucesso e marca o serviço como pronto', async () => {
      const fakeUser = { id: 'u1', email: 'u@e.com' };
      supabaseMock.client.auth.signInWithPassword.mockResolvedValue({
        data: { user: fakeUser },
        error: null,
      });
      const result = await service.login({ email: 'u@e.com', password: 'abc' });
      expect(result).toEqual({ ok: true });
      // A sessão recém-emitida já é autoritativa: os guards da navegação
      // pós-login não devem repetir a verificação de sessão.
      expect(service.user()).toEqual(fakeUser);
      expect(service.isReady()).toBe(true);
    });

    it('retorna ok: false com código INVALID_CREDENTIALS', async () => {
      supabaseMock.client.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });
      const result = await service.login({ email: 'u@e.com', password: 'errada' });
      expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    });

    it('retorna RATE_LIMITED quando mensagem contém "rate limit"', async () => {
      supabaseMock.client.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'rate limit exceeded' },
      });
      const result = await service.login({ email: 'u@e.com', password: 'abc' });
      expect(result).toEqual({ ok: false, error: 'RATE_LIMITED' });
    });

    it('retorna NETWORK_ERROR quando mensagem contém "network"', async () => {
      supabaseMock.client.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'network error occurred' },
      });
      const result = await service.login({ email: 'u@e.com', password: 'abc' });
      expect(result).toEqual({ ok: false, error: 'NETWORK_ERROR' });
    });

    it('retorna EMAIL_NOT_CONFIRMED quando mensagem contém "email not confirmed"', async () => {
      supabaseMock.client.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Email not confirmed' },
      });
      const result = await service.login({ email: 'u@e.com', password: 'abc' });
      expect(result).toEqual({ ok: false, error: 'EMAIL_NOT_CONFIRMED' });
    });
  });

  describe('signup()', () => {
    const input = { fullName: 'Test', email: 'u@e.com', password: 'Abc1!', confirmPassword: 'Abc1!' };

    it('retorna ok: true com needsConfirmation quando session é null', async () => {
      supabaseMock.client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
      const result = await service.signup(input);
      expect(result).toEqual({ ok: true, needsConfirmation: true });
    });

    it('retorna ok: true sem needsConfirmation quando session existe', async () => {
      supabaseMock.client.auth.signUp.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
      const result = await service.signup(input);
      expect(result).toEqual({ ok: true, needsConfirmation: false });
    });

    it('retorna EMAIL_IN_USE quando mensagem contém "already registered"', async () => {
      supabaseMock.client.auth.signUp.mockResolvedValue({
        data: { session: null },
        error: { message: 'User already registered' },
      });
      const result = await service.signup(input);
      expect(result).toEqual({ ok: false, error: 'EMAIL_IN_USE' });
    });
  });

  describe('recoverPassword()', () => {
    it('retorna ok: true em caso de sucesso', async () => {
      supabaseMock.client.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
      const result = await service.recoverPassword({ email: 'u@e.com' });
      expect(result).toEqual({ ok: true });
    });

    it('retorna ok: false em caso de erro', async () => {
      supabaseMock.client.auth.resetPasswordForEmail.mockResolvedValue({
        error: { message: 'something went wrong' },
      });
      const result = await service.recoverPassword({ email: 'u@e.com' });
      expect(result.ok).toBe(false);
    });
  });

  describe('resetPassword()', () => {
    it('retorna ok: true em caso de sucesso', async () => {
      supabaseMock.client.auth.updateUser.mockResolvedValue({ error: null });
      const result = await service.resetPassword({ password: 'Abc1!', confirmPassword: 'Abc1!' });
      expect(result).toEqual({ ok: true });
    });

    it('retorna ok: false em caso de erro', async () => {
      supabaseMock.client.auth.updateUser.mockResolvedValue({ error: { message: 'password too weak' } });
      const result = await service.resetPassword({ password: 'fraca', confirmPassword: 'fraca' });
      expect(result).toEqual({ ok: false, error: 'WEAK_PASSWORD' });
    });

    it('retorna SAME_PASSWORD quando a nova senha é igual à anterior', async () => {
      supabaseMock.client.auth.updateUser.mockResolvedValue({
        error: { message: 'New password should be different from the old password.' },
      });
      const result = await service.resetPassword({ password: 'Abc1!', confirmPassword: 'Abc1!' });
      expect(result).toEqual({ ok: false, error: 'SAME_PASSWORD' });
    });
  });

  describe('signOut()', () => {
    it('chama supabase.auth.signOut e navega para /login', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await service.signOut();

      expect(supabaseMock.client.auth.signOut).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    });

    it('limpa o usuario local antes de navegar', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const fakeUser = { id: 'u1', email: 'user@example.com' };
      supabaseMock.triggerAuthState('SIGNED_IN', { user: fakeUser });

      await service.signOut();

      expect(service.user()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    });

    it('usa SIGNED_OUT como fallback para navegar para /login', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      supabaseMock.triggerAuthState('SIGNED_OUT', null);

      expect(navigateSpy).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    });
  });

  describe('ngOnDestroy()', () => {
    it('chama unsubscribe da subscription de auth', () => {
      service.ngOnDestroy();
      expect(supabaseMock.subscription.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('mapError (via login)', () => {
    const errorCases: Array<[string, string]> = [
      ['Invalid credentials for user', 'INVALID_CREDENTIALS'],
      ['Email not confirmed for this account', 'EMAIL_NOT_CONFIRMED'],
      ['User already been registered before', 'EMAIL_IN_USE'],
      ['Password does not meet requirements', 'WEAK_PASSWORD'],
      ['Too many requests, rate limit hit', 'RATE_LIMITED'],
      ['fetch failed due to network issues', 'NETWORK_ERROR'],
      ['Something completely different happened', 'UNKNOWN'],
    ];

    for (const [message, expected] of errorCases) {
      it(`mapeia "${message.slice(0, 30)}..." → ${expected}`, async () => {
        supabaseMock.client.auth.signInWithPassword.mockResolvedValue({ error: { message } });
        const result = await service.login({ email: 'u@e.com', password: 'abc' });
        expect(result).toEqual({ ok: false, error: expected });
      });
    }
  });
});
