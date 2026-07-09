import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { X } from 'lucide-angular';
import { AdminService } from '../../../core/services/admin.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';
import type { Profile } from '../../../core/models/auth.types';

/** Subconjunto mínimo do Profile que a busca precisa exibir/emitir. */
export interface UsuarioBusca {
  id: string;
  email: string;
  nome_completo: string | null;
}

/**
 * Autocomplete de usuário (nome/email) para telas do admin.
 * Busca via AdminService.listarUsuarios com debounce e emite o usuário
 * selecionado (ou null ao limpar).
 */
@Component({
  selector: 'app-admin-user-search',
  standalone: true,
  imports: [FormsModule, UiIconComponent],
  templateUrl: './admin-user-search.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserSearchComponent {
  private readonly adminService = inject(AdminService);
  private readonly elRef = inject(ElementRef);

  placeholder = input('Pesquisar usuário por nome ou e-mail…');
  /** Pré-seleciona um usuário (ex.: deep-link por id na URL). */
  usuarioInicial = input<UsuarioBusca | null>(null);

  usuarioSelecionado = output<UsuarioBusca | null>();

  protected readonly buscaTexto = signal('');
  protected readonly resultados = signal<Profile[]>([]);
  protected readonly buscando = signal(false);
  protected readonly dropdownAberto = signal(false);
  protected readonly selecionado = signal<UsuarioBusca | null>(null);

  protected readonly iconX = X;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Reage apenas a mudanças do input (untracked no estado interno) para
    // não re-selecionar quando o próprio componente limpa a seleção.
    effect(() => {
      const inicial = this.usuarioInicial();
      if (!inicial) return;
      const atual = untracked(this.selecionado);
      if (
        atual?.id !== inicial.id ||
        atual?.email !== inicial.email ||
        atual?.nome_completo !== inicial.nome_completo
      ) {
        this.selecionado.set(inicial);
        this.buscaTexto.set(inicial.nome_completo ?? inicial.email);
        this.dropdownAberto.set(false);
        this.resultados.set([]);
      }
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.dropdownAberto.set(false);
    }
  }

  protected onBuscaInput(valor: string): void {
    this.buscaTexto.set(valor);
    if (this.selecionado()) {
      this.selecionado.set(null);
      this.usuarioSelecionado.emit(null);
    }

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    if (!valor.trim()) {
      this.resultados.set([]);
      this.dropdownAberto.set(false);
      return;
    }

    this.debounceTimer = setTimeout(() => this.buscarUsuarios(valor), 300);
  }

  private async buscarUsuarios(termo: string): Promise<void> {
    this.buscando.set(true);
    const result = await this.adminService.listarUsuarios(termo);
    if (result.ok) {
      this.resultados.set(result.data.usuarios.slice(0, 10));
      this.dropdownAberto.set(result.data.usuarios.length > 0);
    }
    this.buscando.set(false);
  }

  protected selecionar(usuario: UsuarioBusca): void {
    this.selecionado.set(usuario);
    this.buscaTexto.set(usuario.nome_completo ?? usuario.email);
    this.dropdownAberto.set(false);
    this.resultados.set([]);
    this.usuarioSelecionado.emit(usuario);
  }

  protected limpar(): void {
    this.reset();
    this.usuarioSelecionado.emit(null);
  }

  /** Limpa a seleção sem emitir evento (uso programático pelo componente pai). */
  reset(): void {
    this.selecionado.set(null);
    this.buscaTexto.set('');
    this.resultados.set([]);
    this.dropdownAberto.set(false);
  }
}
