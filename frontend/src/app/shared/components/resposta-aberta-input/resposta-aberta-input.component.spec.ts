import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RespostaAbertaInputComponent,
  type EstadoRespostaAberta,
} from './resposta-aberta-input.component';

describe('RespostaAbertaInputComponent', () => {
  let fixture: ComponentFixture<RespostaAbertaInputComponent>;
  let component: RespostaAbertaInputComponent;

  async function setup(estado: EstadoRespostaAberta, textoInicial = '', desabilitado = false) {
    await TestBed.configureTestingModule({
      imports: [RespostaAbertaInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RespostaAbertaInputComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('estado', estado);
    fixture.componentRef.setInput('textoInicial', textoInicial);
    fixture.componentRef.setInput('desabilitado', desabilitado);
    fixture.detectChanges();
  }

  function textarea(): HTMLTextAreaElement | null {
    return fixture.nativeElement.querySelector('textarea');
  }

  function botaoEnviar(): HTMLButtonElement | null {
    const botoes = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    return botoes.find((b) => b.textContent?.includes('Enviar resposta')) ?? null;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza textarea editável no estado rascunho', async () => {
    await setup('rascunho', 'texto salvo');
    expect(textarea()).not.toBeNull();
    expect(textarea()!.value).toBe('texto salvo');
    expect(textarea()!.disabled).toBe(false);
  });

  it('desabilita envio com texto vazio', async () => {
    await setup('rascunho', '');
    expect(botaoEnviar()!.disabled).toBe(true);
  });

  it('emite salvarRascunho imediatamente ao digitar', async () => {
    await setup('rascunho');
    let emitido: string | null = null;
    component.salvarRascunho.subscribe((v: string) => (emitido = v));

    const ta = textarea()!;
    ta.value = 'nova resposta';
    ta.dispatchEvent(new Event('input'));

    expect(emitido).toBe('nova resposta');
  });

  it('descarta o texto digitado ao mudar de questão (chave)', async () => {
    await setup('rascunho', 'rascunho da Q1');
    fixture.componentRef.setInput('chave', 'q1');
    fixture.detectChanges();

    const ta = textarea()!;
    ta.value = 'texto novo na Q1';
    ta.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(textarea()!.value).toBe('texto novo na Q1');

    // Navega para a Q2: a nova questão traz seu próprio textoInicial e o texto
    // digitado na Q1 não pode vazar.
    fixture.componentRef.setInput('chave', 'q2');
    fixture.componentRef.setInput('textoInicial', 'rascunho da Q2');
    fixture.detectChanges();

    expect(textarea()!.value).toBe('rascunho da Q2');
  });

  it('envio exige confirmação e então emite enviar', async () => {
    await setup('rascunho', 'resposta final');
    let enviado: string | null = null;
    component.enviar.subscribe((v: string) => (enviado = v));

    botaoEnviar()!.click();
    fixture.detectChanges();
    expect(enviado).toBeNull(); // apenas abriu a confirmação
    expect(fixture.nativeElement.textContent).toContain('Enviar definitivamente');

    const confirmar = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar envio'),
    ) as HTMLButtonElement;
    confirmar.click();
    expect(enviado).toBe('resposta final');
  });

  it('cancelar confirmação não emite enviar', async () => {
    await setup('rascunho', 'resposta');
    let enviado = false;
    component.enviar.subscribe(() => (enviado = true));

    botaoEnviar()!.click();
    fixture.detectChanges();
    const cancelar = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Cancelar',
    ) as HTMLButtonElement;
    cancelar.click();
    fixture.detectChanges();

    expect(enviado).toBe(false);
    expect(botaoEnviar()).not.toBeNull();
  });

  it('estado enviando trava o textarea e mostra progresso', async () => {
    await setup('enviando', 'resposta');
    expect(textarea()!.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Enviando…');
  });

  it('estado enviada vira somente-leitura', async () => {
    await setup('enviada', 'resposta enviada');
    expect(textarea()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Resposta enviada');
    expect(fixture.nativeElement.textContent).toContain('resposta enviada');
  });
});
