import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, ChevronDown, Paperclip, X,
} from 'lucide-angular';
import { ImagemProtegidaPipe } from '../../shared/pipes/imagem-protegida.pipe';
import {
  AdminService,
  AdminDisciplina,
  AdminTema,
  QuestaoPayload,
  AlternativaPayload,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

// ──── Questões ────

export interface AlternativaParseada {
  letra: string;
  texto: string;
  correta: boolean;
  // Importação é textual, então normalmente ausente; presente só quando a
  // origem já traz URL de imagem (mantém o preview compatível).
  imagem_url?: string | null;
}

export interface QuestaoParseada {
  enunciado: string;
  enunciado_apoio: string | null;
  alternativas: AlternativaParseada[];
  formato: 'multipla_escolha' | 'verdadeiro_falso' | 'resposta_aberta_curta';
  resposta_modelo: string | null;
  pontos_chave: string[];
  criterios_correcao: string | null;
  tipo_questao: 'nacional' | 'processual' | 'laboratorio' | null;
  disciplina_id: string | null;
  disciplinaDisplay: string;
  tema_ids: string[];
  temasDisplay: string;
  explicacao: string | null;
  referencia: string | null;
  fonte: string | null;
  valida: boolean;
  erros: string[];
}

// ──── Disciplinas ────

interface DisciplinaParseada {
  sigla: string;
  nome: string | null;
  periodo: number | null;
  duplicada: boolean;
  valida: boolean;
  erros: string[];
}

// ──── Temas ────

interface TemaParseado {
  nome: string;
  disciplina_id: string | null;
  disciplinaDisplay: string;
  parentNome: string | null;
  parent_id: string | null;
  parentDisplay: string;
  parentNaoEncontrado: boolean;
  valida: boolean;
  erros: string[];
}

type TipoImportacao = 'questoes' | 'disciplinas' | 'temas';

// ──── Prompts ────

export function montarPromptQuestoes(
  disciplinas: AdminDisciplina[],
  temas: AdminTema[],
): string {
  const listaDisciplinas = disciplinas.length > 0
    ? disciplinas.map((d) => `- ${d.sigla}${d.nome ? `: ${d.nome}` : ''}`).join('\n')
    : '- Nenhuma disciplina cadastrada foi carregada. Omita DISCIPLINA.';

  const disciplinaById = new Map(disciplinas.map((d) => [d.id, d.sigla]));
  const listaTemas = temas.length > 0
    ? temas
        .map((t) => {
          const sigla = t.disciplina_id ? disciplinaById.get(t.disciplina_id) : null;
          return `- ${sigla ? `[${sigla}] ` : ''}${t.nome}`;
        })
        .join('\n')
    : '- Nenhum tema cadastrado foi carregado. Omita TEMA.';

  return `Você vai converter questões médicas de um arquivo para um formato de importação na plataforma BoraMed. Siga o template exatamente — o sistema lê esse formato automaticamente.

Há dois formatos de questão. Use FECHADA (padrão) para questões com alternativas; use ABERTA (discursiva) quando a questão do original pede uma resposta escrita, sem alternativas.

FORMATO FECHADA — separe cada questão com ---

---
ENUNCIADO
[texto completo da questão, exatamente como está no original]

ENUNCIADO_APOIO
[texto de apoio/caso clínico que antecede a pergunta — omita a seção inteira se não houver]

ALTERNATIVAS
A) [texto da alternativa A]
B) [texto da alternativa B]
C) [texto da alternativa C]
D) [texto da alternativa D]
E) [texto da alternativa E]

GABARITO: [letra correta, ex: B]
TIPO: [nacional | processual | laboratorio — omita se não souber]
DISCIPLINA: [sigla exata da lista abaixo — omita se não souber]
TEMA: [nome exato de um tema da lista abaixo — omita se não souber]
EXPLICACAO: [explicação do gabarito, se disponível no documento]
REFERENCIA: [referência bibliográfica, se disponível — omita se não houver]
FONTE: [ex: Afya P1 2024.1 — omita se não souber]
---

FORMATO ABERTA (discursiva) — separe cada questão com ---

---
FORMATO: aberta
ENUNCIADO
[texto completo da questão, exatamente como está no original]

ENUNCIADO_APOIO
[texto de apoio/caso clínico — omita a seção inteira se não houver]

RESPOSTA_MODELO
[resposta esperada/ideal completa — obrigatória; será exibida ao aluno e usada como gabarito da correção por IA]

PONTOS_CHAVE
- [ponto que a resposta do aluno deve cobrir]
- [outro ponto-chave]

CRITERIOS: [rubrica/estilo de correção, ex: resposta curta e objetiva — omita se não houver]
TIPO: [nacional | processual | laboratorio — omita se não souber]
DISCIPLINA: [sigla exata da lista abaixo — omita se não souber]
TEMA: [nome exato de um tema da lista abaixo — omita se não souber]
EXPLICACAO: [explicação complementar, se disponível]
REFERENCIA: [referência bibliográfica — omita se não houver]
FONTE: [ex: Afya P1 2024.1 — omita se não souber]
---

DISCIPLINAS CADASTRADAS:
${listaDisciplinas}

TEMAS CADASTRADOS:
${listaTemas}

REGRAS:
• Copie o enunciado exatamente, sem resumir ou alterar
• Se houver um caso clínico ou texto de apoio antes da pergunta, coloque em ENUNCIADO_APOIO e a pergunta final em ENUNCIADO
• Questão FECHADA: GABARITO deve ser apenas a letra (A, B, C, D ou E); não use FORMATO/RESPOSTA_MODELO/PONTOS_CHAVE
• Questões de verdadeiro/falso: use A) Verdadeiro e B) Falso como alternativas
• Questão ABERTA: comece o bloco com "FORMATO: aberta"; RESPOSTA_MODELO é obrigatória; não use ALTERNATIVAS nem GABARITO
• PONTOS_CHAVE: 2 a 6 itens curtos e verificáveis, um por linha começando com "- "
• TIPO: use "nacional" para provas nacionais, "processual" para simulados por tema, "laboratorio" para questões com imagem de lâmina/peça
• DISCIPLINA, TEMA, TIPO, EXPLICACAO, REFERENCIA e FONTE são campos opcionais
• Se preencher DISCIPLINA ou TEMA, use exatamente uma opção cadastrada nas listas acima
• Em TEMA, escreva apenas o nome do tema; o prefixo [DISCIPLINA] na lista serve só para contexto
• Se não tiver confiança na classificação, omita DISCIPLINA e/ou TEMA em vez de inventar
• Retorne apenas o markdown formatado, sem texto adicional antes ou depois`;
}

export const PROMPT_QUESTOES = montarPromptQuestoes([], []);

export const PROMPT_DISCIPLINAS = `Você vai converter uma lista de disciplinas para importação na plataforma BoraMed. Siga o template exatamente.

FORMATO — separe cada disciplina com ---

---
SIGLA: [sigla curta, ex: SOI I]
NOME: [nome completo, ex: Saúde, Ontogênese e Integração I — opcional]
PERIODO: [número do período, ex: 1]
---

REGRAS:
• SIGLA é obrigatório (texto curto e único, ex: HAM II, IESC III)
• NOME é opcional mas recomendado
• PERIODO é obrigatório — número inteiro entre 1 e 12
• Retorne apenas o markdown formatado, sem texto adicional antes ou depois`;

export const PROMPT_TEMAS = `Você vai converter uma lista de temas para importação na plataforma BoraMed. Siga o template exatamente.

FORMATO — separe cada tema com ---

---
NOME: [nome do tema]
DISCIPLINA: [sigla da disciplina, ex: SOI I — omita se não souber]
PARENT: [nome exato do tema pai, para subtemas — omita se for tema raiz]
---

REGRAS:
• NOME é obrigatório
• DISCIPLINA deve ser uma sigla já cadastrada no sistema
• PARENT é opcional — para subtemas, use o nome exato do tema pai cadastrado
• Ordene temas pais antes dos filhos para importação correta em lote
• Retorne apenas o markdown formatado, sem texto adicional antes ou depois`;

// ──── Parsers ────

export function parseBlocos(
  markdown: string,
  disciplinas: AdminDisciplina[],
  temas: AdminTema[],
): QuestaoParseada[] {
  return markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseQuestaoBloco(b, disciplinas, temas));
}

