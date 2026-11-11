# Admin sur Vercel (admin.elupedia.fr)

Todolist de mise en place d'un projet Vercel dédié à `packages/admin`. Les
parties code sont faites (voir « Fait dans le dépôt ») ; le reste se passe
dans les consoles Vercel, DNS et Neon.

## Fait dans le dépôt

- [x] `packages/admin/vercel.json` : installation Yarn 4 depuis la racine, build `next build --webpack`, `ignoreCommand` (build sauté si `packages/admin`, `shared`, `shorts`, `ingest`, `dagu-dags`, `yarn.lock` ou `package.json` racine n'ont pas changé).
- [x] `next.config.ts` : `outputFileTracingRoot` = racine du monorepo, `dagu-dags/*.yaml` embarqués pour la page Ingestions, en-têtes `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- [x] `src/lib/runtime.ts` : détection de l'hébergement sans disque (`VERCEL`, ou `ADMIN_LOCAL_MACHINE=0|1` pour forcer). Pages dégradées proprement au lieu d'échouer :
  - Ingestions : DAGs listés, rapports de run absents (bandeau).
  - Vidéos : revue OK ; fichiers (vidéo, vignette, description) en 404, boutons du pipeline remplacés par un message, publication YouTube bloquée.
- [x] `.env.example` : `AUTH_SECRET`, `ADMIN_LOCAL_MACHINE` documentés.

## Vercel

- [ ] Créer un projet (ex. `elupedia-admin`) relié au même dépôt GitHub.
- [ ] Root Directory : `packages/admin`. Cocher « Include files outside the root directory in the Build Step » (activé par défaut).
- [ ] Framework : Next.js (repris de `vercel.json`). Node.js : même version que le projet du site.
- [ ] Production Branch : `main`.
- [ ] Function Region : la région la plus proche de la base Neon (voir Neon → projet → région ; ex. `fra1` pour `aws-eu-central-1`).
- [ ] Variables d'environnement (Production, et Preview si utilisé) :
  - [ ] `DATABASE_URL` : chaîne Neon **poolée** (`-pooler` dans l'hôte). Idéalement un rôle Postgres dédié à l'admin (voir Neon).
  - [ ] `AUTH_SECRET` : nouveau secret (`openssl rand -base64 32`), différent de celui de la machine locale.
  - [ ] Ne **pas** poser `ANTHROPIC_API_KEY`, `YOUTUBE_*`, `ELEVENLABS_*`, `SHORTS_OUTPUT_DIR`, `ELUPEDIA_REPO_ROOT` : utilisés seulement par les fonctions locales, désactivées hébergé.
- [ ] Deployment Protection : désactiver la Vercel Authentication sur le domaine de production (l'admin a sa propre connexion), la garder sur les previews.
- [ ] Previews : décider si elles doivent exister. Elles pointent sur la même base (écritures réelles) : soit ne pas poser `DATABASE_URL` en Preview (l'admin ne démarre pas), soit leur donner une branche Neon dédiée.
- [ ] Premier déploiement, vérifier les journaux de build (résolution des workspaces, `extensionAlias`).

## Domaine

- [ ] Vercel → projet admin → Domains : ajouter `admin.elupedia.fr`.
- [ ] DNS de `elupedia.fr` : enregistrement `CNAME admin → cname.vercel-dns.com` (ou rien à faire si la zone est déjà gérée par Vercel).
- [ ] Attendre le certificat TLS, vérifier `https://admin.elupedia.fr/login`.
- [ ] Vérifier que `elupedia.fr` (projet du site) n'a pas de redirection générique `*.elupedia.fr` qui capterait le sous-domaine.

## Neon

- [ ] Créer un rôle `elupedia_admin` (lecture/écriture sur les tables métier, pas de DDL) plutôt que réutiliser le propriétaire.
- [ ] Vérifier la limite de connexions : passer par l'endpoint poolé.
- [ ] Optionnel : IP allowlist Neon impossible avec Vercel (IP dynamiques) — sans objet.

## Sécurité

- [ ] Comptes : `yarn --cwd packages/admin set-password <email>` pour chaque utilisateur, mots de passe forts (l'admin devient joignable depuis Internet).
- [ ] Limiter les tentatives de connexion : règle Vercel Firewall (rate limit sur `POST /api/auth/callback/credentials`), à défaut d'un verrouillage applicatif.
- [ ] Optionnel : Vercel Firewall, restriction par IP ou par pays sur tout le projet.
- [ ] Vérifier qu'aucune page n'est indexée (`X-Robots-Tag` en place ; ajouter un `robots.txt` `Disallow: /` si souhaité).

## Machine d'ingestion et de rendu

- [ ] Continuer à y lancer l'admin locale (`yarn --cwd packages/admin start`) pour les fonctions disque : tâches shorts, lecture des vidéos, publication YouTube, rapports d'ingestion.
- [ ] Ou l'arrêter et faire ces opérations en CLI (`yarn --cwd packages/shorts …`).

## Évolutions possibles (hors périmètre)

- [ ] Rapports d'ingestion en base (table `ingest_runs`) plutôt qu'en fichiers, pour les voir sur l'admin hébergée.
- [ ] Fichiers des shorts sur un stockage objet (Vercel Blob, R2) : lecture vidéo et publication YouTube depuis l'admin hébergée.
- [ ] Tâches du pipeline via une file (table `short_jobs` consommée par la machine de rendu) au lieu de `spawn` local.
- [ ] Ajouter `admin.elupedia.fr` au workflow CI (build `packages/admin`) pour détecter les régressions avant déploiement.
