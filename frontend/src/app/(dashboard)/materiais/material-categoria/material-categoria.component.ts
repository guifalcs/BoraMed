import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FileText, ArrowLeft, Search } from 'lucide-angular';
import { MaterialService } from '../../../core/services/material.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PdfViewerComponent } from '../../../shared/components/pdf-viewer/pdf-viewer.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import type { MaterialArquivo, MaterialCategoria } from '../../../core/models/material';

@Component({
  selector: 'app-material-categoria',
  standalone: true,
  imports: [PdfViewerComponent, UiIconComponent, PageHeaderComponent],
  templateUrl: './material-categoria.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialCategoriaComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly materialService = inject(MaterialService);
  private readonly toast = inject(NotificationService);

  protected readonly fileIcon = FileText;
  protected readonly backIcon = ArrowLeft;
  protected readonly searchIcon = Search;

  protected readonly categoria = signal<MaterialCategoria | null>(null);
  protected readonly arquivos = signal<MaterialArquivo[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly termoBusca = signal('');

  protected readonly arquivosFiltrados = computed<MaterialArquivo[]>(() => {
    const termo = this.termoBusca().trim().toLowerCase();
    if (!termo) return this.arquivos();
    return this.arquivos().filter((a) => a.titulo.toLowerCase().includes(termo));
  });

  protected readonly arquivoSelecionado = signal<MaterialArquivo | null>(null);
  protected readonly signedUrl = signal<string | null>(null);
  protected readonly loadingUrl = signal(false);

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Início', route: '/dashboard' },
    { label: 'Materiais de Estudo', route: '/dashboard/materiais' },
    { label: this.categoria()?.titulo ?? '…' },
  ]);

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('categoriaSlug') ?? '';

    const catResult = await this.materialService.buscarCategoriaPorSlug(slug);
    if (!catResult.ok) {
      this.erro.set(catResult.error);
      this.isLoading.set(false);
      return;
    }
    this.categoria.set(catResult.data);

    const arquivosResult = await this.materialService.listarArquivos(catResult.data.id);
    if (arquivosResult.ok) {
      this.arquivos.set(arquivosResult.data);
    } else {
      this.toast.error(arquivosResult.error);
    }

    this.isLoading.set(false);
  }

  protected async abrirArquivo(arquivo: MaterialArquivo): Promise<void> {
    if (this.arquivoSelecionado()?.id === arquivo.id) return;
    this.arquivoSelecionado.set(arquivo);
    this.signedUrl.set(null);
    this.loadingUrl.set(true);

    const result = await this.materialService.getSignedUrl(arquivo.storage_path);
    this.loadingUrl.set(false);

    if (result.ok) {
      this.signedUrl.set(result.data);
    } else {
      this.toast.error(result.error);
    }
  }

  protected fecharViewer(): void {
    this.arquivoSelecionado.set(null);
    this.signedUrl.set(null);
  }

  protected voltar(): void {
    void this.router.navigate(['/dashboard/materiais']);
  }

  protected atualizarBusca(valor: string): void {
    this.termoBusca.set(valor);
  }

  protected formatarTamanho(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
