import { formatarEnunciado } from './formatar-enunciado';

describe('formatarEnunciado', () => {
  it('retorna string vazia para valores nulos/vazios', () => {
    expect(formatarEnunciado(null)).toBe('');
    expect(formatarEnunciado(undefined)).toBe('');
    expect(formatarEnunciado('')).toBe('');
  });

  it('quebra uma enumeração de assertivas romanas em parágrafos', () => {
    const entrada =
      'apenas as assertivas: I. Grupo focal é uma técnica. II. Entrevista observa. III. Observação participante interage. IV. Observação não participante pergunta.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nI. Grupo focal');
    expect(saida).toContain('\n\nII. Entrevista');
    expect(saida).toContain('\n\nIII. Observação participante');
    expect(saida).toContain('\n\nIV. Observação não participante');
    // Nenhuma linha com 3+ quebras.
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('não altera nenhum conteúdo textual, apenas o espaçamento', () => {
    const entrada =
      'avalie: I. Primeira. II. Segunda. III. Terceira. IV. Quarta.';
    const saida = formatarEnunciado(entrada);
    // Removendo espaços em branco, o texto deve ser idêntico.
    const semEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(semEspacos(saida)).toBe(semEspacos(entrada));
  });

  it('não quebra numerais romanos soltos em prosa (sem enumeração)', () => {
    const entrada =
      'No século XX. Depois disso, o tipo IV. de reação foi descrito.';
    expect(formatarEnunciado(entrada)).toBe(entrada);
  });

  it('separa blocos de asserção/razão em parágrafos', () => {
    const entrada =
      'avalie as asserções a seguir. Asserção 1: "Esse estudo é etnográfico." Porque Asserção 2: "A etnografia se baseia na imersão." A respeito dessas asserções, assinale a opção correta.';
    const saida = formatarEnunciado(entrada);

    expect(saida).toContain('\n\nAsserção 1:');
    expect(saida).toContain('\n\nPorque\n\n');
    expect(saida).toContain('\n\nAsserção 2:');
    expect(saida).toContain('\n\nA respeito dessas asserções');
    expect(saida).not.toMatch(/\n{3,}/);
  });

  it('é estável ao ser aplicado duas vezes (idempotente)', () => {
    const entrada =
      'apenas as assertivas: I. Um. II. Dois. III. Três. IV. Quatro.';
    const uma = formatarEnunciado(entrada);
    const duas = formatarEnunciado(uma);
    expect(duas).toBe(uma);
  });
});
