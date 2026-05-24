import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent, type Breadcrumb } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-suporte',
  standalone: true,
  imports: [PageHeaderComponent],
  templateUrl: './suporte.component.html',
  styleUrl: './suporte.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuporteComponent {
  protected readonly whatsappUrl = 'https://wa.me/5531994422569';
  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Suporte' },
  ];
}
