/**
 * Statuts des shorts : liste, libellés et couleurs, partagés par la liste et le
 * détail. Module client : un module 'use server' ne peut exporter que des
 * fonctions, d'où la liste ici et non dans actions.ts.
 */
import { videoShortStatusEnum, type VideoShortStatus } from '@elupedia/shared';

export const VIDEO_STATUSES: readonly VideoShortStatus[] = videoShortStatusEnum;

export const STATUS_LABELS: Record<string, string> = {
  candidate: 'Candidat',
  draft: 'Brouillon',
  approved: 'Approuvé',
  published: 'Publié',
  rejected: 'Rejeté',
};

export const STATUS_COLORS: Record<string, string> = {
  candidate: 'gray',
  draft: 'blue',
  approved: 'green',
  published: 'teal',
  rejected: 'red',
};

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
