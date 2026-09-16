import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  CORES_PADRAO,
  aplicarGrifo,
  apagarTrecho,
  desserializarGrifos,
  ehCorGrifo,
  normalizarCor,
  serializarGrifos,
  type BlocoGrifo,
  type CorGrifo,
  type FerramentaGrifo,
  type Grifo,
} from '../../shared/utils/grifo';

/** Uma chave por tentativa. */
const GRIFOS_KEY_PREFIX = 'bm_grifos_';

/** Preferências da paleta: valem para o aluno, não para uma tentativa. */
const PALETA_KEY = 'bm_grifo_paleta';

/** Quantas cores fora dos atalhos ficam à mão depois de escolhidas. */
export const MAX_CORES_RECENTES = 4;

/** Payload de tentativa antiga é lixo: some sozinho depois disso. */
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Marca-texto da prova.
 *
 * Igual ao risco de alternativa (`bm_eliminadas_`), grifo é apoio de raciocínio
 * do aluno: fica no navegador, nunca vai para o banco, não entra em métrica,
 * resultado ou estatística de questão. A diferença é o `localStorage` em vez do
 * `sessionStorage` — a tentativa pode ser pausada e retomada dias depois, e
 * perder a leitura grifada de uma prova inteira ao fechar a aba doeria.
 *
 * Finalizar a prova NÃO apaga os grifos: eles seguem para a revisão, onde o
 * aluno vê o que marcou e pode apagar. Quem recolhe o lixo é a varredura de
 * 30 dias em `limparExpirados`.
 */
