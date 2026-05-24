import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Power, Trash2, Upload, ChevronLeft, ChevronRight } from 'lucide-angular';

const PAGE_SIZE = 20;
import { AdminService, AdminAviso } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-admin-avisos',
  standalone: true,
  imports: [FormsModule, UiConfirmDialogComponent, UiIconComponent],
  templateUrl: './admin-avisos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAvisosComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly avisos = signal<AdminAviso[]>([]);
  protected readonly isLoading = signal(true);

  protected readonly novoTitulo = signal('');
  protected readonly novoMensagem = signal('');
  protected readonly novoImagemUrl = signal('');
  protected readonly uploadingImagem = signal(false);
  protected readonly criando = signal(false);

  protected readonly processando = signal<string | null>(null);
  protected readonly avisoParaDeletar = signal<AdminAviso | null>(null);

  protected readonly pagina = signal(0);
  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.avisos().length / PAGE_SIZE))
  );
  protected readonly avisosAtual = computed(() => {
    const ini = this.pagina() * PAGE_SIZE;
    return this.avisos().slice(ini, ini + PAGE_SIZE);
  });

  protected readonly iconPower = Power;
  protected readonly iconTrash = Trash2;
  protected readonly iconUpload = Upload;
  protected readonly iconPrev = ChevronLeft;
  protected readonly iconNext = ChevronRight;

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  async carregar(): Promise<void> {
    this.isLoading.set(true);
    const result = await this.adminService.listarAvisos();
    if (result.ok) {
      this.avisos.set(result.data);
      this.pagina.set(0);
    } else {
      this.toast.error('Erro ao carregar avisos.');
    }
    this.isLoading.set(false);
  }

  protected irParaPagina(p: number): void {
    this.pagina.set(Math.max(0, Math.min(p, this.totalPaginas() - 1)));
  }

  async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingImagem.set(true);
    const result = await this.adminService.uploadImagemAviso(file);
    if (result.ok) {
      this.novoImagemUrl.set(result.data);
      this.toast.success('Imagem enviada.');
    } else {
      this.toast.error('Erro ao enviar imagem.');
    }
    this.uploadingImagem.set(false);
    input.value = '';
  }

  async criar(): Promise<void> {
    if (!this.novoImagemUrl().trim()) return;
    this.criando.set(true);
    const result = await this.adminService.criarAviso({
      titulo: this.novoTitulo().trim() || null,
      mensagem: this.novoMensagem().trim() || null,
      imagem_url: this.novoImagemUrl().trim(),
    });
    if (result.ok) {
      this.avisos.update(lista => [result.data, ...lista]);
      this.novoTitulo.set('');
      this.novoMensagem.set('');
      this.novoImagemUrl.set('');
      this.toast.success('Aviso criado e ativo.');
    } else {
      this.toast.error('Erro ao criar aviso.');
    }
    this.criando.set(false);
  }

  async toggleAtivo(aviso: AdminAviso): Promise<void> {
    this.processando.set(aviso.id);
    const result = await this.adminService.toggleAtivoAviso(aviso.id, !aviso.ativo);
    if (result.ok) {
      this.avisos.update(lista =>
        lista.map(a => a.id === aviso.id ? result.data : a)
      );
    } else {
      this.toast.error('Erro ao atualizar aviso.');
    }
    this.processando.set(null);
  }

  protected solicitarDelete(aviso: AdminAviso): void {
    this.avisoParaDeletar.set(aviso);
  }

  protected cancelarDelete(): void {
    this.avisoParaDeletar.set(null);
  }

  async confirmarDelete(): Promise<void> {
    const aviso = this.avisoParaDeletar();
    if (!aviso) return;
    this.avisoParaDeletar.set(null);
    const result = await this.adminService.deletarAviso(aviso.id);
    if (result.ok) {
      this.avisos.update(lista => lista.filter(a => a.id !== aviso.id));
      this.toast.success('Aviso removido.');
    } else {
      this.toast.error('Erro ao remover aviso.');
    }
  }

  protected formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
