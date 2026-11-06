import {
  calcularDimensao,
  calcularPeriodo,
  ceil1,
  fmtPts,
  lerNotaDigitada,
  linhaDimensao,
  mensagemDimensao,
  proximosPassos,
  simularFinal,
  situacaoEixo,
} from './notas-calculo.util';
import type { NotaLancamento, NotasDimensao, NotasEixo, NotasRegulamento } from '../models/notas';

const cognitiva: NotasDimensao = {
  id: 'cog',
  tipo: 'cognitiva',
  nome: 'Dimensão Cognitiva',
  pontos_total: 100,
  itens: [
    { id: 'n1', nome: 'Prova N1', pontos: 20, descricao: null, subitens: [] },
    { id: 'tpi', nome: 'TPI', pontos: 30, descricao: null, subitens: [] },
    { id: 'n2', nome: 'Prova N2', pontos: 35, descricao: null, subitens: [] },
    { id: 'n3', nome: 'Prova N3', pontos: 15, descricao: null, subitens: [] },
  ],
};

const habilidades: NotasDimensao = {
  id: 'hab',
  tipo: 'habilidades',
  nome: 'Habilidades e Atitudes',
  pontos_total: 100,
  itens: [
    {
      id: 'apg',
      nome: 'Avaliação Diária na APG',
      pontos: 35,
      descricao: null,
      subitens: [
        { id: 'apg1', nome: '1ª parcial', pontos: 20, descricao: null },
        { id: 'apg2', nome: '2ª parcial', pontos: 15, descricao: null },
      ],
    },
    { id: 'osce', nome: 'OSCE', pontos: 65, descricao: null, subitens: [] },
  ],
};

const eixo: NotasEixo = { id: 'soi', sigla: 'SOI I', nome: 'SOI', exame_especial: true, dimensoes: [cognitiva, habilidades] };
const reg = { nota_minima: 70, nota_minima_exame: 40 };