function parseQuestaoBloco(
  bloco: string,
  disciplinas: AdminDisciplina[],
  temas: AdminTema[],
): QuestaoParseada {
  const erros: string[] = [];
  const linhas = bloco.split('\n');

  type Secao =
    | 'nenhuma'
    | 'enunciado'
    | 'enunciado_apoio'
    | 'alternativas'
    | 'explicacao'
    | 'resposta_modelo'
    | 'pontos_chave';
  let secao: Secao = 'nenhuma';

  const enunciadoLinhas: string[] = [];
  const enunciadoApoioLinhas: string[] = [];
  const alternativaLinhas: string[] = [];
  const respostaModeloLinhas: string[] = [];
  const pontosChave: string[] = [];
  let criterios: string | null = null;
  let formatoDeclarado: string | null = null;
  let gabaritoLetra: string | null = null;
  let tipoQuestao: string | null = null;
  let disciplinaSigla: string | null = null;
  let temaLinha: string | null = null;
  const explicacaoLinhas: string[] = [];
  let referencia: string | null = null;
  let fonte: string | null = null;

  for (const linha of linhas) {
    const t = linha.trim();

    if (t.toUpperCase() === 'ENUNCIADO') { secao = 'enunciado'; continue; }
    if (t.toUpperCase() === 'ENUNCIADO_APOIO') { secao = 'enunciado_apoio'; continue; }
    if (t.toUpperCase() === 'ALTERNATIVAS') { secao = 'alternativas'; continue; }
    if (t.toUpperCase() === 'RESPOSTA_MODELO') { secao = 'resposta_modelo'; continue; }
    if (t.toUpperCase() === 'PONTOS_CHAVE') { secao = 'pontos_chave'; continue; }

    const mFormato = t.match(/^FORMATO:\s*(.+)/i);
    if (mFormato) { formatoDeclarado = mFormato[1].trim().toLowerCase(); secao = 'nenhuma'; continue; }

    const mCriterios = t.match(/^CRITERIOS:\s*(.+)/i);
    if (mCriterios) { criterios = mCriterios[1].trim(); secao = 'nenhuma'; continue; }

    const mGabarito = t.match(/^GABARITO:\s*([A-Ea-e])/i);
    if (mGabarito) { gabaritoLetra = mGabarito[1].toUpperCase(); secao = 'nenhuma'; continue; }

    const mTipo = t.match(/^TIPO:\s*(.+)/i);
    if (mTipo) { tipoQuestao = mTipo[1].trim().toLowerCase(); secao = 'nenhuma'; continue; }

    const mDisciplina = t.match(/^DISCIPLINA:\s*(.+)/i);
    if (mDisciplina) { disciplinaSigla = mDisciplina[1].trim(); secao = 'nenhuma'; continue; }

    const mTema = t.match(/^TEMAS?:\s*(.+)/i);
    if (mTema) { temaLinha = mTema[1].trim(); secao = 'nenhuma'; continue; }

    const mReferencia = t.match(/^REFERENCIA:\s*(.+)/i);
    if (mReferencia) { referencia = mReferencia[1].trim(); secao = 'nenhuma'; continue; }

    const mFonte = t.match(/^FONTE:\s*(.+)/i);
    if (mFonte) { fonte = mFonte[1].trim(); secao = 'nenhuma'; continue; }

    const mExplicacao = t.match(/^EXPLICACAO:\s*(.*)/i);
    if (mExplicacao) {
      secao = 'explicacao';
      if (mExplicacao[1].trim()) explicacaoLinhas.push(mExplicacao[1]);
      continue;
    }

    if (secao === 'enunciado') { enunciadoLinhas.push(linha); continue; }
    if (secao === 'enunciado_apoio') { enunciadoApoioLinhas.push(linha); continue; }
    if (secao === 'alternativas') { alternativaLinhas.push(linha); continue; }
    if (secao === 'resposta_modelo') { respostaModeloLinhas.push(linha); continue; }
    if (secao === 'pontos_chave') {
      const mPonto = t.match(/^[-•*]\s*(.+)/);
      if (mPonto) pontosChave.push(mPonto[1].trim());
      continue;
    }
    if (secao === 'explicacao' && t) { explicacaoLinhas.push(linha); }
  }

  const enunciado = enunciadoLinhas.join('\n').trim();
  const enunciadoApoio = enunciadoApoioLinhas.join('\n').trim() || null;
  if (!enunciado) erros.push('Enunciado ausente');

  const tiposValidos = ['nacional', 'processual', 'laboratorio'];
  const tipoResolvido = tipoQuestao && tiposValidos.includes(tipoQuestao)
    ? tipoQuestao as 'nacional' | 'processual' | 'laboratorio'
    : null;
  if (tipoQuestao && !tipoResolvido) erros.push(`TIPO "${tipoQuestao}" inválido (use: nacional, processual ou laboratorio)`);

  // FORMATO: aberta ⇒ discursiva; qualquer outro valor é erro; ausente ⇒ fechada
  const ehAberta = formatoDeclarado === 'aberta';
  if (formatoDeclarado && !ehAberta && formatoDeclarado !== 'fechada') {
    erros.push(`FORMATO "${formatoDeclarado}" inválido (use: aberta)`);
  }

  const respostaModelo = respostaModeloLinhas.join('\n').trim() || null;

  const alternativas: AlternativaParseada[] = [];
  for (const linha of alternativaLinhas) {
    const m = linha.match(/^([A-Ea-e])\)\s*(.*)/);
    if (m) {
      const texto = m[2].replace('✓', '').trim();
      alternativas.push({ letra: m[1].toUpperCase(), texto, correta: m[2].includes('✓') });
    }
  }

  if (gabaritoLetra) {
    alternativas.forEach((a) => (a.correta = a.letra === gabaritoLetra));
  }

  // Matriz de validação: aberta ⇒ RESPOSTA_MODELO obrigatória, sem
  // ALTERNATIVAS/GABARITO; fechada ⇒ alternativas + gabarito, sem campos abertos.
  if (ehAberta) {
    if (!respostaModelo) erros.push('RESPOSTA_MODELO é obrigatória em questão aberta');
    if (alternativas.length > 0) erros.push('Questão aberta não deve ter ALTERNATIVAS');
    if (gabaritoLetra) erros.push('Questão aberta não deve ter GABARITO');
  } else {
    if (respostaModelo) erros.push('RESPOSTA_MODELO só é válida com FORMATO: aberta');
    if (pontosChave.length > 0) erros.push('PONTOS_CHAVE só é válido com FORMATO: aberta');
    if (alternativas.length < 2) erros.push('Mínimo de 2 alternativas');
    else if (!alternativas.some((a) => a.correta)) erros.push('Gabarito não identificado');
  }

  const isVF =
    alternativas.length === 2 &&
    alternativas.some((a) => /^verdadeiro$/i.test(a.texto)) &&
    alternativas.some((a) => /^falso$/i.test(a.texto));

  const disciplinaObj = disciplinaSigla
    ? (disciplinas.find((d) => d.sigla.toLowerCase() === disciplinaSigla!.toLowerCase()) ?? null)
    : null;

  if (disciplinaSigla && !disciplinaObj) {
    erros.push(`Disciplina "${disciplinaSigla}" não encontrada`);
  }

  const temasResolvidos = resolverTemasQuestao(temaLinha, temas, disciplinaObj?.id ?? null);
  erros.push(...temasResolvidos.erros);

  return {
    enunciado,
    enunciado_apoio: enunciadoApoio,
    alternativas: ehAberta ? [] : alternativas,
    formato: ehAberta ? 'resposta_aberta_curta' : isVF ? 'verdadeiro_falso' : 'multipla_escolha',
    resposta_modelo: ehAberta ? respostaModelo : null,
    pontos_chave: ehAberta ? pontosChave : [],
    criterios_correcao: ehAberta ? criterios : null,
    tipo_questao: tipoResolvido,
    disciplina_id: disciplinaObj?.id ?? null,
    disciplinaDisplay: disciplinaObj?.sigla ?? disciplinaSigla ?? '—',
    tema_ids: temasResolvidos.ids,
    temasDisplay: temasResolvidos.display,
    explicacao: explicacaoLinhas.join('\n').trim() || null,
    referencia,
    fonte,
    valida: erros.length === 0,
    erros,
  };
}

