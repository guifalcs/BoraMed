import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { QuestaoRecursoComponent } from './questao-recurso.component';

describe('QuestaoRecursoComponent', () => {
  let fixture: ComponentFixture<QuestaoRecursoComponent>;
  let component: QuestaoRecursoComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestaoRecursoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QuestaoRecursoComponent);
    component = fixture.componentInstance;
  });

  function set(inputs: {
    recursoTexto?: string | null;
    anuladaAdmin?: boolean;
    anuladaUsuario?: boolean;
    podeAnular?: boolean;
  }): void {
    fixture.componentRef.setInput('recursoTexto', inputs.recursoTexto ?? null);
    fixture.componentRef.setInput('anuladaAdmin', inputs.anuladaAdmin ?? false);
    fixture.componentRef.setInput('anuladaUsuario', inputs.anuladaUsuario ?? false);
    fixture.componentRef.setInput('podeAnular', inputs.podeAnular ?? false);
    fixture.detectChanges();
  }

  it('nada renderiza sem recurso, anulação nem opção de anular', () => {
    set({});
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('mostra o botão de anular quando pode anular e ainda não anulou', () => {
    set({ podeAnular: true });
    expect(fixture.nativeElement.textContent).toContain('Anular questão');
  });

  it('não oferece anular quando há recurso cadastrado', () => {
    set({ recursoTexto: 'A banca revisou o gabarito.', podeAnular: false });
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Recurso disponível');
    expect(html).not.toContain('Anular questão');
  });

  it('exibe faixa de anulação pela instituição', () => {
    set({ anuladaAdmin: true, recursoTexto: 'Anulada por ambiguidade.' });
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Questão anulada');
    expect(html).toContain('não conta nas suas métricas');
  });

  it('exibe faixa de anulação pelo aluno com opção de desfazer', () => {
    set({ anuladaUsuario: true, podeAnular: true });
    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Você anulou esta questão');
    expect(html).toContain('Desfazer');
  });

  it('emite toggleAnular(true) ao clicar em anular', () => {
    set({ podeAnular: true });
    let emitido: boolean | null = null;
    component.toggleAnular.subscribe((v) => (emitido = v));
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    botao.click();
    expect(emitido).toBe(true);
  });
});
