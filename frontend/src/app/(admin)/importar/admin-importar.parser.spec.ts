import { describe, it, expect } from 'vitest';
import { parseBlocos } from './admin-importar.component';

const BLOCO_FECHADA = `---
ENUNCIADO
Qual a capital do Brasil?

ALTERNATIVAS
A) Brasília
B) Rio de Janeiro

GABARITO: A
---`;

const BLOCO_ABERTA = `---
FORMATO: aberta
ENUNCIADO
Descreva a tríade de Charcot.

RESPOSTA_MODELO
Febre, icterícia e dor em hipocôndrio direito, sugerindo colangite aguda.

PONTOS_CHAVE
- Cita febre
- Cita icterícia
- Cita dor em hipocôndrio direito

CRITERIOS: Resposta curta e objetiva.
---`;

describe('parseBlocos — questões abertas', () => {
  it('parseia questão aberta completa', () => {
    const [q] = parseBlocos(BLOCO_ABERTA, [], []);
    expect(q.valida).toBe(true);
    expect(q.formato).toBe('resposta_aberta_curta');
    expect(q.resposta_modelo).toContain('colangite aguda');
    expect(q.pontos_chave).toEqual([
      'Cita febre',
      'Cita icterícia',
      'Cita dor em hipocôndrio direito',
    ]);
    expect(q.criterios_correcao).toBe('Resposta curta e objetiva.');
    expect(q.alternativas).toHaveLength(0);
  });

  it('questão fechada continua parseando como antes', () => {
    const [q] = parseBlocos(BLOCO_FECHADA, [], []);
    expect(q.valida).toBe(true);
    expect(q.formato).toBe('multipla_escolha');
    expect(q.alternativas).toHaveLength(2);
    expect(q.alternativas[0].correta).toBe(true);
    expect(q.resposta_modelo).toBeNull();
  });

  it('lote misto: fechada e aberta na mesma importação', () => {
    const questoes = parseBlocos(`${BLOCO_FECHADA}\n${BLOCO_ABERTA}`, [], []);
    expect(questoes).toHaveLength(2);
    expect(questoes[0].formato).toBe('multipla_escolha');
    expect(questoes[1].formato).toBe('resposta_aberta_curta');
    expect(questoes.every((q) => q.valida)).toBe(true);
  });

  it('aberta sem RESPOSTA_MODELO é inválida', () => {
    const bloco = `---
FORMATO: aberta
ENUNCIADO
Pergunta discursiva sem gabarito.
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.valida).toBe(false);
    expect(q.erros.join(' ')).toContain('RESPOSTA_MODELO');
  });

  it('aberta com ALTERNATIVAS/GABARITO é inválida', () => {
    const bloco = `---
FORMATO: aberta
ENUNCIADO
Pergunta.

RESPOSTA_MODELO
Modelo.

ALTERNATIVAS
A) Alternativa proibida
B) Outra

GABARITO: A
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.valida).toBe(false);
    expect(q.erros.join(' ')).toContain('ALTERNATIVAS');
    expect(q.erros.join(' ')).toContain('GABARITO');
  });

  it('fechada com RESPOSTA_MODELO/PONTOS_CHAVE é inválida', () => {
    const bloco = `---
ENUNCIADO
Pergunta.

ALTERNATIVAS
A) Um
B) Dois

GABARITO: A

RESPOSTA_MODELO
Não deveria estar aqui.

PONTOS_CHAVE
- indevido
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.valida).toBe(false);
    expect(q.erros.join(' ')).toContain('RESPOSTA_MODELO');
    expect(q.erros.join(' ')).toContain('PONTOS_CHAVE');
  });

  it('FORMATO desconhecido é inválido', () => {
    const bloco = `---
FORMATO: dissertativa
ENUNCIADO
Pergunta.

RESPOSTA_MODELO
Modelo.
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.valida).toBe(false);
    expect(q.erros.join(' ')).toContain('inválido');
  });
});

describe('parseBlocos — conteúdo que parece rótulo', () => {
  // Conteúdo copiado de prova tem linhas assim de verdade: legenda de figura
  // começa com "Fonte:", e devolutiva comentada com "Gabarito:". Sem proteção,
  // o parser consumia como campo e corrompia a questão em silêncio.
  it('legenda "Fonte:" no texto de apoio não é consumida como campo FONTE', () => {
    const bloco = `---
ENUNCIADO
Qual a interpretação do traçado?

ENUNCIADO_APOIO
A cardiotocografia basal mostra uma imagem como a apresentada.
Fonte: Federação Internacional de Ginecologia e Obstetrícia (2015).

ALTERNATIVAS
A) Normal
B) Anormal

GABARITO: B
FONTE: TPI 2025.1
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.valida).toBe(true);
    expect(q.enunciado_apoio).toContain('Fonte: Federação Internacional');
    expect(q.fonte).toBe('TPI 2025.1');
  });

  it('"Gabarito: A ..." na explicação não sobrescreve o gabarito', () => {
    const bloco = `---
ENUNCIADO
Pergunta?

ALTERNATIVAS
A) Primeira
B) Segunda

GABARITO: B
EXPLICACAO: Padrão sinusoidal.
Gabarito: A alternativa correta descreve ondas regulares.
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.alternativas.find((a) => a.correta)?.letra).toBe('B');
    expect(q.explicacao).toContain('Gabarito: A alternativa correta');
  });

  it('rótulo em maiúsculas repetido depois não sobrescreve o primeiro', () => {
    const bloco = `---
ENUNCIADO
Pergunta?

ALTERNATIVAS
A) Primeira
B) Segunda

GABARITO: B
TIPO: nacional
EXPLICACAO: Comentário.
GABARITO: A
TIPO: processual
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.alternativas.find((a) => a.correta)?.letra).toBe('B');
    expect(q.tipo_questao).toBe('nacional');
    expect(q.explicacao).toContain('GABARITO: A');
  });

  it('rótulos normais continuam funcionando fora de texto livre', () => {
    const bloco = `---
ENUNCIADO
Pergunta?

ALTERNATIVAS
A) Primeira
B) Segunda

GABARITO: A
TIPO: laboratorio
REFERENCIA: Harrison, 21ª ed.
FONTE: Afya P1 2024.1
EXPLICACAO: Porque sim.
---`;
    const [q] = parseBlocos(bloco, [], []);
    expect(q.valida).toBe(true);
    expect(q.tipo_questao).toBe('laboratorio');
    expect(q.referencia).toBe('Harrison, 21ª ed.');
    expect(q.fonte).toBe('Afya P1 2024.1');
    expect(q.explicacao).toBe('Porque sim.');
    expect(q.alternativas.find((a) => a.correta)?.letra).toBe('A');
  });
});
