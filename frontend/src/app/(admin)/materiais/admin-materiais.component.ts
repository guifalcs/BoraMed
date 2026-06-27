import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminMaterialCategoria, AdminMaterialArquivo } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { PdfUploadComponent } from '../../shared/components/pdf-upload/pdf-upload.component';
import { ArrowLeft, Pencil, Trash2, FolderOpen, Plus } from 'lucide-angular';

type ViewMode = 'categorias' | 'arquivos';

@Component({
  selector: 'app-admin-materiais',
  standalone: true,
  imports: [FormsModule, UiConfirmDialogComponent, UiIconComponent, PdfUploadComponent],
  templateUrl: './admin-materiais.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMateriaisComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly iconBack = ArrowLeft;
  protected readonly iconEdit = Pencil;
  protected readonly iconDelete = Trash2;
  protected readonly iconFolder = FolderOpen;
  protected readonly iconPlus = Plus;

  // ---- Navegação entre views ----
  protected readonly view = signal<ViewMode>('categorias');
  protected readonly categoriaAtiva = signal<AdminMaterialCategoria | null>(null);

  // ---- Categorias ----
  protected readonly categorias = signal<AdminMaterialCategoria[]>([]);
  protected readonly isLoadingCat = signal(true);
  protected readonly criandoCat = signal(false);
  protected readonly processandoCat = signal<string | null>(null);
  protected readonly catParaDeletar = signal<AdminMaterialCategoria | null>(null);
  protected readonly editandoCatId = signal<string | null>(null);

  protected readonly novoSlug = signal('');
  protected readonly novoTitulo = signal('');
  protected readonly novaDescricao = signal('');
  protected readonly novaOrdem = signal(0);

  protected readonly editSlug = signal('');
  protected readonly editTitulo = signal('');
  protected readonly editDescricao = signal('');
  protected readonly editOrdem = signal(0);
  protected readonly editAtivo = signal(true);

  // ---- Arquivos ----
  protected readonly arquivos = signal<AdminMaterialArquivo[]>([]);
  protected readonly isLoadingArq = signal(false);
  protected readonly criandoArq = signal(false);
  protected readonly processandoArq = signal<string | null>(null);
  protected readonly arqParaDeletar = signal<AdminMaterialArquivo | null>(null);
  protected readonly editandoArqId = signal<string | null>(null);

  protected readonly novoArqTitulo = signal('');
  protected readonly novoArqDescricao = signal('');
  protected readonly novoArqStoragePath = signal('');
  protected readonly novoArqTamanho = signal<number>(0);

  protected readonly editArqTitulo = signal('');
  protected readonly editArqDescricao = signal('');
  protected readonly editArqOrdem = signal(0);
  protected readonly editArqAtivo = signal(true);

  protected readonly prefixSlug = computed(() => this.categoriaAtiva()?.slug ?? 'materiais');

  async ngOnInit(): Promise<void> {
    await this.carregarCategorias();
  }

  async carregarCategorias(): Promise<void> {
    this.isLoadingCat.set(true);
    const result = await this.adminService.listarMateriaisCategorias();
    if (result.ok) {
      this.categorias.set(result.data);
    } else {
      this.toast.error('Erro ao carregar categorias.');
    }
    this.isLoadingCat.set(false);
  }

  async abrirArquivos(cat: AdminMaterialCategoria): Promise<void> {
    this.categoriaAtiva.set(cat);
    this.view.set('arquivos');
    this.isLoadingArq.set(true);
    const result = await this.adminService.listarMateriaisArquivos(cat.id);
    if (result.ok) {
      this.arquivos.set(result.data);
    } else {
      this.toast.error('Erro ao carregar arquivos.');
    }
    this.isLoadingArq.set(false);
  }

  voltarParaCategorias(): void {
    this.view.set('categorias');
    this.categoriaAtiva.set(null);
    this.arquivos.set([]);
    this.editandoArqId.set(null);
    this.arqParaDeletar.set(null);
  }

  // ---- CRUD Categorias ----

  async criarCategoria(): Promise<void> {
    if (!this.novoSlug().trim() || !this.novoTitulo().trim()) return;
    this.criandoCat.set(true);
    const result = await this.adminService.criarMaterialCategoria({
      slug: this.novoSlug().trim().toLowerCase(),
      titulo: this.novoTitulo().trim(),
      descricao: this.novaDescricao().trim() || null,
      ordem: this.novaOrdem(),
    });
    if (result.ok) {
      this.categorias.update((l) => [...l, result.data].sort((a, b) => a.ordem - b.ordem));
      this.novoSlug.set('');
      this.novoTitulo.set('');
      this.novaDescricao.set('');
      this.novaOrdem.set(0);
      this.toast.success('Categoria criada.');
    } else {
      this.toast.error('Erro ao criar categoria.');
    }
    this.criandoCat.set(false);
  }

  iniciarEdicaoCat(cat: AdminMaterialCategoria): void {
    this.editandoCatId.set(cat.id);
    this.editSlug.set(cat.slug);
    this.editTitulo.set(cat.titulo);
    this.editDescricao.set(cat.descricao ?? '');
    this.editOrdem.set(cat.ordem);
    this.editAtivo.set(cat.ativo);
  }

  cancelarEdicaoCat(): void {
    this.editandoCatId.set(null);
  }

  async salvarEdicaoCat(cat: AdminMaterialCategoria): Promise<void> {
    if (!this.editTitulo().trim()) return;
    this.processandoCat.set(cat.id);
    const result = await this.adminService.atualizarMaterialCategoria(cat.id, {
      slug: this.editSlug().trim().toLowerCase(),
      titulo: this.editTitulo().trim(),
      descricao: this.editDescricao().trim() || null,
      ordem: this.editOrdem(),
      ativo: this.editAtivo(),
    });
    if (result.ok) {
      this.categorias.update((l) =>
        l.map((c) => (c.id === cat.id ? result.data : c)).sort((a, b) => a.ordem - b.ordem),
      );
      this.editandoCatId.set(null);
      this.toast.success('Categoria atualizada.');
    } else {
      this.toast.error('Erro ao atualizar categoria.');
    }
    this.processandoCat.set(null);
  }

  solicitarDeleteCat(cat: AdminMaterialCategoria): void {
    this.catParaDeletar.set(cat);
  }

  cancelarDeleteCat(): void {
    this.catParaDeletar.set(null);
  }

  async confirmarDeleteCat(): Promise<void> {
    const cat = this.catParaDeletar();
    if (!cat) return;
    this.catParaDeletar.set(null);
    const result = await this.adminService.deletarMaterialCategoria(cat.id);
    if (result.ok) {
      this.categorias.update((l) => l.filter((c) => c.id !== cat.id));
      this.toast.success('Categoria deletada.');
    } else {
      this.toast.error('Erro ao deletar categoria.');
    }
  }

  // ---- CRUD Arquivos ----

  onPdfSelecionado(payload: { storagePath: string; tamanhoBytes: number } | null): void {
    if (payload) {
      this.novoArqStoragePath.set(payload.storagePath);
      this.novoArqTamanho.set(payload.tamanhoBytes);
    } else {
      this.novoArqStoragePath.set('');
      this.novoArqTamanho.set(0);
    }
  }

  async criarArquivo(): Promise<void> {
    const cat = this.categoriaAtiva();
    if (!cat || !this.novoArqTitulo().trim() || !this.novoArqStoragePath()) return;
    this.criandoArq.set(true);
    const result = await this.adminService.criarMaterialArquivo({
      categoria_id: cat.id,
      titulo: this.novoArqTitulo().trim(),
      descricao: this.novoArqDescricao().trim() || null,
      storage_path: this.novoArqStoragePath(),
      mime_type: 'application/pdf',
      tamanho_bytes: this.novoArqTamanho() || null,
    });
    if (result.ok) {
      this.arquivos.update((l) => [...l, result.data]);
      this.novoArqTitulo.set('');
      this.novoArqDescricao.set('');
      this.novoArqStoragePath.set('');
      this.novoArqTamanho.set(0);
      this.toast.success('Arquivo adicionado.');
    } else {
      this.toast.error('Erro ao adicionar arquivo.');
    }
    this.criandoArq.set(false);
  }

  iniciarEdicaoArq(arq: AdminMaterialArquivo): void {
    this.editandoArqId.set(arq.id);
    this.editArqTitulo.set(arq.titulo);
    this.editArqDescricao.set(arq.descricao ?? '');
    this.editArqOrdem.set(arq.ordem);
    this.editArqAtivo.set(arq.ativo);
  }

  cancelarEdicaoArq(): void {
    this.editandoArqId.set(null);
  }

  async salvarEdicaoArq(arq: AdminMaterialArquivo): Promise<void> {
    if (!this.editArqTitulo().trim()) return;
    this.processandoArq.set(arq.id);
    const result = await this.adminService.atualizarMaterialArquivo(arq.id, {
      titulo: this.editArqTitulo().trim(),
      descricao: this.editArqDescricao().trim() || null,
      ordem: this.editArqOrdem(),
      ativo: this.editArqAtivo(),
    });
    if (result.ok) {
      this.arquivos.update((l) => l.map((a) => (a.id === arq.id ? result.data : a)));
      this.editandoArqId.set(null);
      this.toast.success('Arquivo atualizado.');
    } else {
      this.toast.error('Erro ao atualizar arquivo.');
    }
    this.processandoArq.set(null);
  }

  solicitarDeleteArq(arq: AdminMaterialArquivo): void {
    this.arqParaDeletar.set(arq);
  }

  cancelarDeleteArq(): void {
    this.arqParaDeletar.set(null);
  }

  async confirmarDeleteArq(): Promise<void> {
    const arq = this.arqParaDeletar();
    if (!arq) return;
    this.arqParaDeletar.set(null);
    const result = await this.adminService.deletarMaterialArquivo(arq.id, arq.storage_path);
    if (result.ok) {
      this.arquivos.update((l) => l.filter((a) => a.id !== arq.id));
      this.toast.success('Arquivo deletado.');
    } else {
      this.toast.error('Erro ao deletar arquivo.');
    }
  }

  formatarTamanho(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
