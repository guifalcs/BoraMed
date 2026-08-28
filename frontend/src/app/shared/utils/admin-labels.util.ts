/**
 * Labels e formatadores compartilhados das telas admin (usuários, financeiro,
 * métricas por usuário). Fonte única para as traduções de status/enums —
 * evita mapas duplicados que divergem entre telas.
 */

import { FACULDADE_UNIDADE_LABELS, type FaculdadeUnidade } from '../../core/models/faculdade-unidade';

const PAGAMENTO_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  authorized: 'Autorizado',
  in_process: 'Processando',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
  charged_back: 'Estornado',
};

const ASSINATURA_STATUS_LABELS: Record<string, string> = {
  authorized: 'Ativa',
  pending: 'Pendente',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

const TIPO_USUARIO_LABELS: Record<string, string> = {
  estudante_medicina: 'Estudante de Medicina',
  medico: 'Médico',
  residente: 'Residente',
  cursinho: 'Cursinho',
  ensino_medio: 'Ensino Médio',
  outro: 'Outro',
};

export function pagamentoStatusLabel(status: string): string {
  return PAGAMENTO_STATUS_LABELS[status] ?? status;
}

export function assinaturaStatusLabel(status: string): string {
  return ASSINATURA_STATUS_LABELS[status] ?? status;
}

export function tipoUsuarioLabel(tipo: string | null): string {
  return tipo ? (TIPO_USUARIO_LABELS[tipo] ?? tipo) : '—';
}

export function papelLabel(papel: string): string {
  if (papel === 'super_admin') return 'Super Admin';
  if (papel === 'admin') return 'Admin';
  return 'Aluno';
}

/** Deriva o nome da cidade a partir da unidade Afya (formato "Cidade (UF)"). */
export function faculdadeUnidadeLabel(unidade: FaculdadeUnidade | null): string {
  return unidade ? (FACULDADE_UNIDADE_LABELS[unidade] ?? unidade) : '—';
}

/** Formata centavos na moeda informada (padrão BRL); null vira '—'. */
export function formatarCentavos(centavos: number | null, moeda = 'BRL'): string {
  if (centavos == null) return '—';
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: moeda || 'BRL',
  });
}
