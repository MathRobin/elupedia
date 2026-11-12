#!/usr/bin/env bash
# Déclenche à la main un DAG Dagu du dépôt (dagu-dags/<nom>.yaml), hors planification.
#
# Usage : scripts/trigger-dag.sh <nom-du-dag> [--list]
#   <nom-du-dag>  slug du fichier sans extension (ex. ingest-press, publish-shorts)
#   --list        liste les DAGs déclenchables et sort
#
# Le run est *mis en file* (`dagu enqueue`) : le scheduler du service systemd
# dagu.service le prend en charge, avec le même environnement (base.yaml, .env)
# et la même file que les runs planifiés — donc pas d'exécution concurrente du
# même DAG. Le script rend la main tout de suite ; le suivi se fait dans l'UI
# Dagu (http://127.0.0.1:8080) ou avec `dagu status <nom>`.
#
# Appelé par : packages/admin (bouton « Lancer » de /ingestions, lib/dag-trigger.ts).
# Variables : DAGU_HOME (défaut /var/lib/dagu), DAGU_BIN (défaut `dagu`).
# Piège : le nom est validé contre la liste des fichiers du dépôt avant tout
# appel à dagu, rien n'est évalué par un shell.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dags_dir="${ELUPEDIA_DAGS_DIR:-$root/dagu-dags}"
export DAGU_HOME="${DAGU_HOME:-/var/lib/dagu}"
dagu_bin="${DAGU_BIN:-dagu}"

if [ "${1:-}" = "--list" ]; then
  for f in "$dags_dir"/*.yaml; do f="${f##*/}"; echo "${f%.yaml}"; done
  exit 0
fi

name="${1:-}"
if [ -z "$name" ]; then
  echo "Usage : $0 <nom-du-dag> | --list" >&2
  exit 2
fi
if ! [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || [ ! -f "$dags_dir/$name.yaml" ]; then
  echo "DAG inconnu : $name (voir $0 --list)" >&2
  exit 2
fi
if ! command -v "$dagu_bin" >/dev/null 2>&1; then
  echo "Binaire dagu introuvable ($dagu_bin) : à lancer sur la machine d'ingestion." >&2
  exit 3
fi

"$dagu_bin" enqueue "$dags_dir/$name.yaml"
echo "DAG $name mis en file (DAGU_HOME=$DAGU_HOME)."
