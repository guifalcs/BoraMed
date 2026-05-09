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
});
