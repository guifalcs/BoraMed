import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

export type EstadoRespostaAberta = 'rascunho' | 'enviando' | 'enviada';

const MAX_CHARS = 3000;
const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * Campo de resposta discursiva: textarea com contador, autosave de rascunho
 * (debounce) e envio definitivo com confirmação. Após `enviada`, vira
 * somente-leitura — a correção/feedback é responsabilidade de quem monta a tela.
 */
@Component({
  selector: 'app-resposta-aberta-input',
  standalone: true,
  templateUrl: './resposta-aberta-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RespostaAbertaInputComponent implements OnDestroy {
  /** Texto inicial (rascunho restaurado do servidor). */
  textoInicial = input<string>('');
  estado = input.required<EstadoRespostaAberta>();
  /** Desabilita interação (ex.: tentativa pausada). */
  desabilitado = input<boolean>(false);

  /** Rascunho a persistir (emitido com debounce enquanto digita). */
  salvarRascunho = output<string>();
  /** Envio definitivo confirmado pelo usuário. */
  enviar = output<string>();

  protected readonly maxChars = MAX_CHARS;
  protected readonly texto = signal<string | null>(null);
  protected readonly confirmando = signal(false);

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Texto efetivo: o digitado nesta sessão ou o rascunho vindo do servidor. */
  protected readonly textoAtual = computed(() => this.texto() ?? this.textoInicial());

  protected readonly chars = computed(() => this.textoAtual().length);

  protected readonly podeEnviar = computed(
    () =>
      this.estado() === 'rascunho' &&
      !this.desabilitado() &&
      this.textoAtual().trim().length > 0,
  );

  ngOnDestroy(): void {
    this.flushAutosave();
  }

  protected onInput(valor: string): void {
    this.texto.set(valor.slice(0, MAX_CHARS));
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.salvarRascunho.emit(this.textoAtual());
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  protected pedirConfirmacao(): void {
    if (!this.podeEnviar()) return;
    this.flushAutosave();
    this.confirmando.set(true);
  }

  protected cancelarEnvio(): void {
    this.confirmando.set(false);
  }

  protected confirmarEnvio(): void {
    this.confirmando.set(false);
    this.enviar.emit(this.textoAtual());
  }

  private flushAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      if (this.estado() === 'rascunho') {
        this.salvarRascunho.emit(this.textoAtual());
      }
    }
  }
}
