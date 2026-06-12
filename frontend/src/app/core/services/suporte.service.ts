import { Injectable, signal } from '@angular/core';
import type { SuporteFaq, SuporteTicketComMensagens } from '../models/suporte.types';

@Injectable({ providedIn: 'root' })
export class SuporteService {
  readonly faqItems = signal<SuporteFaq[]>([]);
  readonly tickets = signal<SuporteTicketComMensagens[]>([]);
}
