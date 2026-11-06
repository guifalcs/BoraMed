import { assertEquals } from '@std/assert';
import { conferirSomas, herdarIds, type EixoNota } from './notas-regulamento.ts';

const atual: EixoNota[] = [{
  id: 'e1', sigla: 'SOI I', nome: 'SOI', exame_especial: true,
  dimensoes: [{
    id: 'd1', tipo: 'habilidades',
    itens: [
      { id: 'i1', nome: 'Avaliação Diária na APG', pontos: 35, subitens: [{ id: 's1', nome: '1ª parcial', pontos: 20 }, { id: 's2', nome: '2ª parcial', pontos: 15 }] },
      { id: 'i2', nome: 'OSCE', pontos: 65 },
    ],
  }],
}];

Deno.test('herda ids por sigla/tipo/nome ignorando caixa e acento', () => {
  const novo: EixoNota[] = [{
    sigla: 'soi i', nome: 'SOI', dimensoes: [{
      tipo: 'habilidades',
      itens: [
        { nome: 'avaliacao diaria na apg', pontos: 35, subitens: [{ nome: '1ª PARCIAL', pontos: 20 }, { nome: '2ª parcial', pontos: 15 }] },
        { nome: 'Multiestações', pontos: 65 },
      ],
    }],
  }];
  const r = herdarIds(atual, novo);
  assertEquals(r[0].id, 'e1');
  assertEquals(r[0].dimensoes[0].id, 'd1');
  assertEquals(r[0].dimensoes[0].itens.map((i) => i.id), ['i1', undefined]);
  assertEquals(r[0].dimensoes[0].itens[0].subitens?.map((s) => s.id), ['s1', 's2']);
});

Deno.test('eixo novo não herda nada', () => {
  const r = herdarIds(atual, [{ sigla: 'HAM I', nome: 'HAM', dimensoes: [{ tipo: 'habilidades', itens: [{ nome: 'OSCE', pontos: 100 }] }] }]);
  assertEquals(r[0].id, undefined);
  assertEquals(r[0].dimensoes[0].itens[0].id, undefined);
});

Deno.test('conferirSomas aponta dimensão fora de 100 e subitens que não fecham', () => {
  const avisos = conferirSomas([{ sigla: 'X', nome: 'X', dimensoes: [{ tipo: 'unica', itens: [{ nome: 'A', pontos: 90, subitens: [{ nome: 'a', pontos: 40 }, { nome: 'b', pontos: 40 }] }] }] }]);
  assertEquals(avisos.length, 2);
});

Deno.test('nomes repetidos não herdam o mesmo id duas vezes', () => {
  const r = herdarIds(atual, [{
    sigla: 'SOI I', nome: 'SOI', dimensoes: [{
      tipo: 'habilidades',
      itens: [{ nome: 'OSCE', pontos: 30 }, { nome: 'OSCE', pontos: 35 }, { nome: 'Avaliação Diária na APG', pontos: 35 }],
    }],
  }]);
  const ids = r[0].dimensoes[0].itens.map((i) => i.id);
  assertEquals(ids, ['i2', undefined, 'i1']);
});

Deno.test('exame_especial omitido herda o valor atual', () => {
  const r = herdarIds(atual, [{ sigla: 'SOI I', nome: 'SOI', dimensoes: [{ tipo: 'habilidades', itens: [{ nome: 'OSCE', pontos: 100 }] }] }]);
  assertEquals(r[0].exame_especial, true);
  const novo = herdarIds(atual, [{ sigla: 'HAM I', nome: 'HAM', dimensoes: [{ tipo: 'habilidades', itens: [{ nome: 'OSCE', pontos: 100 }] }] }]);
  assertEquals(novo[0].exame_especial, false);
});
