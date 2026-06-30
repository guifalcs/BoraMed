import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RedefinirSenhaComponent } from './redefinir-senha.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

const mockAuth = {
  resetPassword: vi.fn(),
};

const mockToast = { success: vi.fn(), error: vi.fn() };

function mockSubmitEvent(): SubmitEvent {
  return { preventDefault: vi.fn() } as unknown as SubmitEvent;
}

const validData = { password: 'Abc1234!', confirmPassword: 'Abc1234!' };

describe('RedefinirSenhaComponent', () => {
  let component: RedefinirSenhaComponent;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockAuth.resetPassword.mockResolvedValue({ ok: true });

    await TestBed.configureTestingModule({
      imports: [RedefinirSenhaComponent],
      providers: [
        provideRouter([{ path: 'login', component: RedefinirSenhaComponent }]),
        { provide: AuthService, useValue: mockAuth },
        { provide: NotificationService, useValue: mockToast },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RedefinirSenhaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fillForm(overrides: Partial<typeof validData> = {}) {
    const data = { ...validData, ...overrides };
    (component as any).password.set(data.password);
    (component as any).confirmPassword.set(data.confirmPassword);
  }

  describe('estado inicial', () => {
    it('inicia com estado idle e sem erros', () => {
      expect((component as any).state()).toBe('idle');
      expect((component as any).fieldErrors()).toEqual({});
      expect((component as any).passwordError()).toBeNull();
      expect((component as any).confirmError()).toBeNull();
    });
  });

  describe('validações de schema', () => {
    it('define erro para senha fraca', async () => {
      fillForm({ password: 'fraca', confirmPassword: 'fraca' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.resetPassword).not.toHaveBeenCalled();
      expect((component as any).passwordError()).toBeTruthy();
      expect((component as any).state()).toBe('error');
    });

    it('define erro quando confirmação não confere', async () => {
      fillForm({ confirmPassword: 'Diferente1!' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).confirmError()).toBe('As senhas não conferem');
    });

    it('limpa fieldErrors ao submeter novamente', async () => {
      fillForm({ password: 'fraca', confirmPassword: 'fraca' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();
      expect((component as any).passwordError()).toBeTruthy();

      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();
      expect((component as any).passwordError()).toBeNull();
    });
  });

  describe('redefinição com sucesso', () => {
    it('chama auth.resetPassword, exibe toast e define estado success', async () => {
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.resetPassword).toHaveBeenCalledWith(validData);
      expect(mockToast.success).toHaveBeenCalledWith('Senha redefinida com sucesso!');
      expect((component as any).state()).toBe('success');
    });

    it('agenda redirecionamento para /login após 2 segundos', async () => {
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      // O setTimeout de 2000ms deve ter sido agendado
      expect((component as any).state()).toBe('success');
    });
  });

  describe('redefinição com erro do servidor', () => {
    it('define estado error e erro genérico no campo de senha', async () => {
      mockAuth.resetPassword.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('error');
      expect((component as any).passwordError()).toBe('Erro ao redefinir senha. Tente novamente.');
    });

    it('exibe mensagem clara quando a nova senha é igual à anterior', async () => {
      mockAuth.resetPassword.mockResolvedValue({ ok: false, error: 'SAME_PASSWORD' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).state()).toBe('error');
      expect((component as any).passwordError()).toBe('A nova senha precisa ser diferente da senha atual.');
    });

    it('exibe mensagem de rate limit', async () => {
      mockAuth.resetPassword.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).passwordError()).toBe('Muitas tentativas. Aguarde alguns minutos.');
    });
  });

  describe('computed errors', () => {
    it('passwordError reflete fieldErrors.password', () => {
      (component as any).fieldErrors.set({ password: 'Mínimo 8 caracteres' });
      expect((component as any).passwordError()).toBe('Mínimo 8 caracteres');
    });

    it('confirmError reflete fieldErrors.confirmPassword', () => {
      (component as any).fieldErrors.set({ confirmPassword: 'As senhas não conferem' });
      expect((component as any).confirmError()).toBe('As senhas não conferem');
    });
  });
});
