import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PrefetchService } from '../../core/services/prefetch.service';
import { ProfileService } from '../../core/services/profile.service';
import { SubscriptionService } from '../../core/services/subscription.service';

const mockAuth = {
  login: vi.fn(),
  signInWithGoogle: vi.fn(),
  resendConfirmation: vi.fn(),
};

const mockToast = { success: vi.fn(), error: vi.fn() };
const mockPrefetch = { prefetchDashboardRoutes: vi.fn() };
const mockProfile = { loadProfile: vi.fn() };
const mockSubscription = { temAssinaturaAtivaServidor: vi.fn() };

const mockRouter = { navigate: vi.fn() };

function mockSubmitEvent(): SubmitEvent {
  return { preventDefault: vi.fn() } as unknown as SubmitEvent;
}

describe('LoginComponent', () => {
  let component: LoginComponent;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockAuth.login.mockResolvedValue({ ok: true });
    mockAuth.signInWithGoogle.mockResolvedValue({ ok: true });
    mockAuth.resendConfirmation.mockResolvedValue({ ok: true });
    mockProfile.loadProfile.mockResolvedValue(undefined);
    mockSubscription.temAssinaturaAtivaServidor.mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([{ path: 'dashboard', component: LoginComponent }]),
        { provide: AuthService, useValue: mockAuth },
        { provide: NotificationService, useValue: mockToast },
        { provide: PrefetchService, useValue: mockPrefetch },
        { provide: ProfileService, useValue: mockProfile },
        { provide: SubscriptionService, useValue: mockSubscription },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('estado inicial', () => {
    it('inicia com estado idle e sem erros', () => {
      expect((component as any).state()).toBe('idle');
      expect((component as any).errorCode()).toBeNull();
    });

    it('emailError é null em estado idle', () => {
      expect((component as any).emailError()).toBeNull();
    });

    it('passwordError é null em estado idle', () => {
      expect((component as any).passwordError()).toBeNull();
    });
  });

  describe('validação de schema', () => {
    it('define estado error com INVALID_CREDENTIALS quando e-mail inválido', async () => {
      (component as any).email.set('nao-email');
      (component as any).password.set('abc');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('error');
      expect((component as any).errorCode()).toBe('INVALID_CREDENTIALS');
      expect(mockAuth.login).not.toHaveBeenCalled();
    });

    it('define estado error quando senha vazia', async () => {
      (component as any).email.set('user@example.com');
      (component as any).password.set('');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('error');
      expect(mockAuth.login).not.toHaveBeenCalled();
    });
  });

  describe('login com sucesso', () => {
    it('chama auth.login e navega para /dashboard', async () => {
      mockAuth.login.mockResolvedValue({ ok: true });
      (component as any).email.set('user@example.com');
      (component as any).password.set('Senha1!');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'Senha1!' });
      expect(mockToast.success).toHaveBeenCalledWith('Bem-vindo de volta!');
    });
  });

  describe('login com erro', () => {
    it('exibe erro de credenciais inválidas', async () => {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('errada');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('error');
      expect((component as any).errorCode()).toBe('INVALID_CREDENTIALS');
      expect((component as any).passwordError()).toBe('E-mail ou senha incorretos.');
    });

    it('exibe erro EMAIL_NOT_CONFIRMED no campo de e-mail', async () => {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'EMAIL_NOT_CONFIRMED' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('abc123');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).emailError()).toBe('Confirme seu e-mail antes de entrar.');
    });

    it('exibe erro RATE_LIMITED', async () => {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('abc123');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).passwordError()).toBe('Muitas tentativas. Aguarde alguns minutos.');
    });

    it('exibe erro NETWORK_ERROR', async () => {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'NETWORK_ERROR' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('abc123');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).passwordError()).toBe('Erro de conexão. Tente novamente.');
    });

    it('exibe mensagem genérica para UNKNOWN', async () => {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('abc123');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).passwordError()).toBe('Erro inesperado. Tente novamente.');
    });
  });

  describe('reenvio de confirmação', () => {
    async function triggerNotConfirmed() {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'EMAIL_NOT_CONFIRMED' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('abc123');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();
    }

    it('showResend é true apenas quando erro é EMAIL_NOT_CONFIRMED', async () => {
      expect((component as any).showResend()).toBe(false);
      await triggerNotConfirmed();
      expect((component as any).showResend()).toBe(true);
    });

    it('showResend é false para outros erros', async () => {
      mockAuth.login.mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS' });
      (component as any).email.set('user@example.com');
      (component as any).password.set('errada');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).showResend()).toBe(false);
    });

    it('reenvia confirmação para o e-mail informado', async () => {
      await triggerNotConfirmed();
      await (component as any).handleResend();

      expect(mockAuth.resendConfirmation).toHaveBeenCalledWith('user@example.com');
      expect((component as any).resendState()).toBe('sent');
      expect(mockToast.success).toHaveBeenCalledWith('E-mail de confirmação reenviado.');
    });

    it('inicia cooldown de 60s e zera ao fim', async () => {
      await triggerNotConfirmed();
      await (component as any).handleResend();
      expect((component as any).resendCooldown()).toBe(60);

      await vi.advanceTimersByTimeAsync(60_000);
      expect((component as any).resendCooldown()).toBe(0);
    });

    it('não reenvia durante o cooldown', async () => {
      await triggerNotConfirmed();
      await (component as any).handleResend();
      expect(mockAuth.resendConfirmation).toHaveBeenCalledTimes(1);

      await (component as any).handleResend();
      expect(mockAuth.resendConfirmation).toHaveBeenCalledTimes(1);
    });

    it('trata RATE_LIMITED com toast e cooldown', async () => {
      mockAuth.resendConfirmation.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' });
      await triggerNotConfirmed();
      await (component as any).handleResend();

      expect((component as any).resendState()).toBe('error');
      expect(mockToast.error).toHaveBeenCalledWith('Muitas tentativas. Aguarde alguns minutos.');
      expect((component as any).resendCooldown()).toBe(60);
    });

    it('trata erro genérico sem cooldown', async () => {
      mockAuth.resendConfirmation.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      await triggerNotConfirmed();
      await (component as any).handleResend();

      expect((component as any).resendState()).toBe('error');
      expect(mockToast.error).toHaveBeenCalledWith('Não foi possível reenviar. Tente novamente.');
      expect((component as any).resendCooldown()).toBe(0);
    });
  });

  describe('handleGoogleSignIn', () => {
    it('define estado loading e chama signInWithGoogle', async () => {
      mockAuth.signInWithGoogle.mockResolvedValue({ ok: true });
      (component as any).handleGoogleSignIn();
      await vi.runAllTimersAsync();

      expect(mockAuth.signInWithGoogle).toHaveBeenCalled();
    });

    it('define estado error quando Google falha', async () => {
      mockAuth.signInWithGoogle.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      (component as any).handleGoogleSignIn();
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('error');
      expect((component as any).errorCode()).toBe('UNKNOWN');
    });
  });
});