function resolverTemasQuestao(
  temaLinha: string | null,
  temas: AdminTema[],
  disciplinaId: string | null,
): { ids: string[]; display: string; erros: string[] } {
  if (!temaLinha) return { ids: [], display: '—', erros: [] };

  const nomes = temaLinha
    .split(';')
    .map((nome) => nome.trim().replace(/^\[[^\]]+\]\s*/, ''))
    .filter((nome) => nome.length > 0);

  const ids: string[] = [];
  const displays: string[] = [];
  const erros: string[] = [];

  for (const nome of nomes) {
    const candidatos = temas.filter((t) => t.nome.toLowerCase() === nome.toLowerCase());
    const candidatosDaDisciplina = disciplinaId
      ? candidatos.filter((t) => t.disciplina_id === disciplinaId)
      : candidatos;
    const matches = candidatosDaDisciplina.length > 0 ? candidatosDaDisciplina : candidatos;

    if (matches.length === 0) {
      erros.push(`Tema "${nome}" não encontrado`);
      displays.push(nome);
      continue;
    }

    if (matches.length > 1 && !disciplinaId) {
      erros.push(`Tema "${nome}" é ambíguo; informe a disciplina`);
      displays.push(nome);
      continue;
    }

    const tema = matches[0];
    if (!ids.includes(tema.id)) ids.push(tema.id);
    displays.push(tema.nome);
  }

  return { ids, display: displays.length > 0 ? displays.join('; ') : '—', erros };
}