function notas(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

describe('notas-calculo.util', () => {
  describe('lerNotaDigitada', () => {
    it('aceita vírgula e ponto e apaga com vazio', () => {
      expect(lerNotaDigitada('17,5', 20)).toEqual({ ok: true, valor: 17.5 });
      expect(lerNotaDigitada(' 18.25 ', 20)).toEqual({ ok: true, valor: 18.25 });
      expect(lerNotaDigitada('', 20)).toEqual({ ok: true, valor: null });
    });

    it('recusa acima do peso e texto inválido', () => {
      expect(lerNotaDigitada('20,5', 20)).toEqual({ ok: false, erro: 'Máximo 20' });
      expect(lerNotaDigitada('abc', 20).ok).toBe(false);
      expect(lerNotaDigitada('-1', 20).ok).toBe(false);
      expect(lerNotaDigitada('1,234', 20).ok).toBe(false);
    });
  });

  it('ceil1 nunca subestima a meta e fmtPts usa vírgula', () => {
    expect(ceil1(24.01)).toBe(24.1);
    expect(ceil1(24)).toBe(24);
    expect(fmtPts(2.5)).toBe('2,5');
  });

  describe('calcularDimensao', () => {
    it('sem nota: situação sem_notas e média de 70% como referência', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({}));
      expect(r.situacao).toBe('sem_notas');
      expect(r.meta).toBe(70);
      expect(r.pisoExame).toBe(40);
      expect(mensagemDimensao(r).texto).toContain('70%');
    });

    it('várias pendentes: média exigida e meta da próxima', () => {
      // N1 16/20 → faltam 54 dos 80 restantes = 67,5% → no caminho
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 16 }));
      expect(r.falta).toBe(54);
      expect(r.restante).toBe(80);
      expect(r.situacao).toBe('no_caminho');
      const m = mensagemDimensao(r);
      expect(m.titulo).toBe('Média de 68% no que falta');
      expect(m.proxima).toEqual({ rotulo: 'TPI', alvo: 20.3, pontos: 30 });
      // aproveitamento 80% ≥ 67,5% → fecha com ~80
      expect(m.ritmo).toContain('você fecha com cerca de 80');
    });

    it('uma pendente: nota exata na última prova', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 14, tpi: 18, n2: 26 }));
      // 58 de 85 → faltam 12 dos 15 da N3
      expect(r.pendentes.map((p) => p.id)).toEqual(['n3']);
      const m = mensagemDimensao(r);
      expect(m.titulo).toBe('Tire 12 na Prova N3');
      expect(m.texto).toContain('80%');
      expect(r.situacao).toBe('atencao');
    });

    it('garantida antes do fim', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 20, tpi: 25, n2: 30 }));
      expect(r.situacao).toBe('garantida');
      expect(r.concluida).toBe(false);
      expect(mensagemDimensao(r).titulo).toBe('Os 70 já estão garantidos');
    });

    it('70 impossível mas exame ao alcance (cognitiva com exame)', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 5, tpi: 10, n2: 10 }));
      // 25 + 15 restantes = 40 de máximo
      expect(r.maximo).toBe(40);
      expect(r.situacao).toBe('exame');
      expect(mensagemDimensao(r).titulo).toBe('Mire nos 40 do exame especial');
    });

    it('abaixo do piso do exame: abaixo', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 5, tpi: 5, n2: 10 }));
      expect(r.maximo).toBe(35);
      expect(r.situacao).toBe('abaixo');
      // Sem chance de 70, nada de "dá para virar".
      expect(mensagemDimensao(r).ritmo).toBeNull();
    });

    it('habilidades não tem exame: concluída abaixo de 70 é abaixo', () => {
      const r = calcularDimensao(habilidades, eixo, reg, notas({ apg1: 10, apg2: 10, osce: 40 }));
      expect(r.pisoExame).toBeNull();
      expect(r.concluida).toBe(true);
      expect(r.situacao).toBe('abaixo');
      expect(mensagemDimensao(r).texto).toContain('não tem exame especial');
    });

    it('subitens viram folhas com rótulo composto', () => {
      const r = calcularDimensao(habilidades, eixo, reg, notas({ apg1: 18 }));
      expect(r.folhas.map((f) => f.rotulo)).toEqual([
        'Avaliação Diária na APG · 1ª parcial',
        'Avaliação Diária na APG · 2ª parcial',
        'OSCE',
      ]);
      expect(r.pendentes[0].rotulo).toBe('Avaliação Diária na APG · 2ª parcial');
    });
  });

  it('nota acima do peso (peso reduzido depois) é limitada ao peso', () => {
    const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 25 }));
    expect(r.obtido).toBe(20);
    expect(r.aproveitamento).toBe(1);
  });

  it('nota zero conta como lançada', () => {
    expect(lerNotaDigitada('0', 20)).toEqual({ ok: true, valor: 0 });
    const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 0 }));
    expect(r.lancadas).toBe(1);
    // 70 dos 80 restantes = 87,5% → apertada
    expect(r.situacao).toBe('risco');
  });

  describe('situacaoEixo', () => {
    it('sem compensação: cognitiva no exame + prática garantida = exame', () => {
      const cog = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 10, tpi: 15, n2: 20, n3: 5 }));
      const hab = calcularDimensao(habilidades, eixo, reg, notas({ apg1: 20, apg2: 15, osce: 60 }));
      expect(cog.situacao).toBe('exame');
      expect(hab.situacao).toBe('garantida');
      expect(situacaoEixo([cog, hab])).toBe('exame');
    });

    it('prática abaixo de 70 reprova mesmo com cognitiva alta', () => {
      const cog = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 20, tpi: 30, n2: 35, n3: 15 }));
      const hab = calcularDimensao(habilidades, eixo, reg, notas({ apg1: 10, apg2: 10, osce: 30 }));
      expect(situacaoEixo([cog, hab])).toBe('reprovado');
    });
  });

  it('calcularPeriodo escolhe como foco a dimensão mais apertada e proximosPassos agrupa garantidas', () => {
    const regulamento: NotasRegulamento = {
      id: 'r',
      periodo: 1,
      semestre: '2026.2',
      titulo: null,
      fonte: null,
      nota_minima: 70,
      nota_minima_exame: 40,
      frequencia_minima: 75,
      observacao: null,
      status: 'publicado',
      publicado_em: null,
      notificado_em: null,
      atualizado_em: '',
      eixos: [eixo],
    };
    const lancamentos: NotaLancamento[] = [
      { item_id: 'n1', nota: 12, atualizado_em: '' },
      { item_id: 'apg1', nota: 20, atualizado_em: '' },
      { item_id: 'apg2', nota: 15, atualizado_em: '' },
      { item_id: 'osce', nota: 60, atualizado_em: '' },
    ];
    const p = calcularPeriodo(regulamento, lancamentos);
    expect(p.foco?.id).toBe('cog');
    expect(p.garantidas).toBe(1);
    expect(p.lancadas).toBe(4);
    expect(p.totalFolhas).toBe(7);
    const passos = proximosPassos(p);
    expect(passos[0].dimensaoId).toBe('cog');
    expect(passos.some((i) => i.titulo === '1 dimensão já garantida')).toBe(true);
  });

  it('simularFinal projeta o fechamento', () => {
    const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 10, tpi: 15 }));
    expect(simularFinal(r, 70)).toEqual({ final: 60, aprova: false, exame: true });
    expect(simularFinal(r, 90)).toEqual({ final: 70, aprova: true, exame: false });
  });

  describe('linhaDimensao (versão curta)', () => {
    it('faltam várias: % no que falta + meta da próxima', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 16 }));
      expect(linhaDimensao(r)).toEqual({
        nivel: 'info',
        titulo: 'Precisa de 68% no que falta',
        detalhe: 'Próxima: TPI, mire em 20,3 de 30',
      });
    });

    it('falta uma: nota exata', () => {
      const r = calcularDimensao(cognitiva, eixo, reg, notas({ n1: 14, tpi: 18, n2: 26 }));
      expect(linhaDimensao(r).titulo).toBe('Tire 12 na Prova N3');
    });

    it('sem notas e garantida', () => {
      expect(linhaDimensao(calcularDimensao(cognitiva, eixo, reg, notas({}))).titulo).toBe('Lance suas notas');
      expect(linhaDimensao(calcularDimensao(cognitiva, eixo, reg, notas({ n1: 20, tpi: 25, n2: 30 }))).titulo).toBe('70 garantido');
    });
  });
});
