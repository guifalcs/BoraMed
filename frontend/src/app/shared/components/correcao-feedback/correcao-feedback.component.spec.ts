import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { CorrecaoFeedbackComponent } from './correcao-feedback.component';
import type { RespostaCorrecao, StatusCorrecao } from '../../../core/models/correcao';

function correcaoMock(overrides: Partial<RespostaCorrecao> = {}): RespostaCorrecao {
  return {
    id: 'rc-1',
    tentativa_resposta_id: 'tr-1',
    status: 'corrigida',
    pontos: 85,
    feedback: 'Boa resposta.',
    pontos_atendidos: ['Cita febre'],
    pontos_faltantes: ['Cita icterícia'],
    erros: [],
    provider: 'fake',
    modelo: 'fake-v1',
    num_tentativas: 1,
    criado_em: '2026-07-07T12:00:00Z',
    atualizado_em: '2026-07-07T12:00:10Z',
    ...overrides,
  };
}

describe('CorrecaoFeedbackComponent', () => {
  let fixture: ComponentFixture<CorrecaoFeedbackComponent>;
  let component: CorrecaoFeedbackComponent;

  async function setup(overrides: Partial<RespostaCorrecao> = {}) {
    await TestBed.configureTestingModule({
      imports: [CorrecaoFeedbackComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CorrecaoFeedbackComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('correcao', correcaoMock(overrides));
    fixture.detectChanges();
  }

  it('corrigida: exibe nota, feedback, checklist e identidade da IA', async () => {
    await setup();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('85/100');
    expect(texto).toContain('Boa resposta.');
    expect(texto).toContain('Cita febre');
    expect(texto).toContain('Cita icterícia');
    expect(texto).toContain('Corrigido por Aurora');
  });

  it('corrigida com erros: exibe pontos de atenção', async () => {
    await setup({ erros: ['Confundiu com a pêntade de Reynolds.'] });
    expect(fixture.nativeElement.textContent).toContain('Pontos de atenção');
    expect(fixture.nativeElement.textContent).toContain('pêntade de Reynolds');
  });

  it('corrigindo: exibe progresso com a identidade da IA', async () => {
    await setup({ status: 'corrigindo', pontos: null, feedback: null });
    expect(fixture.nativeElement.textContent).toContain('Aurora está corrigindo sua resposta');
  });

  it('erro: botão tentar de novo emite tentarNovamente', async () => {
    await setup({ status: 'erro' as StatusCorrecao, pontos: null });
    let emitido = false;
    component.tentarNovamente.subscribe(() => (emitido = true));

    const botao = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    botao.click();
    expect(emitido).toBe(true);
  });

  it('sem_ia: explica que não contou na nota', async () => {
    await setup({ status: 'sem_ia' as StatusCorrecao, pontos: null });
    expect(fixture.nativeElement.textContent).toContain('não contou na sua nota');
  });
});
