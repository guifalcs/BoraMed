import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { compressImageIfPossible } from '../utils/image-compress.util';
import type {
  SuporteAnexo,
  AdminTicketDetalhe,
  AdminTicketResumo,
  SuporteFaq,
  SuporteMensagem,
  SuporteTicket,
  SuporteTicketComMensagens,
  TicketCategoria,
  TicketStatus,
} from '../models/suporte.types';

export const SUPORTE_ANEXOS_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
].join(',');

export const SUPORTE_ANEXOS_MAX_FILES = 3;
export const SUPORTE_ANEXOS_MAX_BYTES = 25 * 1024 * 1024;

const SUPORTE_ANEXOS_BUCKET = 'suporte-anexos';
const SUPORTE_ANEXOS_URL_TTL_SECONDS = 60 * 60;
const SUPORTE_ANEXOS_MIME_TYPES = new Set(SUPORTE_ANEXOS_ACCEPT.split(','));

type RawSuporteMensagem = Omit<SuporteMensagem, 'anexos'>;
type RawSuporteAnexo = Omit<SuporteAnexo, 'url_assinada'>;
type Result<T> = { ok: true; data: T; warning?: string } | { ok: false; error: string };

interface AnexoUploadPayload {
  storage_path: string;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
}

@Injectable({ providedIn: 'root' })
export class SuporteService {
  private readonly supabase = inject(SupabaseService).client;

  // Estado compartilhado (widget + admin leem daqui)
  readonly faqItems = signal<SuporteFaq[]>([]);
  readonly tickets = signal<SuporteTicketComMensagens[]>([]);

  // Indicativo de chamados novos na sidebar do admin
  readonly ticketsAbertosCount = signal<number>(0);

  async carregarContagemTicketsAbertos(): Promise<void> {
    const { count, error } = await this.supabase
      .from('suporte_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aberto');
    if (!error) this.ticketsAbertosCount.set(count ?? 0);
  }

  // ─── Usuário ──────────────────────────────────────────────────────────────

  validarArquivos(arquivos: File[], atuais: File[] = []): { ok: true; data: File[] } | { ok: false; error: string } {
    if (atuais.length + arquivos.length > SUPORTE_ANEXOS_MAX_FILES) {
      return { ok: false, error: `Selecione no máximo ${SUPORTE_ANEXOS_MAX_FILES} anexos.` };
    }

    for (const arquivo of arquivos) {
      if (!SUPORTE_ANEXOS_MIME_TYPES.has(arquivo.type)) {
        return { ok: false, error: 'Use apenas imagens ou vídeos nos formatos permitidos.' };
      }

      if (arquivo.size <= 0) {
        return { ok: false, error: 'Um dos anexos está vazio.' };
      }

      if (arquivo.size > SUPORTE_ANEXOS_MAX_BYTES) {
        return { ok: false, error: `Cada anexo deve ter no máximo ${this.formatarTamanhoArquivo(SUPORTE_ANEXOS_MAX_BYTES)}.` };
      }
    }

    return { ok: true, data: arquivos };
  }