function parseDisciplinasBlocos(markdown: string, existentes: AdminDisciplina[]): DisciplinaParseada[] {
  const parsed = markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseDisciplinaBloco(b, existentes));
  const siglas = parsed
    .map((d) => d.sigla.trim().toLowerCase())
    .filter((sigla) => sigla.length > 0);

  return parsed.map((d) => {
    const duplicadaNoLote = d.sigla.trim()
      ? siglas.filter((sigla) => sigla === d.sigla.trim().toLowerCase()).length > 1
      : false;
    if (!duplicadaNoLote) return d;
    return {
      ...d,
      duplicada: true,
      valida: false,
      erros: d.erros.includes('SIGLA duplicada no lote')
        ? d.erros
        : [...d.erros, 'SIGLA duplicada no lote'],
    };
  });
}

function parseDisciplinaBloco(bloco: string, existentes: AdminDisciplina[]): DisciplinaParseada {
  const erros: string[] = [];
  let sigla = '';
  let nome: string | null = null;
  let periodo: number | null = null;

  for (const linha of bloco.split('\n')) {
    const t = linha.trim();
    const mSigla = t.match(/^SIGLA:\s*(.+)/i);
    if (mSigla) { sigla = mSigla[1].trim(); continue; }
    const mNome = t.match(/^NOME:\s*(.+)/i);
    if (mNome) { nome = mNome[1].trim(); continue; }
    const mPeriodo = t.match(/^PERIODO:\s*(\d+)/i);
    if (mPeriodo) { periodo = parseInt(mPeriodo[1], 10); continue; }
  }

  if (!sigla) erros.push('SIGLA ausente');
  if (periodo === null) erros.push('PERIODO ausente');
  else if (periodo < 1 || periodo > 12) erros.push('PERIODO inválido (1–12)');

  const duplicada = sigla
    ? existentes.some((d) => d.sigla.toLowerCase() === sigla.toLowerCase())
    : false;
  if (duplicada) erros.push('SIGLA jÃ¡ cadastrada');

  return { sigla, nome, periodo, duplicada, valida: erros.length === 0, erros };
}

