import type {
  NotaLancamento,
  NotasDimensao,
  NotasEixo,
  NotasRegulamento,
  TipoDimensao,
} from '../models/notas';

/**
 * Motor de cálculo e de insights do "Minhas notas". Puro (sem Angular), para
 * ser testado à parte e reaproveitado no admin (pré-visualização).
 *
 * Regras (regulamento 2026.2): cada dimensão vale `total` pontos (100) e
 * aprova com `nota_minima`% (70) SEM compensação entre dimensões. A cognitiva
 * de eixo com exame especial dá direito ao exame entre `nota_minima_exame`%
 * (40) e 70, desde que Habilidades e Atitudes feche ≥ 70 (e a frequência
 * esteja em dia, coisa que a plataforma não sabe).
 */

const EPS = 0.005;

export interface FolhaNota {
  id: string;
  /** Nome da folha (ex.: "1ª parcial"). */
  nome: string;
  /** Nome completo para frases (ex.: "Avaliação Diária na APG · 1ª parcial"). */
  rotulo: string;
  pontos: number;
  nota: number | null;
}

export type SituacaoDimensao =
  | 'sem_notas'
  | 'garantida'
  | 'confortavel'
  | 'no_caminho'
  | 'atencao'
  | 'risco'
  | 'exame'
  | 'abaixo';

export interface ResumoDimensao {
  id: string;
  tipo: TipoDimensao;
  nome: string;
  eixoId: string;
  eixoSigla: string;
  total: number;
  /** Pontos para aprovar (total × nota_minima%). */
  meta: number;
  /** Pontos mínimos para o exame especial; null se a dimensão não tem exame. */
  pisoExame: number | null;
  obtido: number;
  /** Soma dos pesos das folhas já lançadas. */
  avaliado: number;
  /** Pontos ainda em jogo. */
  restante: number;
  /** Quanto falta para a meta (0 se já bateu). */
  falta: number;
  /** obtido ÷ avaliado (0–1); null sem lançamento. */
  aproveitamento: number | null;
  /** falta ÷ restante (0–1+); null se nada falta ou nada resta. */
  necessario: number | null;
  /** Nota final com nota máxima em tudo que falta. */
  maximo: number;
  /** Nota final mantendo o aproveitamento atual; null sem lançamento. */
  projecao: number | null;
  folhas: FolhaNota[];
  pendentes: FolhaNota[];
  lancadas: number;
  concluida: boolean;
  situacao: SituacaoDimensao;
}

export type SituacaoEixo = 'sem_notas' | 'aprovado' | 'em_andamento' | 'exame' | 'reprovado';

export interface ResumoEixo {
  eixo: NotasEixo;
  dimensoes: ResumoDimensao[];
  situacao: SituacaoEixo;
  concluido: boolean;
}

export interface ResumoPeriodo {
  eixos: ResumoEixo[];
  dimensoes: ResumoDimensao[];
  totalFolhas: number;
  lancadas: number;
  garantidas: number;
  emAlerta: number;
  semNotas: number;
  /** obtido ÷ avaliado somando todas as dimensões; null sem lançamento. */
  aproveitamento: number | null;
  /** Dimensão em andamento que mais pede atenção agora. */
  foco: ResumoDimensao | null;
}

export type NivelInsight = 'sucesso' | 'info' | 'atencao' | 'risco' | 'neutro';

export interface MensagemDimensao {
  nivel: NivelInsight;
  titulo: string;
  texto: string;
  /** Meta concreta para a próxima avaliação pendente. */
  proxima: { rotulo: string; alvo: number; pontos: number } | null;
  /** Leitura do ritmo atual (aproveitamento → projeção). */
  ritmo: string | null;
}

export interface Insight extends MensagemDimensao {
  dimensaoId: string;
  eixoId: string;
  contexto: string;
}

// ─── Números ────────────────────────────────────────────────────────────────

