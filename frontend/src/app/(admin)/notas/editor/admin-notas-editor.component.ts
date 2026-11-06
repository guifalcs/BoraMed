import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Plus,
  Save,
  Scissors,
  Send,
  Trash2,
  Undo2,
} from 'lucide-angular';
import { NotasService } from '../../../core/services/notas.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PERIODO_OPTIONS } from '../../../core/models/periodo';
import {
  NOME_PADRAO_DIMENSAO,
  type AdminNotasRegulamento,
  type NotasRegulamentoPayload,
  type StatusRegulamento,
  type TipoDimensao,
} from '../../../core/models/notas';
import { fmtPts, r2 } from '../../../core/utils/notas-calculo.util';
import type { SaidaProtegida } from '../../../core/guards/sair-sem-salvar.guard';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { UiConfirmDialogComponent } from '../../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';

// ─── Rascunho local (mutável; `tocar()` avisa o template) ────────────────────
interface DParte { k: string; id?: string; nome: string; pontos: number | null; descricao: string }
interface DItem extends DParte { partes: DParte[] }
interface DDim { k: string; id?: string; tipo: TipoDimensao; nome: string; itens: DItem[] }
type ModoEixo = 'dupla' | 'unica';
interface DEixo {
  k: string;
  id?: string;
  sigla: string;
  nome: string;
  exame_especial: boolean;
  dims: DDim[];
  /** Dimensões da outra estrutura, guardadas ao alternar dupla ⇄ única. */
  guardadas: DDim[];
}
interface Rascunho {
  id?: string;
  periodo: number | null;
  semestre: string;
  titulo: string;
  fonte: string;
  nota_minima: number | null;
  nota_minima_exame: number | null;
  frequencia_minima: number | null;
  observacao: string;
  eixos: DEixo[];
}

interface Problema {
  grave: boolean;
  texto: string;
  /** Âncora do card onde está o problema. */
  alvo: string;
}

interface RemocaoPendente {
  titulo: string;
  mensagem: string;
  executar: () => void;
}

let seq = 0;
const chave = (): string => `k${++seq}`;

const COGNITIVA_PADRAO: [string, number, string][] = [
  ['Prova N1', 20, ''],
  ['TPI', 30, 'Teste de Progresso Institucional'],
  ['Prova N2', 35, ''],
  ['Prova N3', 15, ''],
];

function novoItem(nome = '', pontos: number | null = null, descricao = ''): DItem {
  return { k: chave(), nome, pontos, descricao, partes: [] };
}

function novaDim(tipo: TipoDimensao): DDim {
  const itens =
    tipo === 'cognitiva' ? COGNITIVA_PADRAO.map(([n, p, d]) => novoItem(n, p, d)) : [novoItem('Memorial Acadêmico', 5)];
  return { k: chave(), tipo, nome: NOME_PADRAO_DIMENSAO[tipo], itens };
}

function novoEixo(): DEixo {
  return {
    k: chave(),
    sigla: '',
    nome: '',
    exame_especial: true,
    dims: [novaDim('cognitiva'), novaDim('habilidades')],
    guardadas: [],
  };
}

function semestreAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}.${hoje.getMonth() < 6 ? 1 : 2}`;
}

function texto(v: string | null | undefined): string {
  return v ?? '';
}

function deRegulamento(reg: AdminNotasRegulamento, copiar: boolean): Rascunho {
  // Ao duplicar, nada leva id: tudo nasce de novo no regulamento novo.
  const id = (v: string): string | undefined => (copiar ? undefined : v);
  return {
    id: id(reg.id),
    periodo: reg.periodo,
    semestre: copiar ? semestreAtual() : reg.semestre,
    titulo: copiar ? '' : texto(reg.titulo),
    fonte: texto(reg.fonte),
    nota_minima: Number(reg.nota_minima),
    nota_minima_exame: Number(reg.nota_minima_exame),
    frequencia_minima: reg.frequencia_minima,
    observacao: texto(reg.observacao),
    eixos: reg.eixos.map((e) => ({
      k: chave(),
      id: id(e.id),
      sigla: e.sigla,
      nome: e.nome,
      exame_especial: e.exame_especial,
      guardadas: [],
      dims: e.dimensoes.map((d) => ({
        k: chave(),
        id: id(d.id),
        tipo: d.tipo,
        nome: d.nome,
        itens: d.itens.map((i) => ({
          k: chave(),
          id: id(i.id),
          nome: i.nome,
          pontos: Number(i.pontos),
          descricao: texto(i.descricao),
          partes: i.subitens.map((s) => ({
            k: chave(),
            id: id(s.id),
            nome: s.nome,
            pontos: Number(s.pontos),
            descricao: texto(s.descricao),
          })),
        })),
      })),
    })),
  };
}

const ROTULO_TIPO: Record<TipoDimensao, string> = {
  cognitiva: 'Cognitiva (teoria)',
  habilidades: 'Habilidades e Atitudes (prática)',
  unica: 'Dimensão única',
};

@Component({
  selector: 'app-admin-notas-editor',
  standalone: true,
  imports: [RouterLink, UiIconComponent, UiConfirmDialogComponent],
  templateUrl: './admin-notas-editor.component.html',
  styleUrls: ['../admin-notas.css', './admin-notas-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotasEditorComponent implements OnInit, SaidaProtegida {
  private readonly service = inject(NotasService);
  private readonly toast = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly sujo = signal(false);
  protected readonly status = signal<StatusRegulamento>('rascunho');
  protected readonly lancamentosPorItem = signal<Record<string, number>>({});
  protected readonly remocao = signal<RemocaoPendente | null>(null);
  protected readonly copiadoDe = signal<string | null>(null);

  /** O objeto é mutado no lugar; trocar a referência re-renderiza o template. */
  protected readonly rascunho = signal<Rascunho>(this.vazio());

  protected readonly periodoOptions = PERIODO_OPTIONS;
  protected readonly rotuloTipo = ROTULO_TIPO;
  protected readonly fmtPts = fmtPts;

  protected readonly iconVoltar = ArrowLeft;
  protected readonly iconSalvar = Save;
  protected readonly iconPublicar = Send;
  protected readonly iconDespublicar = Undo2;
  protected readonly iconMais = Plus;
  protected readonly iconLixo = Trash2;
  protected readonly iconCima = ArrowUp;
  protected readonly iconBaixo = ArrowDown;
  protected readonly iconDividir = Scissors;
  protected readonly iconOk = CheckCircle2;
  protected readonly iconAlerta = AlertTriangle;

  protected readonly titulo = computed(() => {
    const r = this.rascunho();
    if (r.titulo.trim()) return r.titulo.trim();
    return r.periodo ? `${r.periodo}º período · ${r.semestre || '—'}` : 'Novo regulamento';
  });

  protected readonly problemas = computed<Problema[]>(() => {
    const r = this.rascunho();
    const lista: Problema[] = [];
    const grave = (texto: string, alvo: string) => lista.push({ grave: true, texto, alvo });
    const aviso = (texto: string, alvo: string) => lista.push({ grave: false, texto, alvo });

    if (!r.periodo) grave('Escolha o período.', 'cabecalho');
    if (!/^\d{4}\.[12]$/.test(r.semestre.trim())) grave('Semestre no formato 2026.2.', 'cabecalho');
    const min = r.nota_minima ?? 0;
    const exame = r.nota_minima_exame ?? 0;
    if (min <= 0 || min > 100) grave('Nota mínima entre 1% e 100%.', 'cabecalho');
    if (exame < 0 || exame > min) grave('O piso do exame não pode passar da nota mínima.', 'cabecalho');
    if (r.eixos.length === 0) grave('Cadastre ao menos um eixo.', 'eixos');

    const siglas = new Set<string>();
    for (const e of r.eixos) {
      const nomeEixo = e.sigla.trim() || 'Eixo sem sigla';
      const alvo = `eixo-${e.k}`;
      if (!e.sigla.trim() || !e.nome.trim()) grave(`${nomeEixo}: preencha sigla e nome.`, alvo);
      const s = e.sigla.trim().toLowerCase();
      if (s && siglas.has(s)) aviso(`${nomeEixo}: sigla repetida.`, alvo);
      siglas.add(s);
      for (const d of e.dims) {
        const ctx = `${nomeEixo} · ${d.tipo === 'unica' ? 'única' : d.tipo}`;
        if (d.itens.length === 0) grave(`${ctx}: sem itens.`, alvo);
        for (const i of d.itens) {
          if (!i.nome.trim() || !i.pontos || i.pontos <= 0 || i.pontos > 100) {
            grave(`${ctx}: item sem nome ou com pontos inválidos.`, alvo);
          }
          if (i.partes.length === 1) grave(`${ctx} · ${i.nome || 'item'}: uma parte só não divide nada.`, alvo);
          if (i.partes.length > 1) {
            if (i.partes.some((p) => !p.nome.trim() || !p.pontos || p.pontos <= 0)) {
              grave(`${ctx} · ${i.nome || 'item'}: parte sem nome ou pontos.`, alvo);
            }
            const soma = this.somaPartes(i);
            if (Math.abs(soma - (i.pontos ?? 0)) > 0.009) {
              grave(`${ctx} · ${i.nome || 'item'}: partes somam ${fmtPts(soma)}, item vale ${fmtPts(i.pontos ?? 0)}.`, alvo);
            }
          }
        }
        const total = this.totalDim(d);
        if (d.itens.length && Math.abs(total - 100) > 0.009) aviso(`${ctx}: soma ${fmtPts(total)} pontos (o comum é 100).`, alvo);
      }
    }
    return lista;
  });

  protected readonly graves = computed(() => this.problemas().filter((p) => p.grave));

  ngOnInit(): void {
    // A rota é reaproveitada entre /novo e /:id (e no voltar/avançar entre
    // regulamentos): reage a cada troca, menos à que o próprio save provoca.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      const copiar = this.route.snapshot.queryParamMap.get('copiar');
      if (id && id !== 'novo') {
        if (id !== this.rascunho().id) void this.carregar(id, false);
      } else if (copiar) {
        void this.carregar(copiar, true);
      } else {
        this.rascunho.set(this.vazio());
        this.status.set('rascunho');
        this.lancamentosPorItem.set({});
        this.sujo.set(false);
        this.carregando.set(false);
      }
    });
  }

  private vazio(): Rascunho {
    return {
      periodo: null,
      semestre: semestreAtual(),
      titulo: '',
      fonte: `Regulamento do sistema de avaliação ${semestreAtual()}`,
      nota_minima: 70,
      nota_minima_exame: 40,
      frequencia_minima: 75,
      observacao: '',
      eixos: [novoEixo()],
    };
  }

  private async carregar(id: string, copiar: boolean): Promise<void> {
    this.carregando.set(true);
    const r = await this.service.adminObter(id);
    this.carregando.set(false);
    if (!r.ok) {
      this.toast.error(r.error);
      void this.router.navigate(['/admin/notas']);
      return;
    }
    this.rascunho.set(deRegulamento(r.data, copiar));
    if (copiar) {
      this.copiadoDe.set(`${r.data.periodo}º período · ${r.data.semestre}`);
      this.sujo.set(true);
    } else {
      this.copiadoDe.set(null);
      this.status.set(r.data.status);
      this.lancamentosPorItem.set(r.data.lancamentos_por_item ?? {});
    }
  }

  // ─── Edição ────────────────────────────────────────────────────────────────

  protected tocar(): void {
    this.rascunho.set({ ...this.rascunho() });
    this.sujo.set(true);
  }

  protected numero(valor: string): number | null {
    const t = valor.trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? r2(n) : null;
  }

  protected definir<T extends object, K extends keyof T>(alvo: T, campo: K, valor: T[K]): void {
    alvo[campo] = valor;
    this.tocar();
  }

  protected modo(e: DEixo): ModoEixo {
    return e.dims.length === 1 && e.dims[0].tipo === 'unica' ? 'unica' : 'dupla';
  }

  protected alternarModo(e: DEixo, modo: ModoEixo): void {
    if (this.modo(e) === modo) return;
    const ids = e.dims.flatMap((d) => d.itens.flatMap((it) => this.idsItem(it)));
    const titulo = modo === 'unica' ? `Transformar ${e.sigla || 'o eixo'} em dimensão única?` : `Separar ${e.sigla || 'o eixo'} em teoria e prática?`;
    this.confirmarRemocao(titulo, this.notasEm(ids), () => {
      const atuais = e.dims;
      e.dims = e.guardadas.length ? e.guardadas : modo === 'unica' ? [novaDim('unica')] : [novaDim('cognitiva'), novaDim('habilidades')];
      e.guardadas = atuais;
      if (modo === 'unica') e.exame_especial = false;
      this.tocar();
    });
  }

  protected temCognitiva(e: DEixo): boolean {
    return e.dims.some((d) => d.tipo === 'cognitiva');
  }

  protected adicionarEixo(): void {
    const r = this.rascunho();
    const e = novoEixo();
    r.eixos.push(e);
    this.tocar();
    requestAnimationFrame(() => document.getElementById(`eixo-${e.k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected mover<T>(lista: T[], i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    this.tocar();
  }

  protected adicionarItem(d: DDim): void {
    d.itens.push(novoItem());
    this.tocar();
  }

  protected dividir(i: DItem): void {
    // Item dividido deixa de receber nota (ela vai nas partes): a nota que
    // os alunos já lançaram nele sai ao salvar.
    this.confirmarRemocao(`Dividir ${i.nome || 'este item'} em partes?`, this.notasEm([i.id]), () => {
      const metade = i.pontos ? r2(i.pontos / 2) : null;
      i.partes = [
        { k: chave(), nome: '1ª parte', pontos: metade, descricao: '' },
        { k: chave(), nome: '2ª parte', pontos: i.pontos && metade !== null ? r2(i.pontos - metade) : null, descricao: '' },
      ];
      this.tocar();
    });
  }

  protected adicionarParte(i: DItem): void {
    i.partes.push({ k: chave(), nome: `${i.partes.length + 1}ª parte`, pontos: null, descricao: '' });
    this.tocar();
  }

  /** Quantos alunos têm nota em algo que será removido. */
  private notasEm(ids: (string | undefined)[]): number {
    const mapa = this.lancamentosPorItem();
    return ids.reduce((s, id) => s + (id ? (mapa[id] ?? 0) : 0), 0);
  }

  private idsItem(i: DItem): (string | undefined)[] {
    return [i.id, ...i.partes.map((p) => p.id)];
  }

  protected notasNoItem(i: DItem | DParte): number {
    return this.notasEm('partes' in i ? this.idsItem(i) : [i.id]);
  }

  private confirmarRemocao(titulo: string, notas: number, executar: () => void): void {
    if (notas === 0) {
      executar();
      return;
    }
    this.remocao.set({
      titulo,
      mensagem: `${notas === 1 ? 'Há 1 nota de aluno lançada' : `Há ${notas} notas de alunos lançadas`} aqui. Ao salvar, ${notas === 1 ? 'ela será apagada' : 'elas serão apagadas'}.`,
      executar,
    });
  }

  protected removerEixo(i: number): void {
    const r = this.rascunho();
    const e = r.eixos[i];
    const ids = e.dims.flatMap((d) => d.itens.flatMap((it) => this.idsItem(it)));
    this.confirmarRemocao(`Remover ${e.sigla || 'este eixo'}?`, this.notasEm(ids), () => {
      r.eixos.splice(i, 1);
      this.tocar();
    });
  }

  protected removerItem(d: DDim, idx: number): void {
    const item = d.itens[idx];
    this.confirmarRemocao(`Remover ${item.nome || 'este item'}?`, this.notasEm(this.idsItem(item)), () => {
      d.itens.splice(idx, 1);
      this.tocar();
    });
  }

  protected removerParte(i: DItem, idx: number): void {
    const parte = i.partes[idx];
    // Com 2 partes, remover uma desfaz a divisão (item volta a ser folha).
    const remover = i.partes.length <= 2 ? i.partes : [parte];
    const titulo = i.partes.length <= 2 ? `Desfazer a divisão de ${i.nome || 'item'}?` : `Remover ${parte.nome || 'esta parte'}?`;
    this.confirmarRemocao(titulo, this.notasEm(remover.map((p) => p.id)), () => {
      if (i.partes.length <= 2) i.partes = [];
      else i.partes.splice(idx, 1);
      this.tocar();
    });
  }

  protected executarRemocao(): void {
    const r = this.remocao();
    this.remocao.set(null);
    r?.executar();
  }

  // ─── Somas ─────────────────────────────────────────────────────────────────

  protected totalDim(d: DDim): number {
    return r2(d.itens.reduce((s, i) => s + (i.pontos ?? 0), 0));
  }

  protected somaPartes(i: DItem): number {
    return r2(i.partes.reduce((s, p) => s + (p.pontos ?? 0), 0));
  }

  protected irPara(alvo: string): void {
    document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Persistência ──────────────────────────────────────────────────────────

  private payload(): NotasRegulamentoPayload {
    const r = this.rascunho();
    const nulo = (v: string) => (v.trim() ? v.trim() : null);
    return {
      id: r.id,
      periodo: r.periodo ?? 0,
      semestre: r.semestre.trim(),
      titulo: nulo(r.titulo),
      fonte: nulo(r.fonte),
      nota_minima: r.nota_minima ?? 70,
      nota_minima_exame: r.nota_minima_exame ?? 40,
      frequencia_minima: r.frequencia_minima ?? 75,
      observacao: nulo(r.observacao),
      eixos: r.eixos.map((e) => ({
        id: e.id,
        sigla: e.sigla.trim(),
        nome: e.nome.trim(),
        exame_especial: e.exame_especial && this.temCognitiva(e),
        dimensoes: e.dims.map((d) => ({
          id: d.id,
          tipo: d.tipo,
          nome: d.nome.trim() || NOME_PADRAO_DIMENSAO[d.tipo],
          itens: d.itens.map((i) => ({
            id: i.id,
            nome: i.nome.trim(),
            pontos: i.pontos ?? 0,
            descricao: nulo(i.descricao),
            subitens: i.partes.map((p) => ({ id: p.id, nome: p.nome.trim(), pontos: p.pontos ?? 0, descricao: nulo(p.descricao) })),
          })),
        })),
      })),
    };
  }

  protected async salvar(silencioso = false): Promise<boolean> {
    if (this.graves().length) {
      this.toast.error(this.graves()[0].texto);
      this.irPara(this.graves()[0].alvo);
      return false;
    }
    this.salvando.set(true);
    const res = await this.service.adminSalvar(this.payload());
    this.salvando.set(false);
    if (!res.ok) {
      this.toast.error(res.error);
      return false;
    }
    const novo = !this.rascunho().id;
    this.sujo.set(false);
    if (res.data.lancamentos_removidos || !silencioso) this.toast.success(
      res.data.lancamentos_removidos
        ? `Salvo. ${res.data.lancamentos_removidos} nota(s) de aluno em itens removidos foram apagadas.`
        : 'Regulamento salvo.',
    );
    if (novo) {
      // Marca o id antes de navegar: o paramMap vê o mesmo id e não recarrega duas vezes.
      this.rascunho().id = res.data.id;
      await this.router.navigate(['/admin/notas', res.data.id], { replaceUrl: true });
    }
    // Recarrega para pegar os ids gerados (itens novos) e a contagem de notas.
    await this.carregar(res.data.id, false);
    return true;
  }

  protected async publicar(publicar: boolean): Promise<void> {
    if (this.sujo() && !(await this.salvar(true))) return;
    const id = this.rascunho().id;
    if (!id) return;
    this.salvando.set(true);
    const res = await this.service.adminPublicar(id, publicar, publicar);
    this.salvando.set(false);
    if (!res.ok) {
      this.toast.error(res.error);
      return;
    }
    this.status.set(res.data.status);
    if (publicar) {
      const partes = [`No ar para o ${this.rascunho().periodo}º período.`];
      if (res.data.arquivado_id) partes.push('O regulamento anterior foi arquivado.');
      if (res.data.notificados) partes.push(`${res.data.notificados} aluno(s) avisados no sino.`);
      this.toast.success(partes.join(' '));
    } else {
      this.toast.success('Saiu do ar.');
    }
  }

  /** Consultado pelo guard de saída da rota. */
  podeSair(): boolean {
    return !this.sujo() || confirm('Há alterações não salvas neste regulamento. Sair mesmo assim?');
  }

  @HostListener('window:beforeunload', ['$event'])
  protected avisarSaida(ev: BeforeUnloadEvent): void {
    if (this.sujo()) ev.preventDefault();
  }
}