function parseTemasBlocos(
  markdown: string,
  disciplinas: AdminDisciplina[],
  temasExistentes: AdminTema[],
): TemaParseado[] {
  return markdown
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => parseTemaBloco(b, disciplinas, temasExistentes));
}

function parseTemaBloco(
  bloco: string,
  disciplinas: AdminDisciplina[],
  temasExistentes: AdminTema[],
): TemaParseado {
  const erros: string[] = [];
  let nome = '';
  let disciplinaSigla: string | null = null;
  let parentNome: string | null = null;

  for (const linha of bloco.split('\n')) {
    const t = linha.trim();
    const mNome = t.match(/^NOME:\s*(.+)/i);
    if (mNome) { nome = mNome[1].trim(); continue; }
    const mDisc = t.match(/^DISCIPLINA:\s*(.+)/i);
    if (mDisc) { disciplinaSigla = mDisc[1].trim(); continue; }
    const mParent = t.match(/^PARENT:\s*(.+)/i);
    if (mParent) { parentNome = mParent[1].trim(); continue; }
  }

  if (!nome) erros.push('NOME ausente');

  const disciplinaObj = disciplinaSigla
    ? (disciplinas.find((d) => d.sigla.toLowerCase() === disciplinaSigla!.toLowerCase()) ?? null)
    : null;

  if (disciplinaSigla && !disciplinaObj) erros.push(`Disciplina "${disciplinaSigla}" não encontrada`);

  const parentObj = parentNome
    ? (temasExistentes.find((t) => t.nome.toLowerCase() === parentNome!.toLowerCase()) ?? null)
    : null;

  const parentNaoEncontrado = Boolean(parentNome && !parentObj);

  return {
    nome,
    disciplina_id: disciplinaObj?.id ?? null,
    disciplinaDisplay: disciplinaObj?.sigla ?? disciplinaSigla ?? '—',
    parentNome,
    parent_id: parentObj?.id ?? null,
    parentDisplay: parentObj?.nome ?? parentNome ?? '—',
    parentNaoEncontrado,
    valida: erros.length === 0,
    erros,
  };
}

