/**
 * Lecture d'une variable d'environnement en se gardant des gabarits laissés
 * tels quels par Dagu.
 *
 * Chaque DAG (`dagu-dags/*.yaml`) déclare ses variables sous la forme
 * `- NOM: ${NOM}` ; Dagu les résout depuis le `.env` de la racine
 * (`dotenv` de /var/lib/dagu/config.yaml). Quand la variable n'y figure pas —
 * c'est le cas des variables optionnelles, commentées dans `.env.example` —
 * Dagu exporte la chaîne littérale `${NOM}` au lieu de rien. Le processus
 * reçoit alors une valeur non vide et absurde : `ELEVENLABS_MODEL_ID` à
 * `${ELEVENLABS_MODEL_ID}` fait répondre HTTP 400 à ElevenLabs, et
 * `VERCEL_DEPLOY_HOOK_URL` au même état fait échouer `rebuild:site`, là où la
 * variable simplement absente serait sans effet (valeur par défaut ou étape
 * sautée). Les variables du shell priment sur `--env-file` de tsx : le gabarit
 * masquerait même une valeur présente dans `.env`.
 *
 * `envValue` rend donc `undefined` pour une variable absente, vide ou restée
 * à l'état de gabarit, ce qui rétablit les valeurs par défaut.
 *
 * Appelants : packages/shorts (sortie, ElevenLabs, YouTube) et packages/ingest
 * (deploy hook, S3, API factchecks) — toute variable passée par un DAG.
 */

/** Vrai pour `${NOM}` : une variable que Dagu n'a pas su résoudre. */
export function isUnresolvedEnvPlaceholder(value: string): boolean {
  return /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value.trim());
}

/** Valeur utilisable d'une variable, sinon `undefined` (absente, vide ou gabarit). */
export function envValue(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value === '' || isUnresolvedEnvPlaceholder(value)) return undefined;
  return raw;
}
