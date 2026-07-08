import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

export type EstadoRespostaAberta = 'rascunho' | 'enviando' | 'enviada';

const MAX_CHARS = 3000;

/**
 * Campo de resposta discursiva: textarea com contador, autosave de rascunho e
 * envio definitivo com confirmação. Após `enviada`, vira somente-leitura — a
 * correção/feedback é responsabilidade de quem monta a tela.
 *
 * O rascunho é emitido imediatamente a cada tecla; o debounce da persistência
 * fica com quem consome (o pai sabe a qual questão o texto pertence). Assim,
 * navegar entre questões nunca perde nem troca o dono de um rascunho pendente.
 */
@Component({
  selector: 'app-resposta-aberta-input',
  standalone: true,
  templateUrl: './resposta-aberta-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RespostaAbertaInputComponent {
  /** Texto inicial (rascunho restaurado do servidor). */
  textoInicial = input<string>('');
  estado = input.required<EstadoRespostaAberta>();
  /** Desabilita interação (ex.: tentativa pausada). */
  desabilitado = input<boolean>(false);
  /**
   * Identificador da questão. O componente é reutilizado entre questões (só os
   * inputs mudam na mesma instância); ao mudar a chave, o texto digitado da
   * questão anterior é descartado para não vazar nem ser salvo na questão errada.
   */
  chave = input<string>('');

  /** Rascunho a persistir (emitido a cada alteração do texto). */
  salvarRascunho = output<string>();
  /** Envio definitivo confirmado pelo usuário. */
  enviar = output<string>();

  protected readonly maxChars = MAX_CHARS;
  protected readonly texto = signal<string | null>(null);
  protected readonly confirmando = signal(false);

  /** Texto efetivo: o digitado nesta sessão ou o rascunho vindo do servidor. */
  protected readonly textoAtual = computed(() => this.texto() ?? this.textoInicial());

  protected readonly chars = computed(() => this.textoAtual().length);

  protected readonly podeEnviar = computed(
    () =>
      this.estado() === 'rascunho' &&
      !this.desabilitado() &&
      this.textoAtual().trim().length > 0,
  );

  constructor() {
    // Reset ao trocar de questão: descarta o texto local e fecha a confirmação.
    effect(
      () => {
        this.chave();
        this.texto.set(null);
        this.confirmando.set(false);
      },
      { allowSignalWrites: true },
    );
  }

  protected onInput(valor: string): void {
    const v = valor.slice(0, MAX_CHARS);
    this.texto.set(v);
    this.salvarRascunho.emit(v);
  }

  protected pedirConfirmacao(): void {
    if (!this.podeEnviar()) return;
    this.confirmando.set(true);
  }

  protected cancelarEnvio(): void {
    this.confirmando.set(false);
  }

  protected confirmarEnvio(): void {
    this.confirmando.set(false);
    this.enviar.emit(this.textoAtual());
  }
}
