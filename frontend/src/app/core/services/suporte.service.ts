import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  AdminTicketDetalhe,
  AdminTicketResumo,
  SuporteFaq,
  SuporteMensagem,
  SuporteTicket,
  SuporteTicketComMensagens,
  TicketCategoria,
  TicketStatus,
} from '../models/suporte.types';

@Injectable({ providedIn: 'root' })
export class SuporteService {
  private readonly supabase = inject(SupabaseService).client;

  // Estado compartilhado (widget + admin leem daqui)
  readonly faqItems = signal<SuporteFaq[]>([]);
  readonly tickets = signal<SuporteTicketComMensagens[]>([]);

  // ─── Usuário ──────────────────────────────────────────────────────────────

  async criarTicket(titulo: string, descricao: string, categoria: TicketCategoria): Promise<{ ok: true; data: SuporteTicket } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('criar_ticket', {
      p_titulo: titulo,
      p_descricao: descricao,
      p_categoria: categoria,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as SuporteTicket };
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
    return data as SuporteMensagem[];
  }

  async enviarMensagem(ticketId: string, mensagem: string): Promise<{ ok: true; data: SuporteMensagem } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('enviar_mensagem_ticket', {
      p_ticket_id: ticketId,
      p_mensagem: mensagem,
    });
    if (error) return { ok: false, error: error.message };
    const nova = data as SuporteMensagem;
    this.tickets.update(ts =>
      ts.map(t => t.id === ticketId
        ? { ...t, mensagens: [...t.mensagens, nova] }
        : t
      )
    );
    return { ok: true, data: nova };
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
    const raw = data as { ticket: SuporteTicket; mensagens: SuporteMensagem[]; perfil: { nome_completo: string | null; email: string; avatar_url: string | null } };
    return {
      ok: true,
      data: {
        ...raw.ticket,
        mensagens: raw.mensagens ?? [],
        total_mensagens: raw.mensagens?.length ?? 0,
        perfil: raw.perfil,
      },
    };
  }

  async adminResponder(ticketId: string, mensagem: string): Promise<{ ok: true; data: SuporteMensagem } | { ok: false; error: string }> {
    const { data, error } = await this.supabase.rpc('admin_responder_ticket', {
      p_ticket_id: ticketId,
      p_mensagem: mensagem,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as SuporteMensagem };
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
}
