import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LogOut } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { SuporteWidgetComponent } from '../../shared/components/suporte-widget/suporte-widget.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-conta-suspensa',
  standalone: true,
  imports: [DatePipe, SuporteWidgetComponent, UiIconComponent],
  templateUrl: './conta-suspensa.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContaSuspensaComponent {
  private readonly auth = inject(AuthService);
  protected readonly profile = inject(ProfileService).profile;
  protected readonly logOutIcon = LogOut;

  protected async sair(): Promise<void> {
    await this.auth.signOut();
  }
}
