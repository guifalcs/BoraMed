import {
  acharCaderno,
  aplicarSequencia,
  conferirRespostas,
  distribuicaoLetras,
  folhaEmBranco,
  nomeGabarito,
  nomesRepetidos,
  parseSequenciaGabarito,
  proximoNomeCaderno,
  redimensionarFolha,
  resumoFolha,
  semestreAtual,
} from './gabarito-prova.util';
import type { GabaritoProvaQuestao } from '../models/gabarito-prova';

describe('gabarito-prova.util', () => {
  describe('parseSequenciaGabarito', () => {
    it('lê sequência corrida', () => {
      expect(parseSequenciaGabarito('ABCDE', 5)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('lê formato numerado com vários separadores', () => {
      expect(parseSequenciaGabarito('1-A 2) B\n3. C, 4: D 5º E', 5)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('descarta palavras soltas e entende anulada', () => {
      expect(parseSequenciaGabarito('Gabarito: Questão 1 - B; Questão 2 - anulada; 3 - ?', 5)).toEqual([
        'B',
        'X',
        '?',
      ]);
    });

    it('ignora letra fora das alternativas da prova', () => {
      // "E" não existe numa prova A–D: o token inteiro é descartado.
      expect(parseSequenciaGabarito('A B E D', 4)).toEqual(['A', 'B', 'D']);
    });

    it('com numeração, ignora palavras que também são letras ("da", "e")', () => {
      expect(parseSequenciaGabarito('Gabarito da prova: 1-A 2-B', 5)).toEqual(['A', 'B']);
      expect(parseSequenciaGabarito('1-A e 2-B', 5)).toEqual(['A', 'B']);
    });

    it('com numeração, o número manda: fora de ordem e lacuna viram em análise', () => {
      expect(parseSequenciaGabarito('3-C 1-A', 5)).toEqual(['A', '?', 'C']);
    });

    it('nunca passa de 200 questões', () => {
      expect(parseSequenciaGabarito('A'.repeat(230), 5).length).toBe(200);
      expect(aplicarSequencia(folhaEmBranco(40), Array(230).fill('B')).length).toBe(200);
    });

    it('marca X, * e - como anuladas', () => {
      expect(parseSequenciaGabarito('A X * -', 5)).toEqual(['A', 'X', 'X', 'X']);
    });
  });

  describe('folha', () => {
    it('aplicarSequencia cresce a folha e preserva área', () => {
      const folha = folhaEmBranco(2).map((q) => ({ ...q, area: 'SOI' }));
      const r = aplicarSequencia(folha, ['A', 'X', '?']);
      expect(r.length).toBe(3);
      expect(r[0]).toMatchObject({ resposta: 'A', anulada: false, area: 'SOI' });
      expect(r[1]).toMatchObject({ resposta: null, anulada: true });
      expect(r[2]).toMatchObject({ numero: 3, resposta: null, anulada: false });
    });

    it('redimensionarFolha corta e estende', () => {
      const folha = aplicarSequencia(folhaEmBranco(3), ['A', 'B', 'C']);
      expect(redimensionarFolha(folha, 2).map((q) => q.resposta)).toEqual(['A', 'B']);
      expect(redimensionarFolha(folha, 4).map((q) => q.numero)).toEqual([1, 2, 3, 4]);
    });

    it('resumoFolha conta preenchidas, anuladas e em análise', () => {
      const folha = aplicarSequencia(folhaEmBranco(4), ['A', 'X']);
      expect(resumoFolha(folha)).toEqual({ total: 4, preenchidas: 2, anuladas: 1, emAnalise: 2 });
    });

    it('distribuicaoLetras ignora anuladas', () => {
      const folha = aplicarSequencia(folhaEmBranco(4), ['A', 'A', 'B', 'X']);
      const d = distribuicaoLetras(folha, 4);
      expect(d.map((x) => x.total)).toEqual([2, 1, 0, 0]);
      expect(d[0].pct).toBe(67);
    });
  });

  describe('conferirRespostas', () => {
    const questoes: GabaritoProvaQuestao[] = aplicarSequencia(folhaEmBranco(5), ['A', 'B', 'X', '?', 'C']);

    it('anulada conta ponto para todos e em análise fica fora da conta', () => {
      const r = conferirRespostas(questoes, { 1: 'A', 2: 'C', 3: 'D', 4: 'A' });
      expect(r.acertos).toBe(1);
      expect(r.erros).toBe(1);
      expect(r.anuladas).toBe(1);
      expect(r.emAnalise).toBe(1);
      expect(r.semResposta).toBe(1);
      expect(r.consideradas).toBe(4);
      // (1 acerto + 1 anulada) / 4 consideradas
      expect(r.nota).toBe(50);
      expect(r.porQuestao).toEqual({ 1: 'acerto', 2: 'erro', 3: 'anulada', 4: 'em-analise', 5: 'sem-resposta' });
    });

    it('nota zero sem questões consideradas', () => {
      const r = conferirRespostas(aplicarSequencia(folhaEmBranco(1), ['?']), {});
      expect(r.nota).toBe(0);
    });
  });

  it('nomeGabarito usa título ou monta o padrão', () => {
    expect(nomeGabarito({ titulo: null, tipo_prova: 'N2', periodo: 3 })).toBe('N2 · 3º período');
    expect(nomeGabarito({ titulo: '  N2 Manhã ', tipo_prova: 'N2', periodo: 3 })).toBe('N2 Manhã');
  });

  it('semestreAtual divide o ano em .1 e .2', () => {
    expect(semestreAtual(new Date(2026, 2, 1))).toBe('2026.1');
    expect(semestreAtual(new Date(2026, 10, 5))).toBe('2026.2');
  });

  describe('cadernos', () => {
    it('proximoNomeCaderno pega a primeira letra livre, ignorando caixa e espaços', () => {
      expect(proximoNomeCaderno([])).toBe('Caderno A');
      expect(proximoNomeCaderno(['Caderno A'])).toBe('Caderno B');
      expect(proximoNomeCaderno(['Azul', ' caderno a '])).toBe('Caderno B');
      expect(proximoNomeCaderno(['Caderno B', 'Caderno A'])).toBe('Caderno C');
    });

    it('nomesRepetidos acha duplicados sem contar vazios', () => {
      expect([...nomesRepetidos(['Azul', 'Verde'])]).toEqual([]);
      expect([...nomesRepetidos(['Azul', ' AZUL ', 'Verde'])]).toEqual(['azul']);
      expect([...nomesRepetidos(['', '  '])]).toEqual([]);
    });

    it('acharCaderno só devolve o caderno pedido: nunca chuta outro', () => {
      const cadernos = [
        { id: '1', slug: 'azul', nome: 'Azul', ordem: 1 },
        { id: '2', slug: 'verde', nome: 'Verde', ordem: 2 },
      ];
      expect(acharCaderno(cadernos, 'verde')?.id).toBe('2');
      expect(acharCaderno(cadernos, 'rosa')).toBeNull();
      expect(acharCaderno(cadernos, null)).toBeNull();
      expect(acharCaderno(cadernos, '')).toBeNull();
    });
  });
});
