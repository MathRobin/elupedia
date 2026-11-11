/**
 * Où tourne l'admin. Deux déploiements possibles :
 * - sur la machine d'ingestion et de rendu (Dagu, `yarn --cwd packages/admin
 *   start`) : disque du dépôt accessible, commandes shorts lançables ;
 * - sur Vercel (admin.elupedia.fr) : fonctions serverless sans disque
 *   persistant ni processus long. Les rapports d'ingestion, les fichiers des
 *   shorts et les tâches du pipeline n'y sont pas disponibles ; les pages
 *   concernées l'affichent au lieu d'échouer.
 *
 * `ADMIN_LOCAL_MACHINE=1|0` force le choix ; par défaut, la présence de
 * `VERCEL` (posée par la plateforme) désigne le second cas.
 */
export function hasLocalMachine(): boolean {
  const forced = process.env.ADMIN_LOCAL_MACHINE;
  if (forced === '1') return true;
  if (forced === '0') return false;
  return !process.env.VERCEL;
}

export const NO_LOCAL_MACHINE_MESSAGE =
  "Indisponible sur l'admin hébergée : à faire depuis la machine de rendu (yarn --cwd packages/shorts …).";
