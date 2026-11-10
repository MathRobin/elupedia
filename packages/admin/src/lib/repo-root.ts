/**
 * Racine du dépôt elupedia vue par l'admin : les rapports d'ingestion
 * (`packages/ingest/ingest-report-*.json`), les DAGs (`dagu-dags/`), les
 * fichiers des shorts (`packages/shorts/out`) et les commandes lancées depuis
 * /videos s'y rattachent.
 *
 * Par défaut, deux niveaux au-dessus du cwd du serveur Next (`packages/admin`
 * → racine). Piège : l'admin démarrée depuis un autre checkout (worktree) ne
 * voit alors que les rapports de ce checkout. `ELUPEDIA_REPO_ROOT` force la
 * racine, par exemple vers le checkout que Dagu met à jour.
 */
import path from 'node:path';

export function repoRoot(): string {
  const configured = process.env.ELUPEDIA_REPO_ROOT;
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), '..', '..');
}
