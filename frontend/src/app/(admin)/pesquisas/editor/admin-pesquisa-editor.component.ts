import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-angular';
import { AdminService } from '../../../core/services/admin.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { SEGMENTOS_ACESSO } from '../../../core/models/subscription.types';
import type { SegmentoAcesso } from '../../../core/models/subscription.types';
import { TIPOS_PERGUNTA } from '../../../core/models/pesquisa.types';
import type { PerguntaRascunho, TipoPergunta } from '../../../core/models/pesquisa.types';

/** Tipos que exigem alternativas cadastradas. */
const TIPOS_COM_OPCOES: readonly TipoPergunta[] = ['escolha_unica', 'multipla_escolha'];

@Component({
  selector: 'app-admin-pesquisa-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, UiIconComponent],
  templateUrl: './admin-pesquisa-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPesquisaEditorComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly id = signal<string | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly salvando = signal(false);

  protected readonly titulo = signal('');
  protected readonly descricao = signal('');
  protected readonly segmento = signal<SegmentoAcesso>('todos');
  protected readonly ativa = signal(false);
  /** Valor de `<input type="datetime-local">`; vazio = sem data de corte. */
  protected readonly encerraEm = signal('');
  protected readonly perguntas = signal<PerguntaRascunho[]>([]);

  /** > 0 congela a estrutura no servidor (erro P0026). */
  protected readonly totalRespostas = signal(0);
  protected readonly travada = computed(() => this.totalRespostas() > 0);

  protected readonly segmentos = SEGMENTOS_ACESSO;
  protected readonly tipos = TIPOS_PERGUNTA;
  protected readonly iconAdd = Plus;
  protected readonly iconRemover = Trash2;
  protected readonly iconSubir = ChevronUp;
  protected readonly iconDescer = ChevronDown;
  /** Topos oferecidos para o tipo `escala` (a base é sempre 1). */
  protected readonly escalaMaximos = [3, 4, 5, 7, 10];

  async ngOnInit(): Promise<void> {
    const param = this.route.snapshot.paramMap.get('id');
    if (!param || param === 'nova') return;

    this.id.set(param);
    this.isLoading.set(true);
    const result = await this.adminService.obterPesquisa(param);
    if (result.ok) {
      const p = result.data;
      this.titulo.set(p.titulo);
      this.descricao.set(p.descricao ?? '');
      this.segmento.set(p.segmento);
      this.ativa.set(p.ativa);
      this.encerraEm.set(paraInputLocal(p.encerra_em));
      this.totalRespostas.set(p.total_respostas);
      this.perguntas.set(
        p.perguntas.map((q) => ({
          id: q.id,
          tipo: q.tipo,
          enunciado: q.enunciado,
          ajuda: q.ajuda,
          obrigatoria: q.obrigatoria,
          escala_min: q.escala_min,
          escala_max: q.escala_max,
          escala_min_label: q.escala_min_label,
          escala_max_label: q.escala_max_label,
          opcoes: q.opcoes.map((o) => ({ id: o.id, label: o.label })),
          key: q.id,
        })),
      );
    } else {
      this.toast.error('Pesquisa não encontrada.');
      void this.router.navigate(['/admin/pesquisas']);
    }
    this.isLoading.set(false);
  }

  protected temOpcoes(tipo: TipoPergunta): boolean {
    return TIPOS_COM_OPCOES.includes(tipo);
  }

  protected ehEscala(tipo: TipoPergunta): boolean {
    return tipo === 'escala';
  }

  protected onTitulo(event: Event): void {
    this.titulo.set((event.target as HTMLInputElement).value);
  }

  protected onDescricao(event: Event): void {
    this.descricao.set((event.target as HTMLTextAreaElement).value);
  }

  protected onSegmento(valor: SegmentoAcesso): void {
    this.segmento.set(valor);
  }

  protected onEncerraEm(event: Event): void {
    this.encerraEm.set((event.target as HTMLInputElement).value);
  }

  protected onAtiva(event: Event): void {
    this.ativa.set((event.target as HTMLInputElement).checked);
  }

  protected onObrigatoria(key: string, event: Event): void {
    this.atualizarPergunta(key, { obrigatoria: (event.target as HTMLInputElement).checked });
  }

  protected onTipo(key: string, tipo: TipoPergunta): void {
    this.trocarTipo(key, tipo);
  }

  // ---- Perguntas ----

  protected adicionarPergunta(): void {
    this.perguntas.update((lista) => [
      ...lista,
      {
        id: null,
        tipo: 'texto_curto',
        enunciado: '',
        ajuda: null,
        obrigatoria: false,
        escala_min: 1,
        escala_max: 5,
        escala_min_label: null,
        escala_max_label: null,
        opcoes: [],
        key: crypto.randomUUID(),
      },
    ]);
  }

  protected removerPergunta(key: string): void {
    this.perguntas.update((lista) => lista.filter((p) => p.key !== key));
  }

  protected mover(key: string, delta: number): void {
    this.perguntas.update((lista) => {
      const i = lista.findIndex((p) => p.key === key);
      const destino = i + delta;
      if (i < 0 || destino < 0 || destino >= lista.length) return lista;
      const copia = [...lista];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      return copia;
    });
  }

  protected atualizarPergunta(key: string, patch: Partial<PerguntaRascunho>): void {
    this.perguntas.update((lista) =>
      lista.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }

  protected trocarTipo(key: string, tipo: TipoPergunta): void {
    const precisaOpcoes = TIPOS_COM_OPCOES.includes(tipo);
    this.perguntas.update((lista) =>
      lista.map((p) => {
        if (p.key !== key) return p;
        return {
          ...p,
          tipo,
          // Trocar para um tipo de escolha já deixa duas linhas prontas; sair
          // dele descarta as alternativas, que não têm mais sentido.
          opcoes: precisaOpcoes
            ? p.opcoes.length > 0
              ? p.opcoes
              : [{ id: null, label: '' }, { id: null, label: '' }]
            : [],
        };
      }),
    );
  }

  protected atualizarEnunciado(key: string, event: Event): void {
    this.atualizarPergunta(key, { enunciado: (event.target as HTMLInputElement).value });
  }

  protected atualizarAjuda(key: string, event: Event): void {
    this.atualizarPergunta(key, { ajuda: (event.target as HTMLInputElement).value || null });
  }

  protected atualizarEscalaLabel(key: string, extremo: 'min' | 'max', event: Event): void {
    const valor = (event.target as HTMLInputElement).value || null;
    this.atualizarPergunta(key, extremo === 'min' ? { escala_min_label: valor } : { escala_max_label: valor });
  }

  protected atualizarEscalaMax(key: string, valor: number): void {
    this.atualizarPergunta(key, { escala_max: Number(valor) });
  }

  // ---- Alternativas ----

  protected adicionarOpcao(key: string): void {
    this.perguntas.update((lista) =>
      lista.map((p) => (p.key === key ? { ...p, opcoes: [...p.opcoes, { id: null, label: '' }] } : p)),
    );
  }

  protected removerOpcao(key: string, indice: number): void {
    this.perguntas.update((lista) =>
      lista.map((p) =>
        p.key === key ? { ...p, opcoes: p.opcoes.filter((_, i) => i !== indice) } : p,
      ),
    );
  }

  protected atualizarOpcao(key: string, indice: number, event: Event): void {
    const label = (event.target as HTMLInputElement).value;
    this.perguntas.update((lista) =>
      lista.map((p) =>
        p.key === key
          ? { ...p, opcoes: p.opcoes.map((o, i) => (i === indice ? { ...o, label } : o)) }
          : p,
      ),
    );
  }

  // ---- Salvar ----

  protected async salvar(): Promise<void> {
    const erro = this.validar();
    if (erro) {
      this.toast.error(erro);
      return;
    }

    this.salvando.set(true);
    const result = await this.adminService.salvarPesquisa({
      id: this.id(),
      titulo: this.titulo().trim(),
      descricao: this.descricao().trim() || null,
      segmento: this.segmento(),
      ativa: this.ativa(),
      encerra_em: paraIso(this.encerraEm()),
      // Estrutura congelada: mandar `perguntas` seria recusado pelo servidor.
      ...(this.travada()
        ? {}
        : {
            perguntas: this.perguntas().map(({ key: _key, ...q }) => ({
              ...q,
              enunciado: q.enunciado.trim(),
              opcoes: q.opcoes.map((o) => ({ ...o, label: o.label.trim() })),
            })),
          }),
    });
    this.salvando.set(false);

    if (!result.ok) {
      this.toast.error(result.error);
      return;
    }

    this.toast.success('Pesquisa salva.');
    if (!this.id()) {
      await this.router.navigate(['/admin/pesquisas', result.data], { replaceUrl: true });
      this.id.set(result.data);
    }
  }

  private validar(): string | null {
    if (!this.titulo().trim()) return 'Dê um título à pesquisa.';

    if (this.travada()) return null;

    const perguntas = this.perguntas();
    if (perguntas.length === 0) return 'Adicione ao menos uma pergunta.';

    for (const [i, p] of perguntas.entries()) {
      if (!p.enunciado.trim()) return `A pergunta ${i + 1} está sem enunciado.`;
      if (TIPOS_COM_OPCOES.includes(p.tipo)) {
        const labels = p.opcoes.map((o) => o.label.trim()).filter(Boolean);
        if (labels.length < 2) return `A pergunta ${i + 1} precisa de ao menos 2 alternativas.`;
        if (labels.length !== p.opcoes.length) return `A pergunta ${i + 1} tem alternativa em branco.`;
      }
    }

    if (this.ativa() && perguntas.length === 0) return 'Uma pesquisa no ar precisa de perguntas.';
    return null;
  }
}

/** ISO do banco → valor de `<input type="datetime-local">` no fuso local. */
function paraInputLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function paraIso(valor: string): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
