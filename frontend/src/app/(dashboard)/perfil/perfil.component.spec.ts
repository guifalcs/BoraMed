import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { PerfilComponent } from './perfil.component';
import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '../../core/models/auth.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-123',
    email: 'test@example.com',
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

function mockSubmitEvent(): SubmitEvent {
  return { preventDefault: vi.fn() } as unknown as SubmitEvent;
}

function makeFileEvent(file: File | null): Event {
  const input = { files: file ? [file] : null, value: '' } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PerfilComponent', () => {
  let fixture: ComponentFixture<PerfilComponent>;
  let component: PerfilComponent;

  // Sinais mutáveis controlados pelos testes
  const profileSignal = signal<Profile | null>(null);
  const isLoadingSignal = signal(false);
  const userSignal = signal<User | null>(null);

  const mockProfileService = {
    profile: profileSignal.asReadonly(),
    isLoading: isLoadingSignal.asReadonly(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    changePassword: vi.fn(),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    profileSignal.set(null);
    isLoadingSignal.set(false);
    userSignal.set(fakeUser());

    // Re-aplica defaults após resetAllMocks
    mockProfileService.updateProfile.mockResolvedValue({ ok: true });
    mockProfileService.uploadAvatar.mockResolvedValue({ ok: true });
    mockProfileService.removeAvatar.mockResolvedValue({ ok: true });
    mockProfileService.changePassword.mockResolvedValue({ ok: true });

    await TestBed.configureTestingModule({
      imports: [PerfilComponent],
      providers: [
        provideRouter([]),
        { provide: ProfileService, useValue: mockProfileService },
        { provide: AuthService, useValue: { user: userSignal.asReadonly() } },
        { provide: NotificationService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerfilComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Ativa fake timers depois que Angular inicializa, para capturar setTimeouts do componente
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Criação ────────────────────────────────────────────────────────────────

  it('cria o componente', () => {
    expect(component).toBeTruthy();
  });

  // ── Signals Computados ─────────────────────────────────────────────────────

  describe('email computed', () => {
    it('retorna o email do usuário autenticado', () => {
      expect((component as any).email()).toBe('test@example.com');
    });

    it('retorna string vazia quando user é null', () => {
      userSignal.set(null);
      expect((component as any).email()).toBe('');
    });
  });

  describe('avatarUrl computed', () => {
    it('retorna null quando não há perfil carregado', () => {
      expect((component as any).avatarUrl()).toBeNull();
    });

    it('retorna a URL do avatar do perfil', () => {
      profileSignal.set(fakeProfile({ avatar_url: 'https://example.com/avatar.jpg' }));
      expect((component as any).avatarUrl()).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('hasSenha computed', () => {
    it('retorna true quando o usuário tem provider email', () => {
      userSignal.set(fakeUser({ app_metadata: { providers: ['email'] } }));
      expect((component as any).hasSenha()).toBe(true);
    });

    it('retorna false quando o usuário usa provider social', () => {
      userSignal.set(fakeUser({ app_metadata: { providers: ['google'] } }));
      expect((component as any).hasSenha()).toBe(false);
    });

    it('retorna false quando user é null', () => {
      userSignal.set(null);
      expect((component as any).hasSenha()).toBe(false);
    });
  });

  describe('showPeriodo computed', () => {
    it('retorna false quando tipo_usuario é medico', () => {
      (component as any).tipoUsuario.set('medico');
      expect((component as any).showPeriodo()).toBe(false);
    });

    it('retorna true quando tipo_usuario é estudante_medicina', () => {
      (component as any).tipoUsuario.set('estudante_medicina');
      expect((component as any).showPeriodo()).toBe(true);
    });

    it('retorna false quando tipo_usuario é null', () => {
      (component as any).tipoUsuario.set(null);
      expect((component as any).showPeriodo()).toBe(false);
    });
  });

  // ── Effect de preenchimento ────────────────────────────────────────────────

  describe('effect de preenchimento do formulário', () => {
    it('popula os campos quando o perfil é carregado', () => {
      profileSignal.set(fakeProfile({ nome_completo: 'Maria Silva', tipo_usuario: 'residente' }));
      TestBed.flushEffects();

      expect((component as any).nomeCompleto()).toBe('Maria Silva');
      expect((component as any).tipoUsuario()).toBe('residente');
    });

    it('define periodo quando tipo_usuario é estudante_medicina', () => {
      profileSignal.set(fakeProfile({ tipo_usuario: 'estudante_medicina', periodo: 5 }));
      TestBed.flushEffects();

      expect((component as any).periodo()).toBe(5);
    });

    it('define periodo como null para tipos não-estudante', () => {
      profileSignal.set(fakeProfile({ tipo_usuario: 'medico', periodo: null }));
      TestBed.flushEffects();

      expect((component as any).periodo()).toBeNull();
    });
  });

  // ── handleTipoUsuarioChange ────────────────────────────────────────────────

  describe('handleTipoUsuarioChange()', () => {
    it('atualiza tipoUsuario com o valor string recebido', () => {
      (component as any).handleTipoUsuarioChange('medico');
      expect((component as any).tipoUsuario()).toBe('medico');
    });

    it('define null para valores que não são string', () => {
      (component as any).handleTipoUsuarioChange(42);
      expect((component as any).tipoUsuario()).toBeNull();
    });

    it('define null quando recebe null', () => {
      (component as any).handleTipoUsuarioChange(null);
      expect((component as any).tipoUsuario()).toBeNull();
    });

    it('limpa o periodo ao mudar para tipo não-estudante', () => {
      (component as any).tipoUsuario.set('estudante_medicina');
      (component as any).periodo.set(3);

      (component as any).handleTipoUsuarioChange('medico');

      expect((component as any).periodo()).toBeNull();
    });

    it('não altera o periodo ao mudar para estudante_medicina', () => {
      (component as any).tipoUsuario.set('medico');
      (component as any).periodo.set(null);

      (component as any).handleTipoUsuarioChange('estudante_medicina');

      expect((component as any).periodo()).toBeNull();
    });
  });

  // ── handlePeriodoChange ────────────────────────────────────────────────────

  describe('handlePeriodoChange()', () => {
    it('define o periodo com o valor numérico', () => {
      (component as any).handlePeriodoChange(6);
      expect((component as any).periodo()).toBe(6);
    });

    it('define null para valores não-numéricos', () => {
      (component as any).handlePeriodoChange('6');
      expect((component as any).periodo()).toBeNull();
    });

    it('define null quando recebe null', () => {
      (component as any).handlePeriodoChange(null);
      expect((component as any).periodo()).toBeNull();
    });
  });

  // ── handleProfileSubmit ────────────────────────────────────────────────────

  describe('handleProfileSubmit()', () => {
    it('chama event.preventDefault()', () => {
      const event = mockSubmitEvent();
      (component as any).nomeCompleto.set('João Silva');
      (component as any).tipoUsuario.set('medico');
      (component as any).handleProfileSubmit(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('define erro quando nome_completo é muito curto', () => {
      (component as any).nomeCompleto.set('J');
      (component as any).tipoUsuario.set('medico');

      (component as any).handleProfileSubmit(mockSubmitEvent());

      expect((component as any).nomeCompletoError()).toBe('Nome muito curto');
      expect((component as any).profileStatus()).toBe('error');
    });

    it('define erro quando tipo_usuario é null', () => {
      (component as any).nomeCompleto.set('João Silva');
      (component as any).tipoUsuario.set(null);

      (component as any).handleProfileSubmit(mockSubmitEvent());

      expect((component as any).tipoUsuarioError()).not.toBeNull();
      expect((component as any).profileStatus()).toBe('error');
    });

    it('não chama profileService quando há erros de validação', () => {
      (component as any).nomeCompleto.set('');
      (component as any).tipoUsuario.set(null);

      (component as any).handleProfileSubmit(mockSubmitEvent());

      expect(mockProfileService.updateProfile).not.toHaveBeenCalled();
    });

    it('limpa os erros de campo ao submeter novamente', () => {
      (component as any).nomeCompleto.set('J');
      (component as any).tipoUsuario.set('medico');
      (component as any).handleProfileSubmit(mockSubmitEvent());
      expect((component as any).nomeCompletoError()).not.toBeNull();

      (component as any).nomeCompleto.set('João Silva');
      (component as any).handleProfileSubmit(mockSubmitEvent());
      expect((component as any).nomeCompletoError()).toBeNull();
    });

    it('chama profileService.updateProfile com os dados corretos', async () => {
      (component as any).nomeCompleto.set('Maria Silva');
      (component as any).tipoUsuario.set('medico');

      (component as any).handleProfileSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith({
        nome_completo: 'Maria Silva',
        tipo_usuario: 'medico',
        periodo: null,
        faculdade_rede: null,
      });
    });

    it('inclui periodo quando tipo_usuario é estudante_medicina', async () => {
      (component as any).nomeCompleto.set('João Silva');
      (component as any).tipoUsuario.set('estudante_medicina');
      (component as any).periodo.set(4);

      (component as any).handleProfileSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith({
        nome_completo: 'João Silva',
        tipo_usuario: 'estudante_medicina',
        periodo: 4,
        faculdade_rede: null,
      });
    });

    it('envia periodo null quando tipo_usuario não é estudante_medicina', async () => {
      (component as any).nomeCompleto.set('João Silva');
      (component as any).tipoUsuario.set('residente');
      (component as any).periodo.set(4);

      (component as any).handleProfileSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ periodo: null }),
      );
    });

    it('chama toast.success quando serviço retorna ok', async () => {
      (component as any).nomeCompleto.set('Maria Silva');
      (component as any).tipoUsuario.set('medico');

      (component as any).handleProfileSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockToast.success).toHaveBeenCalledWith('Dados salvos com sucesso!');
    });

    it('redefine profileStatus para idle após 3 segundos', async () => {
      (component as any).nomeCompleto.set('Maria Silva');
      (component as any).tipoUsuario.set('medico');

      (component as any).handleProfileSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).profileStatus()).toBe('idle');
    });

    it('chama toast.error e define status error quando serviço retorna erro', async () => {
      mockProfileService.updateProfile.mockResolvedValue({ ok: false, error: 'Erro ao salvar' });
      (component as any).nomeCompleto.set('Maria Silva');
      (component as any).tipoUsuario.set('medico');

      (component as any).handleProfileSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockToast.error).toHaveBeenCalledWith('Erro ao salvar');
      expect((component as any).profileStatus()).toBe('error');
    });
  });

  // ── handlePasswordSubmit ──────────────────────────────────────────────────

  describe('handlePasswordSubmit()', () => {
    const fillValidPassword = () => {
      (component as any).currentPassword.set('SenhaAtual1!');
      (component as any).newPassword.set('NovaSenha1!');
      (component as any).confirmPassword.set('NovaSenha1!');
    };

    it('define erro quando currentPassword está vazia', () => {
      (component as any).handlePasswordSubmit(mockSubmitEvent());

      expect((component as any).currentPasswordError()).toBe('Senha atual obrigatória');
      expect((component as any).passwordStatus()).toBe('error');
    });

    it('define erro quando nova senha não atende aos requisitos de força', () => {
      (component as any).currentPassword.set('SenhaAtual1!');
      (component as any).newPassword.set('fraca');
      (component as any).confirmPassword.set('fraca');

      (component as any).handlePasswordSubmit(mockSubmitEvent());

      expect((component as any).newPasswordError()).not.toBeNull();
    });

    it('define erro quando confirmação de senha não confere', () => {
      (component as any).currentPassword.set('SenhaAtual1!');
      (component as any).newPassword.set('NovaSenha1!');
      (component as any).confirmPassword.set('Diferente1!');

      (component as any).handlePasswordSubmit(mockSubmitEvent());

      expect((component as any).confirmPasswordError()).toBe('As senhas não conferem');
    });

    it('não chama profileService quando há erros de validação', () => {
      (component as any).handlePasswordSubmit(mockSubmitEvent());

      expect(mockProfileService.changePassword).not.toHaveBeenCalled();
    });

    it('chama profileService.changePassword com dados válidos', async () => {
      fillValidPassword();

      (component as any).handlePasswordSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockProfileService.changePassword).toHaveBeenCalledWith({
        currentPassword: 'SenhaAtual1!',
        newPassword: 'NovaSenha1!',
        confirmPassword: 'NovaSenha1!',
      });
    });

    it('chama toast.success e limpa os campos quando serviço retorna ok', async () => {
      fillValidPassword();

      (component as any).handlePasswordSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect(mockToast.success).toHaveBeenCalledWith('Senha alterada com sucesso!');
      expect((component as any).currentPassword()).toBe('');
      expect((component as any).newPassword()).toBe('');
      expect((component as any).confirmPassword()).toBe('');
    });

    it('define currentPasswordError quando serviço retorna erro de senha incorreta', async () => {
      mockProfileService.changePassword.mockResolvedValue({
        ok: false,
        error: 'Senha atual incorreta.',
      });
      fillValidPassword();

      (component as any).handlePasswordSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).currentPasswordError()).toBe('Senha atual incorreta.');
      expect((component as any).passwordStatus()).toBe('error');
    });

    it('redefine passwordStatus para idle após 3 segundos', async () => {
      fillValidPassword();

      (component as any).handlePasswordSubmit(mockSubmitEvent());
      await vi.runAllTimersAsync();

      expect((component as any).passwordStatus()).toBe('idle');
    });
  });

  // ── handleAvatarUpload ─────────────────────────────────────────────────────

  describe('handleAvatarUpload()', () => {
    it('não faz nada quando não há arquivo selecionado', () => {
      (component as any).handleAvatarUpload(makeFileEvent(null));
      expect(mockProfileService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('chama toast.error para arquivos não-imagem', () => {
      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
      (component as any).handleAvatarUpload(makeFileEvent(file));
      expect(mockToast.error).toHaveBeenCalledWith('Apenas arquivos de imagem são permitidos.');
    });

    it('chama toast.error para arquivos maiores que 5MB', () => {
      const bigFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' });
      (component as any).handleAvatarUpload(makeFileEvent(bigFile));
      expect(mockToast.error).toHaveBeenCalledWith('A imagem deve ter no máximo 5 MB.');
    });

    it('não chama uploadAvatar para arquivos inválidos', () => {
      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
      (component as any).handleAvatarUpload(makeFileEvent(file));
      expect(mockProfileService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('chama profileService.uploadAvatar com a imagem válida', async () => {
      const file = new File(['img'], 'foto.jpg', { type: 'image/jpeg' });
      (component as any).handleAvatarUpload(makeFileEvent(file));
      await vi.runAllTimersAsync();
      expect(mockProfileService.uploadAvatar).toHaveBeenCalledWith(file);
    });

    it('chama toast.success quando upload retorna ok', async () => {
      const file = new File(['img'], 'foto.jpg', { type: 'image/jpeg' });
      (component as any).handleAvatarUpload(makeFileEvent(file));
      await vi.runAllTimersAsync();
      expect(mockToast.success).toHaveBeenCalledWith('Foto de perfil atualizada!');
    });

    it('chama toast.error quando upload retorna erro', async () => {
      mockProfileService.uploadAvatar.mockResolvedValue({ ok: false, error: 'Falha no envio' });
      const file = new File(['img'], 'foto.jpg', { type: 'image/jpeg' });
      (component as any).handleAvatarUpload(makeFileEvent(file));
      await vi.runAllTimersAsync();
      expect(mockToast.error).toHaveBeenCalledWith('Falha no envio');
    });

    it('define isAvatarLoading true durante o upload e false após', async () => {
      const file = new File(['img'], 'foto.jpg', { type: 'image/jpeg' });
      (component as any).handleAvatarUpload(makeFileEvent(file));
      expect((component as any).isAvatarLoading()).toBe(true);
      await vi.runAllTimersAsync();
      expect((component as any).isAvatarLoading()).toBe(false);
    });
  });

  // ── handleRemoveAvatar ─────────────────────────────────────────────────────

  describe('handleRemoveAvatar()', () => {
    it('chama profileService.removeAvatar', async () => {
      (component as any).handleRemoveAvatar();
      await vi.runAllTimersAsync();
      expect(mockProfileService.removeAvatar).toHaveBeenCalled();
    });

    it('chama toast.success quando remoção retorna ok', async () => {
      (component as any).handleRemoveAvatar();
      await vi.runAllTimersAsync();
      expect(mockToast.success).toHaveBeenCalledWith('Foto de perfil removida.');
    });

    it('chama toast.error quando remoção retorna erro', async () => {
      mockProfileService.removeAvatar.mockResolvedValue({ ok: false, error: 'Erro ao remover' });
      (component as any).handleRemoveAvatar();
      await vi.runAllTimersAsync();
      expect(mockToast.error).toHaveBeenCalledWith('Erro ao remover');
    });

    it('define isAvatarLoading true durante a remoção e false após', async () => {
      (component as any).handleRemoveAvatar();
      expect((component as any).isAvatarLoading()).toBe(true);
      await vi.runAllTimersAsync();
      expect((component as any).isAvatarLoading()).toBe(false);
    });
  });
});
