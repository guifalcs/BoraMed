import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminUserSearchComponent, UsuarioBusca } from './admin-user-search.component';
import { AdminService } from '../../../core/services/admin.service';
import type { Profile } from '../../../core/models/auth.types';

function perfilMock(overrides: Partial<Profile>): Profile {
  return {
    id: 'u1',
    email: 'ana@example.com',
    criado_em: '2026-01-10T12:00:00Z',
    nome_completo: 'Ana Souza',
    avatar_url: null,
    tipo_usuario: 'estudante_medicina',
    periodo: 3,
    faculdade_rede: 'rede_afya',
    competir_publico: true,
    papel: 'aluno',
    atualizado_em: '2026-06-01T12:00:00Z',
    ultimo_login: null,
    banido: false,
    banido_em: null,
    banido_por: null,
    motivo_banimento: null,
    ...overrides,
  };
}

describe('AdminUserSearchComponent', () => {
  let fixture: ComponentFixture<AdminUserSearchComponent>;
  const listarUsuarios = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    listarUsuarios.mockReset();

    await TestBed.configureTestingModule({
      imports: [AdminUserSearchComponent],
      providers: [{ provide: AdminService, useValue: { listarUsuarios } }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUserSearchComponent);
    fixture.detectChanges();
  });

  function digitar(valor: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('deve buscar com debounce e abrir o dropdown com resultados', async () => {
    listarUsuarios.mockResolvedValue({
      ok: true,
      data: { usuarios: [{ ...perfilMock({}), assinatura: null }], total: 1 },
    });

    digitar('ana');
    expect(listarUsuarios).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();

    expect(listarUsuarios).toHaveBeenCalledWith('ana');
    const itens = fixture.nativeElement.querySelectorAll('.autocomplete-item');
    expect(itens.length).toBe(1);
    expect(itens[0].textContent).toContain('Ana Souza');
  });

  it('não deve buscar com texto vazio', async () => {
    digitar('   ');
    await vi.advanceTimersByTimeAsync(400);
    expect(listarUsuarios).not.toHaveBeenCalled();
  });

  it('deve emitir o usuário ao selecionar e null ao limpar', async () => {
    listarUsuarios.mockResolvedValue({
      ok: true,
      data: { usuarios: [{ ...perfilMock({}), assinatura: null }], total: 1 },
    });

    const emissoes: (UsuarioBusca | null)[] = [];
    fixture.componentInstance.usuarioSelecionado.subscribe((u) => emissoes.push(u));

    digitar('ana');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.autocomplete-item') as HTMLElement).click();
    fixture.detectChanges();

    expect(emissoes).toHaveLength(1);
    expect(emissoes[0]?.id).toBe('u1');

    (fixture.nativeElement.querySelector('.autocomplete-clear') as HTMLElement).click();
    fixture.detectChanges();

    expect(emissoes).toHaveLength(2);
    expect(emissoes[1]).toBeNull();
  });

  it('deve exibir o usuário pré-selecionado via input', () => {
    fixture.componentRef.setInput('usuarioInicial', {
      id: 'u9',
      email: 'pre@example.com',
      nome_completo: 'Pré Selecionado',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.usuario-selecionado')?.textContent).toContain(
      'Pré Selecionado',
    );
  });

  it('reset() deve limpar a seleção sem emitir evento', async () => {
    let emitiu = false;
    fixture.componentInstance.usuarioSelecionado.subscribe(() => (emitiu = true));

    fixture.componentRef.setInput('usuarioInicial', {
      id: 'u9',
      email: 'pre@example.com',
      nome_completo: 'Pré Selecionado',
    });
    fixture.detectChanges();

    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.usuario-selecionado')).toBeNull();
    expect(emitiu).toBe(false);
  });
});
