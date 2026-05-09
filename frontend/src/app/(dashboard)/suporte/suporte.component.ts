import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-suporte',
  standalone: true,
  imports: [],
  templateUrl: './suporte.component.html',
  styleUrl: './suporte.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuporteComponent {
  protected readonly whatsappUrl = 'https://wa.me/5531994422569';
}
