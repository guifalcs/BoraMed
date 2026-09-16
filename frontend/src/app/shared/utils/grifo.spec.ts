import { describe, expect, it } from 'vitest';
import {
  GRIFOS_STORAGE_VERSAO,
  MAX_GRIFOS_POR_QUESTAO,
  aplicarGrifo,
  apagarTrecho,
  desserializarGrifos,
  normalizarGrifos,
  serializarGrifos,
  temGrifoNoTrecho,
  type Grifo,
} from './grifo';

const g = (inicio: number, fim: number, cor: Grifo['cor'] = 'amarelo', bloco: Grifo['bloco'] = 'enunciado'): Grifo => ({
  bloco,
  inicio,
  fim,
  cor,
});

describe('normalizarGrifos', () => {
  it('funde grifos encostados da mesma cor no mesmo bloco', () => {
    expect(normalizarGrifos([g(0, 5), g(5, 10)])).toEqual([g(0, 10)]);
  });

  it('funde sobreposições parciais', () => {
    expect(normalizarGrifos([g(0, 8), g(4, 12)])).toEqual([g(0, 12)]);
  });

  it('não funde cores diferentes', () => {
    const saida = normalizarGrifos([g(0, 5, 'amarelo'), g(5, 10, 'verde')]);
    expect(saida).toHaveLength(2);
  });

  it('não funde blocos diferentes', () => {
    const saida = normalizarGrifos([g(0, 5, 'amarelo', 'enunciado'), g(5, 10, 'amarelo', 'apoio')]);
    expect(saida).toHaveLength(2);
  });

  it('descarta intervalo vazio ou invertido', () => {
    expect(normalizarGrifos([g(5, 5), g(9, 3), g(1, 4)])).toEqual([g(1, 4)]);
  });
});

describe('apagarTrecho', () => {
  it('parte em dois o grifo atravessado pelo meio', () => {
    expect(apagarTrecho([g(0, 20)], 'enunciado', 8, 12)).toEqual([g(0, 8), g(12, 20)]);
  });

  it('apara a borda quando a borracha pega só uma ponta', () => {
    expect(apagarTrecho([g(10, 20)], 'enunciado', 5, 12)).toEqual([g(12, 20)]);
    expect(apagarTrecho([g(10, 20)], 'enunciado', 15, 30)).toEqual([g(10, 15)]);
  });

  it('remove o grifo coberto por inteiro', () => {
    expect(apagarTrecho([g(10, 20)], 'enunciado', 0, 50)).toEqual([]);
  });

  it('não toca em grifo de outro bloco', () => {
    const grifos = [g(0, 10, 'amarelo', 'apoio')];
    expect(apagarTrecho(grifos, 'enunciado', 0, 10)).toEqual(grifos);
  });

  it('ignora borracha de tamanho zero', () => {
    expect(apagarTrecho([g(0, 10)], 'enunciado', 5, 5)).toEqual([g(0, 10)]);
  });
});

describe('aplicarGrifo', () => {
  it('a última passada manda: cor nova apaga a antiga no trecho coberto', () => {
    const saida = aplicarGrifo([g(0, 20, 'amarelo')], g(5, 10, 'verde'));
    expect(saida).toEqual([g(0, 5, 'amarelo'), g(5, 10, 'verde'), g(10, 20, 'amarelo')]);
  });

  it('regrifar a mesma cor por cima vira um bloco só', () => {
    expect(aplicarGrifo([g(0, 10)], g(6, 18))).toEqual([g(0, 18)]);
  });

  it('descarta intervalo inválido sem mexer no que existe', () => {
    const atuais = [g(0, 10)];
    expect(aplicarGrifo(atuais, g(7, 3))).toEqual(atuais);
  });

  it('respeita o teto por questão', () => {
    let grifos: Grifo[] = [];
    // Intervalos alternados e separados: nunca fundem.
    for (let i = 0; i < MAX_GRIFOS_POR_QUESTAO + 20; i++) {
      grifos = aplicarGrifo(grifos, g(i * 4, i * 4 + 2));
    }
    expect(grifos).toHaveLength(MAX_GRIFOS_POR_QUESTAO);
  });
});

describe('temGrifoNoTrecho', () => {
  it('detecta interseção parcial', () => {
    expect(temGrifoNoTrecho([g(10, 20)], 'enunciado', 18, 25)).toBe(true);
  });

  it('não conta trecho apenas encostado', () => {
    expect(temGrifoNoTrecho([g(10, 20)], 'enunciado', 20, 25)).toBe(false);
  });
});

describe('serialização', () => {
  it('sobrevive à ida e volta', () => {
    // A leitura devolve normalizado (ordenado por bloco/offset), então a
    // comparação é contra o normalizado — não contra a ordem de digitação.
    const mapa = new Map<string, Grifo[]>([
      ['q1', [g(0, 10, 'amarelo'), g(20, 30, 'azul', 'alt:abc')]],
      ['q2', [g(5, 9, 'rosa', 'apoio')]],
    ]);
    const esperado = new Map(
      [...mapa].map(([questaoId, grifos]) => [questaoId, normalizarGrifos(grifos)]),
    );
    expect(desserializarGrifos(serializarGrifos(mapa))).toEqual(esperado);
  });

  it('não grava questão sem grifo', () => {
    const salvo = serializarGrifos(new Map([['q1', []]]));
    expect(JSON.parse(salvo).questoes).toEqual({});
  });

  it('descarta payload de outra versão', () => {
    const salvo = JSON.stringify({ v: GRIFOS_STORAGE_VERSAO + 1, questoes: { q1: [g(0, 5)] } });
    expect(desserializarGrifos(salvo).size).toBe(0);
  });

  it('não explode com storage vazio ou corrompido', () => {
    expect(desserializarGrifos(null).size).toBe(0);
    expect(desserializarGrifos('não é json').size).toBe(0);
    expect(desserializarGrifos('[]').size).toBe(0);
  });

  it('joga fora só o grifo inválido, não a questão inteira', () => {
    const salvo = JSON.stringify({
      v: GRIFOS_STORAGE_VERSAO,
      questoes: {
        q1: [
          { bloco: 'enunciado', inicio: 0, fim: 5, cor: 'roxo' },
          { bloco: 'lugar-nenhum', inicio: 0, fim: 5, cor: 'amarelo' },
          { bloco: 'enunciado', inicio: 10, fim: 4, cor: 'verde' },
          { bloco: 'enunciado', inicio: 10, fim: 20, cor: 'verde' },
        ],
      },
    });
    expect(desserializarGrifos(salvo).get('q1')).toEqual([g(10, 20, 'verde')]);
  });
});