  formatarTamanhoArquivo(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async criarTicket(
    titulo: string,
    descricao: string,
    categoria: TicketCategoria,
    anexos: File[] = [],
  ): Promise<Result<SuporteTicket>> {
    const validacao = this.validarArquivos(anexos);
    if (!validacao.ok) return { ok: false, error: validacao.error };

    const { data, error } = await this.supabase.rpc('criar_ticket', {
      p_titulo: titulo,
      p_descricao: descricao,
      p_categoria: categoria,
    });
    if (error) return { ok: false, error: error.message };

    const ticket = data as SuporteTicket;
    if (anexos.length === 0) return { ok: true, data: ticket };

    const mensagens = await this.buscarMensagens(ticket.id);
    const primeiraMensagem = mensagens[0];
    if (!primeiraMensagem) {
      return {
        ok: true,
        data: ticket,
        warning: 'Solicitação criada, mas não foi possível vincular os anexos.',
      };
    }

    const upload = await this.registrarAnexos(primeiraMensagem.id, anexos);
    if (!upload.ok) {
      return {
        ok: true,
        data: ticket,
        warning: 'Solicitação criada, mas os anexos não foram enviados.',
      };
    }

    return { ok: true, data: ticket };
  }

  async carregarMeusTickets(): Promise<void> {
    const { data, error } = await this.supabase.rpc('buscar_meus_tickets');
    if (!error && data) {
      // Carrega cada ticket com suas mensagens
      const comMensagens = await Promise.all(
        (data as SuporteTicket[]).map(async (t) => {
          const msgs = await this.buscarMensagens(t.id);
          return { ...t, mensagens: msgs } as SuporteTicketComMensagens;
        })
      );
      this.tickets.set(comMensagens);
    }
  }

  async buscarMensagens(ticketId: string): Promise<SuporteMensagem[]> {
    const { data, error } = await this.supabase.rpc('buscar_mensagens_ticket', {
      p_ticket_id: ticketId,
    });
    if (error || !data) return [];
    const mensagens = (data as RawSuporteMensagem[]).map((m) => this.normalizarMensagem(m));
    return this.incluirAnexos(ticketId, mensagens);
  }

  async enviarMensagem(ticketId: string, mensagem: string, anexos: File[] = []): Promise<Result<SuporteMensagem>> {
    const validacao = this.validarArquivos(anexos);
    if (!validacao.ok) return { ok: false, error: validacao.error };

    const { data, error } = await this.supabase.rpc('enviar_mensagem_ticket', {
      p_ticket_id: ticketId,
      p_mensagem: mensagem,
    });
    if (error) return { ok: false, error: error.message };

    let nova = this.normalizarMensagem(data as RawSuporteMensagem);
    let warning: string | undefined;
    if (anexos.length > 0) {
      const upload = await this.registrarAnexos(nova.id, anexos);
      if (upload.ok) {
        nova = { ...nova, anexos: upload.data };
      } else {
        warning = 'Mensagem enviada, mas os anexos não foram enviados.';
      }
    }

    this.tickets.update(ts =>
      ts.map(t => t.id === ticketId
        ? { ...t, mensagens: [...t.mensagens, nova] }
        : t
      )
    );
    return warning ? { ok: true, data: nova, warning } : { ok: true, data: nova };
  }

  async reabrirTicket(ticketId: string): Promise<Result<SuporteTicketComMensagens>> {
    const { data, error } = await this.supabase.rpc('reabrir_ticket', {
      p_ticket_id: ticketId,
    });
    if (error) return { ok: false, error: error.message };

    const ticket = data as SuporteTicket;
    const mensagens = await this.buscarMensagens(ticket.id);
    const atualizado: SuporteTicketComMensagens = { ...ticket, mensagens };

    this.tickets.update(ts => ts.map(t => t.id === ticketId ? atualizado : t));
    return { ok: true, data: atualizado };
  }

  async carregarFaq(): Promise<void> {
    const { data, error } = await this.supabase.rpc('buscar_faq');
    if (!error && data) {
      this.faqItems.set(data as SuporteFaq[]);
    }
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminListarTickets(status?: TicketStatus): Promise<{ ok: true; data: AdminTicketResumo[] } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('admin_listar_tickets', {
      p_status: status ?? null,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) return { ok: false, error: error.message };
    const rows = (data as Record<string, unknown>[]).map(r => ({
      id: r['id'],
      user_id: r['user_id'],
      titulo: r['titulo'],
      descricao: r['descricao'],
      categoria: r['categoria'],
      status: r['status'],
      criado_em: r['criado_em'],
      atualizado_em: r['atualizado_em'],
      total_mensagens: Number(r['total_mensagens']),
      perfil: {
        nome_completo: r['perfil_nome'] as string | null,
        email: r['perfil_email'] as string,
        avatar_url: r['perfil_avatar'] as string | null,
      },
    })) as AdminTicketResumo[];
    return { ok: true, data: rows };
  }

  async adminDetalharTicket(ticketId: string): Promise<{ ok: true; data: AdminTicketDetalhe } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('admin_detalhar_ticket', {
      p_ticket_id: ticketId,
    });
    if (error) return { ok: false, error: error.message };
    const raw = data as { ticket: SuporteTicket; mensagens: RawSuporteMensagem[]; perfil: { nome_completo: string | null; email: string; avatar_url: string | null } };
    const mensagens = await this.incluirAnexos(
      raw.ticket.id,
      (raw.mensagens ?? []).map((m) => this.normalizarMensagem(m)),
    );
    return {
      ok: true,
      data: {
        ...raw.ticket,
        mensagens,
        total_mensagens: mensagens.length,
        perfil: raw.perfil,
      },
    };
  }

  async adminResponder(ticketId: string, mensagem: string, anexos: File[] = []): Promise<Result<SuporteMensagem>> {
    const validacao = this.validarArquivos(anexos);
    if (!validacao.ok) return { ok: false, error: validacao.error };

    const { data, error } = await this.supabase.rpc('admin_responder_ticket', {
      p_ticket_id: ticketId,
      p_mensagem: mensagem,
    });
    if (error) return { ok: false, error: error.message };

    let nova = this.normalizarMensagem(data as RawSuporteMensagem);
    let warning: string | undefined;
    if (anexos.length > 0) {
      const upload = await this.registrarAnexos(nova.id, anexos);
      if (upload.ok) {
        nova = { ...nova, anexos: upload.data };
      } else {
        warning = 'Resposta enviada, mas os anexos não foram enviados.';
      }
    }

    return warning ? { ok: true, data: nova, warning } : { ok: true, data: nova };
  }

  async adminAtualizarStatus(ticketId: string, status: TicketStatus): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await this.supabase.rpc('admin_atualizar_status_ticket', {
      p_ticket_id: ticketId,
      p_status: status,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async adminCriarFaq(pergunta: string, resposta: string, categoria: string | null): Promise<{ ok: true; data: SuporteFaq } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('admin_criar_faq', {
      p_pergunta: pergunta,
      p_resposta: resposta,
      p_categoria: categoria,
    });
    if (error) return { ok: false, error: error.message };
    const novoItem = data as SuporteFaq;
    this.faqItems.update(items => [...items, novoItem]);
    return { ok: true, data: novoItem };
  }

  async adminListarFaq(): Promise<void> {
    const { data, error } = await this.supabase.rpc('admin_listar_faq');
    if (!error && data) {
      this.faqItems.set(data as SuporteFaq[]);
    }
  }

  async adminToggleFaq(id: string): Promise<{ ok: true; data: SuporteFaq } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('admin_toggle_faq', { p_id: id });
    if (error) return { ok: false, error: error.message };
    const updated = data as SuporteFaq;
    this.faqItems.update(items => items.map(f => f.id === id ? updated : f));
    return { ok: true, data: updated };
  }

  async adminDeletarFaq(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await this.supabase.rpc('admin_deletar_faq', { p_id: id });
    if (error) return { ok: false, error: error.message };
    this.faqItems.update(items => items.filter(f => f.id !== id));
    return { ok: true };
  }

  private normalizarMensagem(mensagem: RawSuporteMensagem): SuporteMensagem {
    return { ...mensagem, anexos: [] };
  }

  private async incluirAnexos(ticketId: string, mensagens: SuporteMensagem[]): Promise<SuporteMensagem[]> {
    const anexos = await this.buscarAnexos(ticketId);
    if (anexos.length === 0) return mensagens;

    return mensagens.map((mensagem) => ({
      ...mensagem,
      anexos: anexos.filter((anexo) => anexo.mensagem_id === mensagem.id),
    }));
  }

  private async buscarAnexos(ticketId: string): Promise<SuporteAnexo[]> {
    const { data, error } = await this.supabase.rpc('buscar_anexos_ticket', {
      p_ticket_id: ticketId,
    });
    if (error || !data) return [];
    return this.assinarAnexos(data as RawSuporteAnexo[]);
  }

  private async registrarAnexos(mensagemId: string, arquivos: File[]): Promise<Result<SuporteAnexo[]>> {
    const uploads = await this.uploadAnexos(arquivos);
    if (!uploads.ok) return uploads;

    const { data, error } = await this.supabase.rpc('registrar_anexos_mensagem', {
      p_mensagem_id: mensagemId,
      p_anexos: uploads.data,
    });

    if (error) {
      await this.removerUploadsNaoRegistrados(uploads.data);
      return { ok: false, error: error.message };
    }

    return { ok: true, data: await this.assinarAnexos(data as RawSuporteAnexo[]) };
  }

  private async uploadAnexos(arquivos: File[]): Promise<Result<AnexoUploadPayload[]>> {
    if (arquivos.length === 0) return { ok: true, data: [] };

    const { data: userData, error: userError } = await this.supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userError || !userId) {
      return { ok: false, error: 'Usuário não autenticado.' };
    }

    const enviados: AnexoUploadPayload[] = [];

    for (const arquivo of arquivos) {
      // Comprime imagens antes de subir; vídeos, GIF e HEIC passam intactos.
      const preparado = await compressImageIfPossible(arquivo, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.82,
      });

      const path = `${userId}/${this.gerarNomeStorage(preparado.name)}`;
      const { data, error } = await this.supabase.storage
        .from(SUPORTE_ANEXOS_BUCKET)
        .upload(path, preparado, {
          cacheControl: '3600',
          contentType: preparado.type,
          upsert: false,
        });

      if (error) {
        await this.removerUploadsNaoRegistrados(enviados);
        return { ok: false, error: error.message };
      }

      enviados.push({
        storage_path: data.path,
        nome_arquivo: preparado.name,
        mime_type: preparado.type,
        tamanho_bytes: preparado.size,
      });
    }

    return { ok: true, data: enviados };
  }

  private async removerUploadsNaoRegistrados(anexos: AnexoUploadPayload[]): Promise<void> {
    const paths = anexos.map((anexo) => anexo.storage_path);
    if (paths.length === 0) return;
    await this.supabase.storage.from(SUPORTE_ANEXOS_BUCKET).remove(paths);
  }

  private async assinarAnexos(anexos: RawSuporteAnexo[]): Promise<SuporteAnexo[]> {
    return Promise.all(
      anexos.map(async (anexo) => {
        const { data, error } = await this.supabase.storage
          .from(SUPORTE_ANEXOS_BUCKET)
          .createSignedUrl(anexo.storage_path, SUPORTE_ANEXOS_URL_TTL_SECONDS);

        return {
          ...anexo,
          tamanho_bytes: Number(anexo.tamanho_bytes),
          url_assinada: error ? null : data.signedUrl,
        };
      }),
    );
  }

  private gerarNomeStorage(nomeOriginal: string): string {
    const id = crypto.randomUUID();
    const nomeSeguro = nomeOriginal
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'anexo';

    return `${new Date().toISOString().slice(0, 10)}/${id}-${nomeSeguro}`;
  }
}
