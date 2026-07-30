import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

type Estado = 'processando' | 'sucesso' | 'invalido' | 'erro';

/**
 * Página pública de opt-out das campanhas de e-mail (link do rodapé).
 *
 * Roda sem sessão: a credencial é o `token` da query string, que a RPC
 * `descadastrar_email_marketing` resolve para o perfil. O descadastro acontece
 * no load — sem botão de confirmação — porque o clique no link do e-mail já é
 * a intenção do usuário, e um passo extra só aumenta a chance de ele desistir
 * e marcar como spam.
 */
@Component({
  selector: 'app-descadastrar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './descadastrar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DescadastrarComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = inject(SupabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly estado = signal<Estado>('processando');

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;

    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.estado.set('invalido');
      return;
    }

    const { data, error } = await this.supabase.client.rpc('descadastrar_email_marketing', {
      p_token: token,
    });

    if (error) {
      this.estado.set('erro');
      return;
    }

    // A RPC devolve false para token inexistente — nunca detalha o motivo, para
    // não servir de oráculo de contas.
    this.estado.set(data === true ? 'sucesso' : 'invalido');
  }
}