export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Arredonda para cima em 1 casa: meta nunca subestimada. */
export function ceil1(n: number): number {
  return Math.ceil(r2(n) * 10 - 1e-9) / 10;
}

export function fmtPts(n: number): string {
  return r2(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Percentual para exibir. `teto` arredonda para cima (o que é exigido). */
export function fmtPct(fracao: number, teto = false): string {
  const v = fracao * 100;
  return `${teto ? Math.ceil(v - 1e-9) : Math.round(v)}%`;
}

export type NotaDigitada = { ok: true; valor: number | null } | { ok: false; erro: string };

/** Lê o que o aluno digitou ("17,5", "17.5", "" = apagar). */
export function lerNotaDigitada(texto: string, pontos: number): NotaDigitada {
  const t = texto.trim().replace(',', '.');
  if (t === '') return { ok: true, valor: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return { ok: false, erro: 'Use números, como 17,5' };
  const valor = Number(t);
  if (valor > pontos + EPS) return { ok: false, erro: `Máximo ${fmtPts(pontos)}` };
  return { ok: true, valor: r2(valor) };
}

// ─── Cálculo ────────────────────────────────────────────────────────────────

export function mapaNotas(lancamentos: readonly NotaLancamento[]): Map<string, number> {
  return new Map(lancamentos.map((l) => [l.item_id, Number(l.nota)]));
}

/** Defesa: nota acima do peso (peso reduzido depois) nunca passa do peso. */
function limitar(nota: number | undefined, pontos: number): number | null {
  return nota === undefined ? null : Math.min(nota, Number(pontos));
}

export function folhasDaDimensao(dim: NotasDimensao, notas: ReadonlyMap<string, number>): FolhaNota[] {
  const folhas: FolhaNota[] = [];
  for (const item of dim.itens) {
    if (item.subitens.length === 0) {
      folhas.push({ id: item.id, nome: item.nome, rotulo: item.nome, pontos: Number(item.pontos), nota: limitar(notas.get(item.id), item.pontos) });
      continue;
    }
    for (const sub of item.subitens) {
      folhas.push({
        id: sub.id,
        nome: sub.nome,
        rotulo: `${item.nome} · ${sub.nome}`,
        pontos: Number(sub.pontos),
        nota: limitar(notas.get(sub.id), sub.pontos),
      });
    }
  }
  return folhas;
}

export function calcularDimensao(
  dim: NotasDimensao,
  eixo: NotasEixo,
  reg: Pick<NotasRegulamento, 'nota_minima' | 'nota_minima_exame'>,
  notas: ReadonlyMap<string, number>,
): ResumoDimensao {
  const folhas = folhasDaDimensao(dim, notas);
  const total = r2(folhas.reduce((s, f) => s + f.pontos, 0));
  const lancadasF = folhas.filter((f) => f.nota !== null);
  const obtido = r2(lancadasF.reduce((s, f) => s + (f.nota ?? 0), 0));
  const avaliado = r2(lancadasF.reduce((s, f) => s + f.pontos, 0));
  const restante = r2(total - avaliado);
  const meta = r2((total * Number(reg.nota_minima)) / 100);
  const pisoExame =
    dim.tipo === 'cognitiva' && eixo.exame_especial ? r2((total * Number(reg.nota_minima_exame)) / 100) : null;
  const falta = r2(Math.max(0, meta - obtido));
  const aproveitamento = avaliado > EPS ? obtido / avaliado : null;
  const necessario = falta > EPS && restante > EPS ? falta / restante : null;
  const maximo = r2(obtido + restante);
  const projecao = aproveitamento === null ? null : r2(obtido + aproveitamento * restante);
  const concluida = restante <= EPS;

  let situacao: SituacaoDimensao;
  if (lancadasF.length === 0) situacao = 'sem_notas';
  else if (obtido >= meta - EPS) situacao = 'garantida';
  else if (concluida || maximo < meta - EPS) {
    const alvo = concluida ? obtido : maximo;
    situacao = pisoExame !== null && alvo >= pisoExame - EPS ? 'exame' : 'abaixo';
  } else {
    const n = necessario ?? 0;
    situacao = n <= 0.5 + 1e-9 ? 'confortavel' : n <= 0.7 + 1e-9 ? 'no_caminho' : n <= 0.85 + 1e-9 ? 'atencao' : 'risco';
  }

  return {
    id: dim.id,
    tipo: dim.tipo,
    nome: dim.nome,
    eixoId: eixo.id,
    eixoSigla: eixo.sigla,
    total,
    meta,
    pisoExame,
    obtido,
    avaliado,
    restante,
    falta,
    aproveitamento,
    necessario,
    maximo,
    projecao,
    folhas,
    pendentes: folhas.filter((f) => f.nota === null),
    lancadas: lancadasF.length,
    concluida,
    situacao,
  };
}

export function situacaoEixo(dims: readonly ResumoDimensao[]): SituacaoEixo {
  if (dims.length === 0 || dims.every((d) => d.situacao === 'sem_notas')) return 'sem_notas';
  if (dims.every((d) => d.situacao === 'garantida')) return 'aprovado';
  if (dims.some((d) => d.situacao === 'abaixo')) return 'reprovado';
  const cog = dims.find((d) => d.tipo === 'cognitiva');
  if (cog?.situacao === 'exame') return 'exame';
  return 'em_andamento';
}

/** Ordem de urgência: quanto menor, mais pede atenção agora. */
const URGENCIA: Record<SituacaoDimensao, number> = {
  risco: 0,
  atencao: 1,
  exame: 2,
  no_caminho: 3,
  confortavel: 4,
  sem_notas: 5,
  abaixo: 6,
  garantida: 7,
};

function compararUrgencia(a: ResumoDimensao, b: ResumoDimensao): number {
  return URGENCIA[a.situacao] - URGENCIA[b.situacao] || (b.necessario ?? 0) - (a.necessario ?? 0);
}

export function calcularPeriodo(reg: NotasRegulamento, lancamentos: readonly NotaLancamento[]): ResumoPeriodo {
  const notas = mapaNotas(lancamentos);
  const eixos: ResumoEixo[] = reg.eixos.map((eixo) => {
    const dimensoes = eixo.dimensoes.map((d) => calcularDimensao(d, eixo, reg, notas));
    return { eixo, dimensoes, situacao: situacaoEixo(dimensoes), concluido: dimensoes.every((d) => d.concluida) };
  });
  const dimensoes = eixos.flatMap((e) => e.dimensoes);
  const obtido = dimensoes.reduce((s, d) => s + d.obtido, 0);
  const avaliado = dimensoes.reduce((s, d) => s + d.avaliado, 0);
  const emAndamento = dimensoes.filter(
    (d) => !d.concluida && ['risco', 'atencao', 'exame', 'no_caminho', 'confortavel'].includes(d.situacao),
  );

  return {
    eixos,
    dimensoes,
    totalFolhas: dimensoes.reduce((s, d) => s + d.folhas.length, 0),
    lancadas: dimensoes.reduce((s, d) => s + d.lancadas, 0),
    garantidas: dimensoes.filter((d) => d.situacao === 'garantida').length,
    emAlerta: dimensoes.filter((d) => ['risco', 'atencao', 'exame', 'abaixo'].includes(d.situacao)).length,
    semNotas: dimensoes.filter((d) => d.situacao === 'sem_notas').length,
    aproveitamento: avaliado > EPS ? obtido / avaliado : null,
    foco: [...emAndamento].sort(compararUrgencia)[0] ?? null,
  };
}

// ─── Mensagens ──────────────────────────────────────────────────────────────

const NIVEL: Record<SituacaoDimensao, NivelInsight> = {
  sem_notas: 'neutro',
  garantida: 'sucesso',
  confortavel: 'sucesso',
  no_caminho: 'info',
  atencao: 'atencao',
  risco: 'risco',
  exame: 'atencao',
  abaixo: 'risco',
};

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

/** "na Prova N1" / "no OSCE": evita "na OSCE" em frases curtas. */
function artigo(rotulo: string): string {
  return /^(OSCE|TPI|Memorial|Relato|Projeto|Resumo|Podcast|Diário|Produto|e-portfólio)/i.test(rotulo) ? 'no' : 'na';
}

function ritmo(r: ResumoDimensao): string | null {
  if (r.aproveitamento === null || r.projecao === null || r.concluida) return null;
  // Sem como chegar na meta, "dá para virar" seria mentira.
  if (r.maximo < r.meta - EPS) return null;
  const aprov = fmtPct(r.aproveitamento);
  if (r.obtido >= r.meta - EPS) return `Seu aproveitamento até aqui é ${aprov}.`;
  if (r.necessario !== null && r.aproveitamento + 1e-9 >= r.necessario) {
    return `No seu ritmo atual (${aprov}), você fecha com cerca de ${fmtPts(Math.round(r.projecao))}.`;
  }
  return `No ritmo atual (${aprov}) fecharia com cerca de ${fmtPts(Math.round(r.projecao))}: dá para virar, mas precisa subir.`;
}

export function mensagemDimensao(r: ResumoDimensao): MensagemDimensao {
  const nivel = NIVEL[r.situacao];
  const base = { nivel, proxima: null, ritmo: ritmo(r) };
  const meta = fmtPts(r.meta);

  switch (r.situacao) {
    case 'sem_notas':
      return {
        ...base,
        titulo: 'Nenhuma nota lançada ainda',
        texto: `Para fechar com ${meta}, você precisa de ${fmtPct(r.total > 0 ? r.meta / r.total : 0.7)} de aproveitamento em média. Lance as notas que já saíram.`,
      };

    case 'garantida':
      return r.concluida
        ? {
            ...base,
            titulo: `Fechou com ${fmtPts(r.obtido)}`,
            texto: `Acima do mínimo de ${meta}. Dimensão aprovada, desde que a frequência esteja em dia.`,
          }
        : {
            ...base,
            titulo: `Os ${meta} já estão garantidos`,
            texto: `Você tem ${fmtPts(r.obtido)} de ${fmtPts(r.total)}. O que vier agora é lucro: ainda há ${fmtPts(r.restante)} pts em jogo e a nota pode chegar a ${fmtPts(r.maximo)}.`,
          };

    case 'exame': {
      const piso = fmtPts(r.pisoExame ?? 0);
      if (r.concluida) {
        return {
          ...base,
          titulo: `Fechou com ${fmtPts(r.obtido)}: direito ao exame especial`,
          texto: `Ficou entre ${piso} e ${meta}. O exame vale se Habilidades e Atitudes fechar com ${meta} ou mais e a frequência estiver em dia.`,
        };
      }
      if (r.obtido >= (r.pisoExame ?? 0) - EPS) {
        return {
          ...base,
          titulo: `Os ${meta} ficaram fora de alcance`,
          texto: `Mesmo com nota máxima no que falta, fecha em ${fmtPts(r.maximo)}. Você já passou dos ${piso} do exame especial: agora, garanta ${meta} em Habilidades e Atitudes.`,
        };
      }
      const faltaPiso = r2((r.pisoExame ?? 0) - r.obtido);
      return {
        ...base,
        titulo: `Mire nos ${piso} do exame especial`,
        texto: `Mesmo com nota máxima no que falta, fecha em ${fmtPts(r.maximo)}. Com ${piso} ou mais, a cognitiva vai para o exame especial (se a prática fechar com ${meta}): faltam ${fmtPts(ceil1(faltaPiso))} pts, ${fmtPct(faltaPiso / r.restante, true)} do que resta.`,
      };
    }

    case 'abaixo': {
      const semExame =
        r.pisoExame !== null
          ? ` e não alcança os ${fmtPts(r.pisoExame)} que dão direito ao exame especial`
          : r.tipo === 'cognitiva'
            ? ''
            : ', e esta dimensão não tem exame especial';
      return r.concluida
        ? {
            ...base,
            titulo: `Fechou com ${fmtPts(r.obtido)}`,
            texto: `Abaixo do mínimo de ${meta}${semExame}. Vale conversar com a coordenação sobre os próximos passos.`,
          }
        : {
            ...base,
            titulo: `Os ${meta} ficaram fora de alcance`,
            texto: `Mesmo com nota máxima no que falta, fecha em ${fmtPts(r.maximo)}${semExame}. Vale conversar com a coordenação.`,
          };
    }

    default: {
      // Em andamento: algo falta e ainda dá.
      const necessario = r.necessario ?? 0;
      if (r.pendentes.length === 1) {
        const p = r.pendentes[0];
        const alvo = Math.min(p.pontos, ceil1(r.falta));
        return {
          ...base,
          titulo: `Tire ${fmtPts(alvo)} ${artigo(p.rotulo)} ${p.rotulo}`,
          texto: `É a última avaliação desta dimensão: ${fmtPts(alvo)} de ${fmtPts(p.pontos)} (${fmtPct(alvo / p.pontos, true)}) fecham os ${meta}.`,
        };
      }
      const prox = r.pendentes[0];
      const alvoProx = Math.min(prox.pontos, ceil1(necessario * prox.pontos));
      return {
        ...base,
        titulo: `Média de ${fmtPct(necessario, true)} no que falta`,
        texto: `Faltam ${fmtPts(ceil1(r.falta))} pts dos ${fmtPts(r.restante)} ainda em jogo, em ${r.pendentes.length} ${plural(r.pendentes.length, 'avaliação', 'avaliações')}.`,
        proxima: { rotulo: prox.rotulo, alvo: alvoProx, pontos: prox.pontos },
      };
    }
  }
}

export function contextoDimensao(r: Pick<ResumoDimensao, 'eixoSigla' | 'tipo'>): string {
  const rotulo: Record<TipoDimensao, string> = {
    cognitiva: 'Cognitiva',
    habilidades: 'Habilidades e Atitudes',
    unica: 'Dimensão única',
  };
  return `${r.eixoSigla} · ${rotulo[r.tipo]}`;
}

/**
 * Lista curta e priorizada do que fazer agora: primeiro o que está em risco,
 * depois o que ainda está em jogo; dimensões garantidas e sem nota viram uma
 * linha cada (não repetem cinco cards iguais).
 */
export function proximosPassos(p: ResumoPeriodo, limite = 4): Insight[] {
  const comContexto = (r: ResumoDimensao): Insight => ({
    ...mensagemDimensao(r),
    dimensaoId: r.id,
    eixoId: r.eixoId,
    contexto: contextoDimensao(r),
  });

  const ativos = p.dimensoes
    .filter((d) => !d.concluida && !['sem_notas', 'garantida'].includes(d.situacao))
    .sort(compararUrgencia)
    .map(comContexto);

  const extras: Insight[] = [];
  const semNotas = p.dimensoes.filter((d) => d.situacao === 'sem_notas');
  if (semNotas.length > 0 && p.lancadas > 0) {
    const primeira = semNotas[0];
    extras.push({
      nivel: 'neutro',
      titulo: `${semNotas.length} ${plural(semNotas.length, 'dimensão ainda sem nota', 'dimensões ainda sem nota')}`,
      texto: `${semNotas.slice(0, 3).map(contextoDimensao).join(', ')}${semNotas.length > 3 ? '…' : ''}. Lance o que já saiu para o cálculo valer para o semestre todo.`,
      proxima: null,
      ritmo: null,
      dimensaoId: primeira.id,
      eixoId: primeira.eixoId,
      contexto: 'Sem notas',
    });
  }
  const garantidas = p.dimensoes.filter((d) => d.situacao === 'garantida');
  if (garantidas.length > 0) {
    const primeira = garantidas[0];
    extras.push({
      nivel: 'sucesso',
      titulo: `${garantidas.length} ${plural(garantidas.length, 'dimensão já garantida', 'dimensões já garantidas')}`,
      texto: `${garantidas.slice(0, 3).map(contextoDimensao).join(', ')}${garantidas.length > 3 ? '…' : ''}. Nota mínima batida.`,
      proxima: null,
      ritmo: null,
      dimensaoId: primeira.id,
      eixoId: primeira.eixoId,
      contexto: 'Garantidas',
    });
  }

  return [...ativos, ...extras].slice(0, limite);
}

/** "E se eu tirar X% no que falta?" */
export function simularFinal(r: ResumoDimensao, pct: number): { final: number; aprova: boolean; exame: boolean } {
  const final = r2(r.obtido + (r.restante * pct) / 100);
  return {
    final,
    aprova: final >= r.meta - EPS,
    exame: r.pisoExame !== null && final < r.meta - EPS && final >= r.pisoExame - EPS,
  };
}

// ─── Versão curta (tela do aluno) ───────────────────────────────────────────

export interface LinhaDimensao {
  nivel: NivelInsight;
  /** Uma frase: o que importa agora. */
  titulo: string;
  /** No máximo um complemento curto (meta da próxima, quanto falta…). */
  detalhe: string | null;
}

/**
 * O essencial de cada dimensão em uma linha, para a tela do aluno não virar
 * um parágrafo por cartão. A versão longa (`mensagemDimensao`) segue
 * disponível para outros usos.
 */
export function linhaDimensao(r: ResumoDimensao): LinhaDimensao {
  const nivel = NIVEL[r.situacao];
  const meta = fmtPts(r.meta);
  switch (r.situacao) {
    case 'sem_notas':
      return { nivel, titulo: 'Lance suas notas', detalhe: `Para passar: ${meta} de ${fmtPts(r.total)}` };
    case 'garantida':
      return r.concluida
        ? { nivel, titulo: `Aprovado com ${fmtPts(r.obtido)}`, detalhe: null }
        : { nivel, titulo: `${meta} garantido`, detalhe: 'O que vier agora é lucro' };
    case 'exame': {
      const piso = r.pisoExame ?? 0;
      if (r.concluida) return { nivel, titulo: 'Exame especial', detalhe: `Fechou com ${fmtPts(r.obtido)}` };
      if (r.obtido >= piso - EPS) return { nivel, titulo: `Os ${meta} ficaram fora de alcance`, detalhe: 'Exame especial já garantido' };
      return { nivel, titulo: `Mire nos ${fmtPts(piso)} do exame especial`, detalhe: `Faltam ${fmtPts(ceil1(piso - r.obtido))} pts` };
    }
    case 'abaixo':
      return r.concluida
        ? { nivel, titulo: `Fechou com ${fmtPts(r.obtido)}`, detalhe: 'Abaixo do mínimo' }
        : { nivel, titulo: `Os ${meta} ficaram fora de alcance`, detalhe: 'Converse com a coordenação' };
    default: {
      if (r.pendentes.length === 1) {
        const p = r.pendentes[0];
        const alvo = Math.min(p.pontos, ceil1(r.falta));
        return { nivel, titulo: `Tire ${fmtPts(alvo)} ${artigo(p.rotulo)} ${p.rotulo}`, detalhe: `de ${fmtPts(p.pontos)} possíveis` };
      }
      const necessario = r.necessario ?? 0;
      const prox = r.pendentes[0];
      const alvo = Math.min(prox.pontos, ceil1(necessario * prox.pontos));
      return {
        nivel,
        titulo: `Precisa de ${fmtPct(necessario, true)} no que falta`,
        detalhe: `Próxima: ${prox.rotulo}, mire em ${fmtPts(alvo)} de ${fmtPts(prox.pontos)}`,
      };
    }
  }
}