@Component({
  selector: 'app-admin-importar',
  standalone: true,
  imports: [FormsModule, UiIconComponent, ImagemProtegidaPipe, AsyncPipe],
  templateUrl: './admin-importar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminImportarComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);

  protected readonly iconBot = Bot;
  protected readonly iconPaperclip = Paperclip;
  protected readonly iconArrowRight = ArrowRight;
  protected readonly iconArrowLeft = ArrowLeft;
  protected readonly iconChevronDown = ChevronDown;
  protected readonly iconCheck = Check;
  protected readonly iconX = X;
  protected readonly iconAlertTriangle = AlertTriangle;

  protected readonly etapa = signal<'input' | 'preview' | 'importando' | 'concluido'>('input');
  protected readonly texto = signal('');
  protected readonly tipoImportacao = signal<TipoImportacao>('questoes');

  protected readonly questoes = signal<QuestaoParseada[]>([]);
  protected readonly disciplinasParseadas = signal<DisciplinaParseada[]>([]);
  protected readonly temasParseados = signal<TemaParseado[]>([]);

  protected readonly disciplinas = signal<AdminDisciplina[]>([]);
  protected readonly temasExistentes = signal<AdminTema[]>([]);

  protected readonly promptCopiado = signal(false);
  protected readonly promptAberto = signal(false);
  protected readonly expandido = signal<number | null>(null);

  protected readonly progresso = signal(0);
  protected readonly totalImportar = signal(0);
  protected readonly importados = signal(0);
  protected readonly errosImport = signal(0);

  protected readonly itensParseados = computed<{ valida: boolean }[]>(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return this.questoes();
      case 'disciplinas': return this.disciplinasParseadas();
      case 'temas': return this.temasParseados();
    }
  });

  protected readonly validas = computed(() => this.itensParseados().filter((i) => i.valida).length);
  protected readonly invalidas = computed(() => this.itensParseados().filter((i) => !i.valida).length);

  protected readonly progressoPct = computed(() =>
    this.totalImportar() > 0 ? Math.round((this.progresso() / this.totalImportar()) * 100) : 0,
  );

  protected readonly promptAtual = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return montarPromptQuestoes(this.disciplinas(), this.temasExistentes());
      case 'disciplinas': return PROMPT_DISCIPLINAS;
      case 'temas': return PROMPT_TEMAS;
    }
  });

  protected readonly promptTitulo = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return 'Prompt para converter PDF com IA';
      case 'disciplinas': return 'Prompt para listar disciplinas com IA';
      case 'temas': return 'Prompt para listar temas com IA';
    }
  });

  protected readonly promptSub = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return 'Cole esse prompt no ChatGPT ou Claude, anexe o PDF e cole o resultado abaixo';
      case 'disciplinas': return 'Cole esse prompt no ChatGPT ou Claude, informe as disciplinas e cole o resultado abaixo';
      case 'temas': return 'Cole esse prompt no ChatGPT ou Claude, informe os temas e cole o resultado abaixo';
    }
  });

  protected readonly placeholderTexto = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return `Cole aqui o markdown gerado pela IA...

---
ENUNCIADO
Qual o diagnóstico mais provável para este paciente?

ENUNCIADO_APOIO
Paciente de 45 anos, sexo masculino, dá entrada no PS com dor torácica em repouso há 2 horas, irradiando para membro superior esquerdo, sudorese e náuseas.

ALTERNATIVAS
A) Angina estável
B) Infarto agudo do miocárdio ✓
C) Pericardite
D) Dissecção aórtica
E) TEP

GABARITO: B
TIPO: processual
DISCIPLINA: SOI I
TEMA: Infarto agudo do miocárdio
EXPLICACAO: O infarto agudo se caracteriza por...
REFERENCIA: Harrison, Princípios de Medicina Interna, 21ª ed.
FONTE: Afya P1 2024.1
---`;
      case 'disciplinas': return `Cole aqui o markdown gerado pela IA...

---
SIGLA: SOI I
NOME: Saúde, Ontogênese e Integração I
PERIODO: 1
---
---
SIGLA: HAM II
NOME: Habilidades e Atitudes Médicas II
PERIODO: 2
---`;
      case 'temas': return `Cole aqui o markdown gerado pela IA...

---
NOME: Semiologia Cardiovascular
DISCIPLINA: SOI I
---
---
NOME: Ausculta Cardíaca
DISCIPLINA: SOI I
PARENT: Semiologia Cardiovascular
---`;
    }
  });

  protected readonly labelImportar = computed(() => {
    const n = this.validas();
    switch (this.tipoImportacao()) {
      case 'questoes': return `Importar ${n} ${n !== 1 ? 'questões' : 'questão'}`;
      case 'disciplinas': return `Importar ${n} disciplina${n !== 1 ? 's' : ''}`;
      case 'temas': return `Importar ${n} tema${n !== 1 ? 's' : ''}`;
    }
  });

  protected readonly doneHint = computed(() => {
    switch (this.tipoImportacao()) {
      case 'questoes': return 'As questões foram importadas e já estão ativas.';
      case 'disciplinas': return 'As disciplinas foram criadas e já estão disponíveis para uso nas questões e temas.';
      case 'temas': return 'Os temas foram criados e já estão disponíveis para uso nas questões.';
    }
  });

  async ngOnInit(): Promise<void> {
    const [disciplinasRes, temasRes] = await Promise.all([
      this.adminService.listarDisciplinas(),
      this.adminService.listarTemas(),
    ]);
    if (disciplinasRes.ok) this.disciplinas.set(disciplinasRes.data);
    if (temasRes.ok) this.temasExistentes.set(temasRes.data);
  }

  protected setTipo(tipo: TipoImportacao): void {
    if (this.tipoImportacao() === tipo) return;
    this.tipoImportacao.set(tipo);
    this.texto.set('');
    this.questoes.set([]);
    this.disciplinasParseadas.set([]);
    this.temasParseados.set([]);
    this.etapa.set('input');
    this.expandido.set(null);
    this.promptAberto.set(false);
  }

  protected processar(): void {
    const t = this.texto().trim();
    if (!t) { this.toast.error('Cole o conteúdo ou carregue um arquivo.'); return; }

    switch (this.tipoImportacao()) {
      case 'questoes': {
        const parsed = parseBlocos(t, this.disciplinas(), this.temasExistentes());
        if (parsed.length === 0) { this.toast.error('Nenhuma questão encontrada. Verifique o formato.'); return; }
        this.questoes.set(parsed);
        break;
      }
      case 'disciplinas': {
        const parsed = parseDisciplinasBlocos(t, this.disciplinas());
        if (parsed.length === 0) { this.toast.error('Nenhuma disciplina encontrada. Verifique o formato.'); return; }
        this.disciplinasParseadas.set(parsed);
        break;
      }
      case 'temas': {
        const parsed = parseTemasBlocos(t, this.disciplinas(), this.temasExistentes());
        if (parsed.length === 0) { this.toast.error('Nenhum tema encontrado. Verifique o formato.'); return; }
        this.temasParseados.set(parsed);
        break;
      }
    }

    this.etapa.set('preview');
  }

  protected onArquivo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.texto.set((e.target?.result as string) ?? '');
    reader.readAsText(file, 'UTF-8');
  }

  protected toggleExpand(i: number): void {
    this.expandido.update((v) => (v === i ? null : i));
  }

  protected voltar(): void {
    this.etapa.set('input');
    this.expandido.set(null);
  }

  protected async importar(): Promise<void> {
    switch (this.tipoImportacao()) {
      case 'questoes': return this.importarQuestoes();
      case 'disciplinas': return this.importarDisciplinas();
      case 'temas': return this.importarTemas();
    }
  }

  private async importarQuestoes(): Promise<void> {
    const validas = this.questoes().filter((q) => q.valida);
    if (validas.length === 0) return;

    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImport.set(0);
    this.etapa.set('importando');

    for (const q of validas) {
      const payload: QuestaoPayload = {
        enunciado: q.enunciado,
        enunciado_apoio: q.enunciado_apoio,
        formato: q.formato,
        tipo_questao: q.tipo_questao ?? undefined,
        status: 'ativa',
        disciplina_id: q.disciplina_id,
        explicacao: q.explicacao,
        referencia: q.referencia,
        fonte: q.fonte,
        resposta_modelo: q.resposta_modelo,
        pontos_chave: q.pontos_chave,
        criterios_correcao: q.criterios_correcao,
        origem_geracao: 'ia_assistida',
      };
      const alternativas: AlternativaPayload[] = q.alternativas.map((a, i) => ({
        letra: a.letra,
        texto: a.texto,
        correta: a.correta,
        ordem: i + 1,
      }));

      const res = await this.adminService.criarQuestaoCompleta(payload, alternativas, q.tema_ids);
      if (res.ok) this.importados.update((n) => n + 1);
      else this.errosImport.update((n) => n + 1);
      this.progresso.update((n) => n + 1);
    }

    this.etapa.set('concluido');
  }

  private async importarDisciplinas(): Promise<void> {
    const validas = this.disciplinasParseadas().filter((d) => d.valida);
    if (validas.length === 0) return;

    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImport.set(0);
    this.etapa.set('importando');

    for (const d of validas) {
      const res = await this.adminService.criarDisciplina({
        sigla: d.sigla,
        nome: d.nome,
        periodo: d.periodo!,
      });
      if (res.ok) {
        this.importados.update((n) => n + 1);
        this.disciplinas.update((list) => [...list, res.data]);
      } else {
        this.errosImport.update((n) => n + 1);
      }
      this.progresso.update((n) => n + 1);
    }

    this.etapa.set('concluido');
  }

  private async importarTemas(): Promise<void> {
    const validas = this.temasParseados().filter((t) => t.valida);
    if (validas.length === 0) return;

    this.totalImportar.set(validas.length);
    this.progresso.set(0);
    this.importados.set(0);
    this.errosImport.set(0);
    this.etapa.set('importando');

    for (const t of validas) {
      // Re-resolve parent at import time to support parent-in-same-batch
      let parentId = t.parent_id;
      if (t.parentNome && !parentId) {
        const found = this.temasExistentes().find(
          (e) => e.nome.toLowerCase() === t.parentNome!.toLowerCase(),
        );
        if (found) parentId = found.id;
      }

      const res = await this.adminService.criarTema({
        nome: t.nome,
        disciplina_id: t.disciplina_id,
        parent_id: parentId,
        tipos_prova: null,
      });
      if (res.ok) {
        this.importados.update((n) => n + 1);
        this.temasExistentes.update((list) => [...list, res.data]);
      } else {
        this.errosImport.update((n) => n + 1);
      }
      this.progresso.update((n) => n + 1);
    }

    this.etapa.set('concluido');
  }

  protected novaImportacao(): void {
    this.texto.set('');
    this.questoes.set([]);
    this.disciplinasParseadas.set([]);
    this.temasParseados.set([]);
    this.expandido.set(null);
    this.etapa.set('input');
  }

  protected async copiarPrompt(): Promise<void> {
    await navigator.clipboard.writeText(this.promptAtual());
    this.promptCopiado.set(true);
    setTimeout(() => this.promptCopiado.set(false), 2000);
  }

  protected enunciadoCurto(texto: string): string {
    return texto.length > 120 ? texto.slice(0, 120) + '…' : texto;
  }

  protected gabaritoLabel(q: QuestaoParseada): string {
    if (q.formato === 'resposta_aberta_curta') {
      return q.resposta_modelo ? 'Modelo' : '—';
    }
    return q.alternativas.find((a) => a.correta)?.letra ?? '—';
  }
}
