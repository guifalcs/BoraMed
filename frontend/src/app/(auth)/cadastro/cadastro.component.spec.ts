import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CadastroComponent } from './cadastro.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

const mockAuth = {
  signup: vi.fn(),
  signInWithGoogle: vi.fn(),
  resendConfirmation: vi.fn(),
};

const mockToast = { success: vi.fn(), error: vi.fn() };

function mockSubmitEvent(): SubmitEvent {
  return { preventDefault: vi.fn() } as unknown as SubmitEvent;
}

const validData = {
  fullName: 'João Silva',
  email: 'joao@example.com',
  password: 'Abc1234!',
  confirmPassword: 'Abc1234!',
  faculdadeUnidade: 'salvador_ba',
};

describe('CadastroComponent', () => {
  let component: CadastroComponent;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockAuth.signup.mockResolvedValue({ ok: true, needsConfirmation: true });
    mockAuth.signInWithGoogle.mockResolvedValue({ ok: true });
    mockAuth.resendConfirmation.mockResolvedValue({ ok: true });

    await TestBed.configureTestingModule({
      imports: [CadastroComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: NotificationService, useValue: mockToast },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CadastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fillForm(overrides: Partial<typeof validData> = {}) {
    const data = { ...validData, ...overrides };
    (component as any).fullName.set(data.fullName);
    (component as any).email.set(data.email);
    (component as any).password.set(data.password);
    (component as any).confirmPassword.set(data.confirmPassword);
    (component as any).faculdadeUnidade.set(data.faculdadeUnidade);
  }

  describe('estado inicial', () => {
    it('inicia com estado idle e sem erros', () => {
      expect((component as any).state()).toBe('idle');
      expect((component as any).fieldErrors()).toEqual({});
    });
  });

  describe('validações de schema', () => {
    it('não chama auth.signup e define erro para nome curto', async () => {
      fillForm({ fullName: 'J' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.signup).not.toHaveBeenCalled();
      expect((component as any).fieldErrors()['fullName']).toBe('Nome muito curto');
      expect((component as any).state()).toBe('error');
    });

    it('define erro para e-mail inválido', async () => {
      fillForm({ email: 'invalido' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['email']).toBe('E-mail inválido');
    });

    it('define erro para senha sem maiúscula', async () => {
      fillForm({ password: 'abc1234!', confirmPassword: 'abc1234!' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['password']).toBeTruthy();
    });

    it('define erro quando confirmação não confere', async () => {
      fillForm({ confirmPassword: 'Diferente1!' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['confirmPassword']).toBe('As senhas não conferem');
    });

    it('não chama auth.signup e define erro quando unidade Afya não é selecionada', async () => {
      fillForm({ faculdadeUnidade: null as unknown as string });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.signup).not.toHaveBeenCalled();
      expect((component as any).fieldErrors()['faculdadeUnidade']).toBe('Selecione sua unidade Afya');
    });

    it('limpa fieldErrors ao submeter novamente', async () => {
      fillForm({ fullName: 'J' });
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();
      expect((component as any).fieldErrors()['fullName']).toBeTruthy();

      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();
      expect((component as any).fieldErrors()['fullName']).toBeUndefined();
    });
  });

  describe('cadastro com sucesso e confirmação de e-mail', () => {
    it('mostra toast de confirmação e define estado success', async () => {
      mockAuth.signup.mockResolvedValue({ ok: true, needsConfirmation: true });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockAuth.signup).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('Conta criada! Verifique seu e-mail para ativar o acesso.');
      expect((component as any).state()).toBe('success');
    });
  });

  describe('erros do servidor', () => {
    it('define erro de e-mail já cadastrado', async () => {
      mockAuth.signup.mockResolvedValue({ ok: false, error: 'EMAIL_IN_USE' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['email']).toBe('E-mail já cadastrado.');
      expect((component as any).state()).toBe('error');
    });

    it('define erro de senha fraca retornada pelo servidor', async () => {
      mockAuth.signup.mockResolvedValue({ ok: false, error: 'WEAK_PASSWORD' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['password']).toBe('Senha não atende aos requisitos mínimos.');
    });

    it('define erro de rate limit', async () => {
      mockAuth.signup.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['email']).toBe('Muitas tentativas. Aguarde alguns minutos.');
    });

    it('define erro genérico para UNKNOWN', async () => {
      mockAuth.signup.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      fillForm();
      (component as any).handleSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['email']).toBe('Erro inesperado. Tente novamente.');
    });
  });

  describe('reenvio de confirmação', () => {
    // `runAllTimersAsync` drenaria o setInterval do cooldown até zerar; aqui
    // aguardamos só o handler (microtasks) para inspecionar o cooldown intacto.
    async function signupSuccess() {
      fillForm();
      await (component as any).handleSubmit(mockSubmitEvent());
      // O signup inicia um cooldown de 60s; avançar para liberar o reenvio.
      await vi.advanceTimersByTimeAsync(60_000);
    }

    it('signup com confirmação inicia cooldown de 60s', async () => {
      fillForm();
      await (component as any).handleSubmit(mockSubmitEvent());

      expect((component as any).resendCooldown()).toBe(60);
    });

    it('reenvia confirmação para o e-mail cadastrado', async () => {
      await signupSuccess();
      await (component as any).handleResend();

      expect(mockAuth.resendConfirmation).toHaveBeenCalledWith(validData.email);
      expect((component as any).resendState()).toBe('sent');
      expect(mockToast.success).toHaveBeenCalledWith('E-mail de confirmação reenviado.');
    });

    it('inicia cooldown de 60s após reenvio e zera ao fim', async () => {
      await signupSuccess();
      await (component as any).handleResend();
      expect((component as any).resendCooldown()).toBe(60);

      await vi.advanceTimersByTimeAsync(60_000);
      expect((component as any).resendCooldown()).toBe(0);
    });

    it('não reenvia enquanto cooldown está ativo', async () => {
      await signupSuccess();
      await (component as any).handleResend();
      expect(mockAuth.resendConfirmation).toHaveBeenCalledTimes(1);

      await (component as any).handleResend();
      expect(mockAuth.resendConfirmation).toHaveBeenCalledTimes(1);
    });

    it('trata RATE_LIMITED com toast e cooldown', async () => {
      mockAuth.resendConfirmation.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' });
      await signupSuccess();
      await (component as any).handleResend();

      expect((component as any).resendState()).toBe('error');
      expect(mockToast.error).toHaveBeenCalledWith('Muitas tentativas. Aguarde alguns minutos.');
      expect((component as any).resendCooldown()).toBe(60);
    });

    it('trata erro genérico sem iniciar cooldown', async () => {
      mockAuth.resendConfirmation.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      await signupSuccess();
      await (component as any).handleResend();

      expect((component as any).resendState()).toBe('error');
      expect(mockToast.error).toHaveBeenCalledWith('Não foi possível reenviar. Tente novamente.');
      expect((component as any).resendCooldown()).toBe(0);
    });
  });

  describe('handleGoogleSignIn', () => {
    it('chama signInWithGoogle', async () => {
      (component as any).handleGoogleSignIn();
      await vi.runAllTimersAsync();

      expect(mockAuth.signInWithGoogle).toHaveBeenCalled();
    });

    it('define erro de e-mail quando Google falha', async () => {
      mockAuth.signInWithGoogle.mockResolvedValue({ ok: false, error: 'UNKNOWN' });
      (component as any).handleGoogleSignIn();
      await vi.runAllTimersAsync();

      expect((component as any).fieldErrors()['email']).toBe('Erro ao entrar com Google. Tente novamente.');
      expect((component as any).state()).toBe('error');
    });
  });
});