@Injectable({ providedIn: 'root' })
export class GrifoService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Marca-texto na mão: enquanto ativo, selecionar texto grifa. */
  readonly modoAtivo = signal(false);

  /**
   * Onde o estojo está sendo usado. Na revisão ele só apaga — grifar ali
   * misturaria o que foi marcado sob o relógio com o que foi marcado depois,
   * lendo o gabarito — e o "limpar" vale para a prova inteira, que é o que
   * está na página.
   */
  readonly escopo = signal<'execucao' | 'revisao'>('execucao');
  readonly ferramenta = signal<FerramentaGrifo>(CORES_PADRAO[0]);

  private readonly _grifos = signal<ReadonlyMap<string, readonly Grifo[]>>(new Map());
  readonly grifos = this._grifos.asReadonly();

  /** Última cor usada: a borracha não substitui a cor, só a empresta. */
  private ultimaCor: CorGrifo = CORES_PADRAO[0];

  /**
   * Cores escolhidas no espectro, da mais recente para a mais antiga. Os
   * atalhos da paleta não entram: eles já estão sempre na tela.
   */
  private readonly _recentes = signal<readonly CorGrifo[]>([]);
  readonly recentes = this._recentes.asReadonly();

  private tentativaId: string | null = null;

  /**
   * Existe tentativa aberta? O `questao-card` também renderiza no admin de
   * questões e no gabarito público (`/visualizar`), onde não há o que grifar:
   * sem esta trava o atalho ligaria o marca-texto numa tela sem estojo, para
   * pintar algo que não seria salvo em lugar nenhum.
   */
  readonly temTentativa = signal(false);

  readonly borrachaAtiva = computed(() => this.ferramenta() === 'borracha');
  readonly totalGrifos = computed(() => {
    let total = 0;
    for (const lista of this._grifos().values()) total += lista.length;
    return total;
  });

  grifosDaQuestao(questaoId: string): readonly Grifo[] {
    return this._grifos().get(questaoId) ?? [];
  }

  /** Abre o marca-texto de uma tentativa e restaura o que já foi grifado. */
  iniciar(tentativaId: string, escopo: 'execucao' | 'revisao' = 'execucao'): void {
    this.tentativaId = tentativaId;
    this.temTentativa.set(true);
    this.escopo.set(escopo);
    this.modoAtivo.set(false);
    if (escopo === 'revisao') this.ferramenta.set('borracha');
    this._grifos.set(this.ler(tentativaId));
    this.lerPaleta();
    this.limparExpirados();
  }

  /**
   * "Pegar o marca-texto" — o atalho `G` e o botão principal do estojo.
   *
   * Com a borracha na mão, isto **devolve a caneta** na última cor em vez de
   * guardar tudo: quem pede o marca-texto quer grifar, e obrigá-lo a clicar
   * numa cor depois seria o passo que o atalho deveria ter economizado.
   * Na revisão não existe caneta, então vira o liga/desliga da borracha.
   */
  alternarCaneta(): void {
    if (this.escopo() === 'revisao') {
      this.alternarBorracha();
      return;
    }
    if (this.modoAtivo() && !this.borrachaAtiva()) {
      this.modoAtivo.set(false);
      return;
    }
    this.selecionarFerramenta(this.corAtual());
  }

  /** Espelho do anterior para a borracha (`Shift + G`). */
  alternarBorracha(): void {
    if (this.modoAtivo() && this.borrachaAtiva()) {
      this.modoAtivo.set(false);
      return;
    }
    this.selecionarFerramenta('borracha');
  }

  selecionarFerramenta(ferramenta: FerramentaGrifo): void {
    if (ferramenta !== 'borracha') {
      this.ultimaCor = ferramenta;
      this.registrarRecente(ferramenta);
      this.salvarPaleta();
    }
    this.ferramenta.set(ferramenta);
    // Escolher uma cor é a forma mais natural de pegar o marca-texto.
    this.modoAtivo.set(true);
  }

  /** Cor vinda do seletor de espectro. Ignora o que não for cor de verdade. */
  selecionarCorLivre(valor: string): void {
    const cor = normalizarCor(valor);
    if (cor) this.selecionarFerramenta(cor);
  }

  /**
   * Guarda a cor escolhida no espectro para ela ficar a um clique na próxima
   * questão — reabrir o seletor do sistema a cada troca seria trabalhoso. Os
   * atalhos fixos não entram na lista: já estão sempre na tela.
   */
  private registrarRecente(cor: CorGrifo): void {
    if ((CORES_PADRAO as readonly string[]).includes(cor)) return;
    this._recentes.update((lista) =>
      [cor, ...lista.filter((c) => c !== cor)].slice(0, MAX_CORES_RECENTES),
    );
  }

  /** Cor que a paleta mostra como "a sua", mesmo com a borracha na mão. */
  corAtual(): CorGrifo {
    const f = this.ferramenta();
    return f === 'borracha' ? this.ultimaCor : f;
  }

  /**
   * `corForcada` existe para o atalho de teclado, que pinta um trecho sem
   * mexer na ferramenta que está na mão.
   */
  grifar(
    questaoId: string,
    bloco: BlocoGrifo,
    inicio: number,
    fim: number,
    corForcada: FerramentaGrifo | null = null,
  ): void {
    const cor = corForcada ?? this.ferramenta();
    if (cor === 'borracha') {
      this.apagar(questaoId, bloco, inicio, fim);
      return;
    }
    this.atualizarQuestao(questaoId, (atuais) =>
      aplicarGrifo(atuais, { bloco, inicio, fim, cor }),
    );
  }

  apagar(questaoId: string, bloco: BlocoGrifo, inicio: number, fim: number): void {
    this.atualizarQuestao(questaoId, (atuais) => apagarTrecho(atuais, bloco, inicio, fim));
  }

  limparQuestao(questaoId: string): void {
    this.atualizarQuestao(questaoId, () => []);
  }

  /**
   * Apaga os grifos da tentativa inteira. É o escopo da revisão, que mostra a
   * prova toda numa página só — ali "limpar uma questão" seria uma ação
   * destrutiva com alvo invisível.
   */
  limparTudo(): void {
    this._grifos.set(new Map());
    this.salvar();
    this.guardarSeNaoSobrouNada();
  }

  /** Sai da tela mantendo o que foi grifado (tentativa pausada ou revisada). */
  encerrar(): void {
    this.modoAtivo.set(false);
    this.escopo.set('execucao');
    this.tentativaId = null;
    this.temTentativa.set(false);
    this._grifos.set(new Map());
  }

  private atualizarQuestao(
    questaoId: string,
    transformar: (atuais: readonly Grifo[]) => Grifo[],
  ): void {
    this._grifos.update((mapa) => {
      const proximos = transformar(mapa.get(questaoId) ?? []);
      const novo = new Map(mapa);
      if (proximos.length > 0) novo.set(questaoId, proximos);
      else novo.delete(questaoId);
      return novo;
    });
    this.salvar();
    this.guardarSeNaoSobrouNada();
  }

  /**
   * Na revisão o estojo só existe enquanto há grifo — é uma borracha, e sem
   * nada para apagar ela some da tela. Se a ferramenta continuasse na mão, o
   * cursor de borracha ficaria preso no texto sem nenhum botão para desligar.
   * Vale tanto para o "limpar tudo" quanto para apagar o último trecho à mão.
   */
  private guardarSeNaoSobrouNada(): void {
    if (this.escopo() !== 'revisao') return;
    if (this._grifos().size === 0) this.modoAtivo.set(false);
  }

  /** Paleta é preferência do aluno: sobrevive ao fim da tentativa. */
  private lerPaleta(): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(PALETA_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as { recentes?: unknown; ultima?: unknown };
      const recentes = Array.isArray(payload.recentes)
        ? payload.recentes.filter(ehCorGrifo).slice(0, MAX_CORES_RECENTES)
        : [];
      this._recentes.set(recentes);
      if (ehCorGrifo(payload.ultima)) {
        this.ultimaCor = payload.ultima;
        this.ferramenta.set(payload.ultima);
      }
    } catch {
      // Preferência corrompida: a paleta volta ao padrão, sem drama.
    }
  }

  private salvarPaleta(): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(
        PALETA_KEY,
        JSON.stringify({ recentes: this._recentes(), ultima: this.ultimaCor }),
      );
    } catch {
      // Storage cheio ou bloqueado: a paleta vale só nesta sessão.
    }
  }

  private ler(tentativaId: string): Map<string, Grifo[]> {
    if (!this.isBrowser) return new Map();
    try {
      return desserializarGrifos(localStorage.getItem(GRIFOS_KEY_PREFIX + tentativaId));
    } catch {
      return new Map();
    }
  }

  private salvar(): void {
    if (!this.isBrowser || !this.tentativaId) return;
    try {
      localStorage.setItem(GRIFOS_KEY_PREFIX + this.tentativaId, serializarGrifos(this._grifos()));
    } catch {
      // Storage cheio ou bloqueado: o grifo continua valendo em memória.
    }
  }

  /**
   * Cada tentativa deixa uma chave para trás. Sem esta varredura o
   * `localStorage` do aluno viraria um cemitério de provas antigas.
   */
  private limparExpirados(): void {
    if (!this.isBrowser) return;
    try {
      const limite = Date.now() - VALIDADE_MS;
      const mortos: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (!chave?.startsWith(GRIFOS_KEY_PREFIX)) continue;
        if (chave === GRIFOS_KEY_PREFIX + this.tentativaId) continue;
        const raw = localStorage.getItem(chave);
        const atualizado = raw ? (JSON.parse(raw) as { atualizado_em?: number }).atualizado_em : 0;
        if (!atualizado || atualizado < limite) mortos.push(chave);
      }
      for (const chave of mortos) localStorage.removeItem(chave);
    } catch {
      // Payload corrompido ou storage bloqueado: sem faxina, sem drama.
    }
  }
}
