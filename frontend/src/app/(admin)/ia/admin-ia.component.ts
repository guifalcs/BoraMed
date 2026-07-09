import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Info, Sparkles } from 'lucide-angular';
import {
  AdminService,
  AdminIaAgente,
  AdminIaAgentePatch,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

/** Estado editável do formulário (só comportamento; conexão fica no código/env). */
interface FormState {
  ativo: boolean;
  temperatura: number;
  limite_diario: number;
  max_resposta_chars: number;
  persona: string;
  tom: string;
  tamanho_feedback: string;
  regras_correcao: string;
  regras_extras: string;
}

function formFrom(a: AdminIaAgente): FormState {
  return {
    ativo: a.ativo,
    temperatura: a.temperatura,
    limite_diario: a.limite_diario,
    max_resposta_chars: a.max_resposta_chars,
    persona: a.persona ?? '',
    tom: a.tom ?? '',
    tamanho_feedback: a.tamanho_feedback ?? '',
    regras_correcao: a.regras_correcao ?? '',
    regras_extras: a.regras_extras ?? '',
  };
}

@Component({
  selector: 'app-admin-ia',
  standalone: true,
  imports: [CommonModule, FormsModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl px-4 py-6">
      <header class="mb-6 flex items-start gap-3">
        <span class="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white">
          <app-ui-icon [icon]="sparkles" [size]="20" />
        </span>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Inteligência Artificial</h1>
          <p class="text-sm text-gray-500">
            Configure os agentes de IA da plataforma. Hoje: <strong>Aurora</strong>, a corretora
            de questões discursivas.
          </p>
        </div>
      </header>

      @if (isLoading()) {
        <p class="py-16 text-center text-gray-500">Carregando…</p>
      } @else if (erroCarregar()) {
        <p class="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center text-sm text-red-700">
          {{ erroCarregar() }}
        </p>
      } @else if (agentes().length === 0) {
        <p class="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500">
          Nenhum agente cadastrado.
        </p>
      } @else {
        <!-- Seletor de agentes (preparado para múltiplos) -->
        <div class="mb-6 flex flex-wrap gap-2">
          @for (ag of agentes(); track ag.id) {
            <button
              type="button"
              (click)="selecionar(ag.id)"
              class="rounded-full border px-4 py-1.5 text-sm font-medium transition"
              [class]="ag.id === selecionadoId()
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'"
            >
              {{ ag.nome }}
              @if (!ag.ativo) {
                <span class="ml-1 text-xs text-gray-400">(desligada)</span>
              }
            </button>
          }
        </div>

        @if (form(); as f) {
          <div class="space-y-6">
            <!-- Liga/desliga -->
            <section class="rounded-xl border border-gray-200 bg-white p-5">
              <label class="flex items-center justify-between gap-4">
                <span>
                  <span class="block font-semibold text-gray-900">Agente ativo</span>
                  <span class="block text-xs text-gray-500">
                    Desligado, as correções viram “sem IA” — o app segue funcionando e a nota
                    ignora a questão discursiva.
                  </span>
                </span>
                <input
                  type="checkbox"
                  [(ngModel)]="f.ativo"
                  (ngModelChange)="marcarSujo()"
                  class="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-gray-300 transition checked:bg-indigo-500 relative before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition checked:before:translate-x-5"
                />
              </label>
            </section>

            <!-- Limites e amostragem -->
            <section class="rounded-xl border border-gray-200 bg-white p-5">
              <h2 class="mb-4 text-lg font-semibold text-gray-900">Limites e amostragem</h2>
              <div class="grid gap-4 sm:grid-cols-3">
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-gray-700">Limite diário por aluno</span>
                  <input
                    type="number" min="1" max="1000" step="1"
                    [(ngModel)]="f.limite_diario"
                    (ngModelChange)="marcarSujo()"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span class="mt-1 block text-xs text-gray-500">
                    Máximo de correções por IA que <strong>cada aluno</strong> pode disparar por dia
                    (trava de custo/abuso). Ao atingir, a correção dele vira “sem IA” até o dia
                    seguinte; não afeta os demais alunos.
                  </span>
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-gray-700">Máx. de caracteres da resposta</span>
                  <input
                    type="number" min="500" max="8000" step="100"
                    [(ngModel)]="f.max_resposta_chars"
                    (ngModelChange)="marcarSujo()"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span class="mt-1 block text-xs text-gray-500">
                    Corta a resposta do aluno antes de enviar à IA (limita tamanho/custo do prompt).
                  </span>
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-gray-700">Temperatura</span>
                  <input
                    type="number" min="0" max="2" step="0.1"
                    [(ngModel)]="f.temperatura"
                    (ngModelChange)="marcarSujo()"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span class="mt-1 block text-xs text-gray-500">
                    0 = determinístico (recomendado para correção).
                  </span>
                </label>
              </div>
              <p class="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
                <app-ui-icon [icon]="info" [size]="14" class="mt-0.5 shrink-0" />
                <span>
                  O <strong>modelo e a conexão</strong> (provider, endpoint, roteamento e a chave
                  da API) são configurados no código/deploy e no painel do OpenRouter — não aparecem
                  aqui de propósito.
                </span>
              </p>
            </section>

            <!-- Instruções (prompt) -->
            <section class="rounded-xl border border-gray-200 bg-white p-5">
              <h2 class="mb-1 text-lg font-semibold text-gray-900">Instruções da correção</h2>
              <p class="mb-4 text-xs text-gray-500">
                Estes campos personalizam o tom e as regras da Aurora. As defesas de segurança
                (a resposta do aluno é tratada como dado, instruções embutidas são ignoradas e o
                formato de saída é fixo) são aplicadas automaticamente e <strong>não podem ser
                desativadas</strong> por aqui.
              </p>
              <div class="grid gap-4">
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-gray-700">Persona</span>
                  <input
                    type="text"
                    [(ngModel)]="f.persona"
                    (ngModelChange)="marcarSujo()"
                    placeholder="Você é um corretor de provas discursivas de medicina, rigoroso e justo."
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <div class="grid gap-4 sm:grid-cols-2">
                  <label class="block">
                    <span class="mb-1 block text-sm font-medium text-gray-700">Tom do feedback</span>
                    <input
                      type="text"
                      [(ngModel)]="f.tom"
                      (ngModelChange)="marcarSujo()"
                      placeholder="Pedagógico, direto e respeitoso."
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-sm font-medium text-gray-700">Tamanho do feedback</span>
                    <input
                      type="text"
                      [(ngModel)]="f.tamanho_feedback"
                      (ngModelChange)="marcarSujo()"
                      placeholder="Curto: 2 a 4 frases."
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-gray-700">Regras de correção (rubrica)</span>
                  <textarea
                    rows="10"
                    [(ngModel)]="f.regras_correcao"
                    (ngModelChange)="marcarSujo()"
                    placeholder="Como pontuar: cobertura dos pontos-chave, o que zera, exigência de formato por comando do enunciado, rigor…"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed"
                  ></textarea>
                  <span class="mt-1 block text-xs text-gray-500">
                    A rubrica principal que a IA segue para dar a nota. Em branco, usa a rubrica
                    padrão do sistema. As travas de segurança (resposta como dado, anti-injeção e
                    formato de saída) são aplicadas depois desta e não podem ser removidas aqui.
                  </span>
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-gray-700">Regras adicionais (opcional)</span>
                  <textarea
                    rows="4"
                    [(ngModel)]="f.regras_extras"
                    (ngModelChange)="marcarSujo()"
                    placeholder="Ex.: valorize o raciocínio clínico; não penalize erros de ortografia."
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  ></textarea>
                </label>
              </div>
            </section>

            <!-- Erros de validação + salvar -->
            @if (erros().length > 0) {
              <ul class="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
                @for (e of erros(); track e) {
                  <li>• {{ e }}</li>
                }
              </ul>
            }

            <div class="flex items-center justify-end gap-3">
              @if (sujo()) {
                <span class="text-xs text-gray-500">Alterações não salvas.</span>
              }
              <button
                type="button"
                (click)="salvar()"
                [disabled]="isSaving() || erros().length > 0 || !sujo()"
                class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ isSaving() ? 'Salvando…' : 'Salvar alterações' }}
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class AdminIaComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly notify = inject(NotificationService);

  protected readonly sparkles = Sparkles;
  protected readonly info = Info;

  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly erroCarregar = signal<string | null>(null);
  protected readonly agentes = signal<AdminIaAgente[]>([]);
  protected readonly selecionadoId = signal<string | null>(null);
  protected readonly form = signal<FormState | null>(null);
  protected readonly sujo = signal(false);

  protected readonly selecionado = computed(() =>
    this.agentes().find((a) => a.id === this.selecionadoId()) ?? null,
  );

  /** Validação espelhando os CHECK do banco — barra o salvamento client-side. */
  protected readonly erros = computed<string[]>(() => {
    const f = this.form();
    if (!f) return [];
    const e: string[] = [];
    const t = Number(f.temperatura);
    if (!Number.isFinite(t) || t < 0 || t > 2) e.push('Temperatura deve estar entre 0 e 2.');
    const ld = Number(f.limite_diario);
    if (!Number.isInteger(ld) || ld < 1 || ld > 1000) e.push('Limite diário deve estar entre 1 e 1000.');
    const mc = Number(f.max_resposta_chars);
    if (!Number.isInteger(mc) || mc < 500 || mc > 8000) {
      e.push('Máximo de caracteres deve estar entre 500 e 8000.');
    }
    return e;
  });

  async ngOnInit(): Promise<void> {
    const res = await this.admin.listarIaAgentes();
    this.isLoading.set(false);
    if (!res.ok) {
      this.erroCarregar.set(res.error);
      return;
    }
    this.agentes.set(res.data);
    if (res.data.length > 0) this.selecionar(res.data[0].id);
  }

  protected selecionar(id: string): void {
    this.selecionadoId.set(id);
    const ag = this.agentes().find((a) => a.id === id);
    this.form.set(ag ? formFrom(ag) : null);
    this.sujo.set(false);
  }

  /**
   * `[(ngModel)]` muta o objeto do form in-place; recriamos a referência do
   * signal para que os computed (erros) reajam à mudança sob OnPush.
   */
  protected marcarSujo(): void {
    const f = this.form();
    if (f) this.form.set({ ...f });
    this.sujo.set(true);
  }

  protected async salvar(): Promise<void> {
    const f = this.form();
    const id = this.selecionadoId();
    if (!f || !id || this.erros().length > 0) return;

    this.isSaving.set(true);
    const patch: AdminIaAgentePatch = {
      ativo: f.ativo,
      temperatura: Number(f.temperatura),
      limite_diario: Number(f.limite_diario),
      max_resposta_chars: Number(f.max_resposta_chars),
      persona: f.persona.trim() || null,
      tom: f.tom.trim() || null,
      tamanho_feedback: f.tamanho_feedback.trim() || null,
      regras_correcao: f.regras_correcao.trim() || null,
      regras_extras: f.regras_extras.trim() || null,
    };
    const res = await this.admin.salvarIaAgente(id, patch);
    this.isSaving.set(false);
    if (!res.ok) {
      this.notify.error(`Não foi possível salvar: ${res.error}`);
      return;
    }
    // Atualiza a lista em memória e o form com o que voltou do banco.
    this.agentes.update((list) => list.map((a) => (a.id === id ? res.data : a)));
    this.form.set(formFrom(res.data));
    this.sujo.set(false);
    this.notify.success('Configuração salva.');
  }
}
