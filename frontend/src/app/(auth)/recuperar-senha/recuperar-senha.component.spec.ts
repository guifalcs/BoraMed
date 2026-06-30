import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RecuperarSenhaComponent } from './recuperar-senha.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

const mockAuth = {
  recoverPassword: vi.fn(),
};

const mockToast = { success: vi.fn(), error: vi.fn() };

function mockSubmitEvent(): SubmitEvent {
  return { preventDefault: vi.fn() } as unknown as SubmitEvent;
}

describe('RecuperarSenhaComponent', () => {
  let component: RecuperarSenhaComponent;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockAuth.recoverPassword.mockResolvedValue({ ok: true });

    await TestBed.configureTestingModule({
      imports: [RecuperarSenhaComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: NotificationService, useValue: mockToast },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RecuperarSenhaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('estado inicial', () => {
    it('inicia com estado idle', () => {
      expect((component as any).state()).toBe('idle');
    });
  });

  describe('validação de e-mail', () => {
    it('não chama recoverPassword se e-mail for inválido', async () => {
      (component as any).email.set('invalido');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.recoverPassword).not.toHaveBeenCalled();
      expect((component as any).state()).toBe('idle');
    });

    it('não chama recoverPassword se e-mail estiver vazio', async () => {
      (component as any).email.set('');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.recoverPassword).not.toHaveBeenCalled();
    });
  });

  describe('envio com sucesso', () => {
    it('chama recoverPassword com e-mail válido', async () => {
      (component as any).email.set('user@example.com');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.recoverPassword).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    it('define estado success e exibe toast', async () => {
      (component as any).email.set('user@example.com');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('success');
      expect(mockToast.success).toHaveBeenCalledWith(
        'Se este e-mail existir, o link de recuperação foi enviado.',
      );
    });

    it('define estado success mesmo quando recoverPassword retorna erro (comportamento privacidade)', async () => {
      mockAuth.recoverPassword.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      (component as any).email.set('user@example.com');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('success');
      expect(mockToast.success).toHaveBeenCalled();
    });
  });

  describe('estado loading', () => {
    it('define estado loading antes da resposta do servidor', async () => {
      let resolveSignup!: (v: unknown) => void;
      mockAuth.recoverPassword.mockReturnValue(new Promise((r) => (resolveSignup = r)));

      (component as any).email.set('user@example.com');
      const promise = (component as any).handleSubmit(mockSubmitEvent());

      expect((component as any).state()).toBe('loading');

      resolveSignup({ ok: true });
      await promise;
      await vi.runAllTimersAsync();
    });
  });

  describe('handleResend', () => {
    beforeEach(async () => {
      (component as any).email.set('user@example.com');
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();
      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(60_000);
    });

    it('reenvia o link de recuperação para o e-mail informado', async () => {
      mockAuth.recoverPassword.mockResolvedValue({ ok: true });
      await (component as any).handleResend();

      expect(mockAuth.recoverPassword).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect((component as any).resendState()).toBe('sent');
      expect(mockToast.success).toHaveBeenCalledWith('Link de recuperação reenviado.');
    });

    it('inicia cooldown de 60s e zera ao fim', async () => {
      mockAuth.recoverPassword.mockResolvedValue({ ok: true });
      await (component as any).handleResend();
      expect((component as any).resendCooldown()).toBe(60);

      await vi.advanceTimersByTimeAsync(60_000);
      expect((component as any).resendCooldown()).toBe(0);
    });

    it('não reenvia durante o cooldown', async () => {
      mockAuth.recoverPassword.mockResolvedValue({ ok: true });
      await (component as any).handleResend();
      expect(mockAuth.recoverPassword).toHaveBeenCalledTimes(1);

      await (component as any).handleResend();
      expect(mockAuth.recoverPassword).toHaveBeenCalledTimes(1);
    });

    it('trata RATE_LIMITED com toast e cooldown', async () => {
      mockAuth.recoverPassword.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' });
      await (component as any).handleResend();

      expect((component as any).resendState()).toBe('error');
      expect(mockToast.error).toHaveBeenCalledWith('Muitas tentativas. Aguarde alguns minutos.');
      expect((component as any).resendCooldown()).toBe(60);
    });

    it('trata erro genérico sem cooldown', async () => {
      mockAuth.recoverPassword.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      await (component as any).handleResend();

      expect((component as any).resendState()).toBe('error');
      expect(mockToast.error).toHaveBeenCalledWith('Não foi possível reenviar. Tente novamente.');
      expect((component as any).resendCooldown()).toBe(0);
    });
  });
});
