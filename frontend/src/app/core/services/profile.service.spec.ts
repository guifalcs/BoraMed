import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { ProfileService } from './profile.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '../models/auth.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Builds a fake Supabase User with sensible defaults. */
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

/** Builds a fake Profile. */
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
    ...overrides,
  };
}

/**
 * Creates a chainable query-builder stub that resolves `single()` with the
 * given result.  Each intermediate method (select, update, eq, insert)
 * returns the same builder so fluent chains work.
 */
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const k of ['select', 'update', 'eq', 'insert', 'remove']) {
    builder[k] = vi.fn().mockReturnValue(builder);
  }
  builder['single'] = vi.fn().mockResolvedValue(result);
  return builder;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProfileService', () => {
  let service: ProfileService;

  // Mutable user signal driven by each test
  const userSignal = signal<User | null>(null);

  // Supabase mock surfaces: .from(), .storage, and .auth
  const mockFrom = vi.fn();
  const mockStorageFrom = vi.fn();
  const mockSignInWithPassword = vi.fn();
  const mockUpdateUser = vi.fn();

  const mockSupabaseClient = {
    from: mockFrom,
    storage: { from: mockStorageFrom },
    auth: {
      signInWithPassword: mockSignInWithPassword,
      updateUser: mockUpdateUser,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userSignal.set(null);

    TestBed.configureTestingModule({
      providers: [
        ProfileService,
        {
          provide: AuthService,
          useValue: { user: userSignal.asReadonly() },
        },
        {
          provide: SupabaseService,
          useValue: { client: mockSupabaseClient },
        },
      ],
    });

    service = TestBed.inject(ProfileService);
  });

  // ── loadProfile ────────────────────────────────────────────────────────────

  describe('loadProfile()', () => {
    it('não faz chamada ao Supabase quando user é null', async () => {
      userSignal.set(null);

      await service.loadProfile();

      expect(mockFrom).not.toHaveBeenCalled();
      expect(service.profile()).toBeNull();
    });

    it('popula _profile quando Supabase retorna dados', async () => {
      const profile = fakeProfile();
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: profile, error: null }));

      await service.loadProfile();

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(service.profile()).toEqual(profile);
    });

    it('mantém _profile null quando Supabase retorna erro', async () => {
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'DB error' } }));

      await service.loadProfile();

      expect(service.profile()).toBeNull();
    });

    it('desliga isLoading após a chamada, independente de erro', async () => {
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'fail' } }));

      await service.loadProfile();

      expect(service.isLoading()).toBe(false);
    });
  });

  // ── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile()', () => {
    const validInput = {
      nome_completo: 'Maria Silva',
      tipo_usuario: 'medico' as const,
      periodo: null,
    };

    it('retorna { ok: false } quando user é null', async () => {
      userSignal.set(null);

      const result = await service.updateProfile(validInput);

      expect(result.ok).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('atualiza _profile e retorna { ok: true } quando Supabase ok', async () => {
      const updatedProfile = fakeProfile({ nome_completo: 'Maria Silva' });
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: updatedProfile, error: null }));

      const result = await service.updateProfile(validInput);

      expect(result.ok).toBe(true);
      expect(service.profile()).toEqual(updatedProfile);
    });

    it('retorna { ok: false } quando Supabase retorna erro', async () => {
      userSignal.set(fakeUser());
      mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'constraint' } }));

      const result = await service.updateProfile(validInput);

      expect(result.ok).toBe(false);
    });

    it('envia os campos corretos para o Supabase', async () => {
      const profile = fakeProfile();
      userSignal.set(fakeUser());
      const builder = makeQueryBuilder({ data: profile, error: null });
      mockFrom.mockReturnValue(builder);

      await service.updateProfile({ nome_completo: 'João', tipo_usuario: 'residente', periodo: null });

      const updateMock = builder['update'] as ReturnType<typeof vi.fn>;
      expect(updateMock).toHaveBeenCalledWith({
        nome_completo: 'João',
        tipo_usuario: 'residente',
        periodo: null,
        faculdade_rede: null,
      });
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword()', () => {
    const validInput = {
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
      confirmPassword: 'NewPass1!',
    };

    it('retorna { ok: false } quando user é null', async () => {
      userSignal.set(null);

      const result = await service.changePassword(validInput);

      expect(result.ok).toBe(false);
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('retorna { ok: false, error: "Senha atual incorreta." } quando signInWithPassword retorna erro', async () => {
      userSignal.set(fakeUser());
      mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

      const result = await service.changePassword(validInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Senha atual incorreta.');
      }
    });

    it('retorna { ok: false } quando updateUser retorna erro após reautenticação ok', async () => {
      userSignal.set(fakeUser());
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockUpdateUser.mockResolvedValue({ error: { message: 'update failed' } });

      const result = await service.changePassword(validInput);

      expect(result.ok).toBe(false);
    });

    it('retorna { ok: true } quando ambos signInWithPassword e updateUser ok', async () => {
      userSignal.set(fakeUser());
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockUpdateUser.mockResolvedValue({ error: null });

      const result = await service.changePassword(validInput);

      expect(result.ok).toBe(true);
    });

    it('chama signInWithPassword com o email do usuário autenticado', async () => {
      userSignal.set(fakeUser({ email: 'meu@email.com' }));
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockUpdateUser.mockResolvedValue({ error: null });

      await service.changePassword(validInput);

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'meu@email.com',
        password: 'OldPass1!',
      });
    });
  });

  // ── removeAvatar ───────────────────────────────────────────────────────────

  describe('removeAvatar()', () => {
    it('retorna { ok: false } quando user é null', async () => {
      userSignal.set(null);

      const result = await service.removeAvatar();

      expect(result.ok).toBe(false);
    });

    it('retorna { ok: false } quando profile não tem avatar_url', async () => {
      // Set user but leave _profile null (default) so avatar_url is absent
      userSignal.set(fakeUser());

      const result = await service.removeAvatar();

      expect(result.ok).toBe(false);
    });

    it('quando avatar_url está presente, remove do storage e atualiza profile', async () => {
      userSignal.set(fakeUser());

      // Populate _profile with an avatar via the internal signal path (loadProfile)
      const profileWithAvatar = fakeProfile({
        avatar_url: 'https://host/storage/v1/object/public/avatars/user-123/avatar.jpg',
      });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: profileWithAvatar, error: null }));
      await service.loadProfile();
      expect(service.profile()?.avatar_url).not.toBeNull();

      // Now mock storage.remove and the DB update for removeAvatar
      const removeStorageMock = vi.fn().mockResolvedValue({ error: null });
      const updatedProfileNoAvatar = fakeProfile({ avatar_url: null });
      mockStorageFrom.mockReturnValue({
        remove: removeStorageMock,
        getPublicUrl: vi.fn(),
        upload: vi.fn(),
      });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: updatedProfileNoAvatar, error: null }));

      const result = await service.removeAvatar();

      expect(result.ok).toBe(true);
      expect(service.profile()?.avatar_url).toBeNull();
    });

    it('retorna { ok: false } quando storage.remove retorna erro', async () => {
      userSignal.set(fakeUser());

      // Populate profile with avatar
      const profileWithAvatar = fakeProfile({
        avatar_url: 'https://host/storage/v1/object/public/avatars/user-123/avatar.jpg',
      });
      mockFrom.mockReturnValue(makeQueryBuilder({ data: profileWithAvatar, error: null }));
      await service.loadProfile();

      // Storage remove fails
      mockStorageFrom.mockReturnValue({
        remove: vi.fn().mockResolvedValue({ error: { message: 'storage error' } }),
        getPublicUrl: vi.fn(),
        upload: vi.fn(),
      });

      const result = await service.removeAvatar();

      expect(result.ok).toBe(false);
    });
  });
});
