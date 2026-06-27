import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Library } from 'lucide-angular';
import { MaterialService } from '../../../core/services/material.service';
import { NotificationService } from '../../../core/services/notification.service';
import { MaterialCardComponent } from '../../../shared/components/material-card/material-card.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import type { MaterialCategoria } from '../../../core/models/material';

@Component({
  selector: 'app-materiais-home',
  standalone: true,
  imports: [MaterialCardComponent, PageHeaderComponent, UiIconComponent],
  templateUrl: './materiais-home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MateriaisHomeComponent implements OnInit {
  private readonly materialService = inject(MaterialService);
  private readonly router = inject(Router);
  private readonly toast = inject(NotificationService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Materiais de Estudo' },
  ];

  protected readonly libraryIcon = Library;
  protected readonly categorias = this.materialService.categorias;
  protected readonly isLoading = this.materialService.isLoading;
  protected readonly erro = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const result = await this.materialService.listarCategorias();
    if (!result.ok) {
      this.erro.set(result.error);
      this.toast.error(result.error);
    }
  }

  protected async abrirCategoria(categoria: MaterialCategoria): Promise<void> {
    await this.router.navigate(['/dashboard/materiais', categoria.slug]);
  }
}
