/**
 * Définit (ou redéfinit) le mot de passe d'un compte de l'admin, sans passer
 * par l'interface : pratique quand le premier compte a été créé à la main en
 * base ou que le mot de passe a été perdu.
 *
 * Le mot de passe est demandé au clavier sans écho (jamais en argument ni en
 * variable d'environnement, pour qu'il ne finisse pas dans l'historique du
 * shell), haché en bcrypt comme le fait `src/lib/auth.ts` (`compare`), puis
 * écrit dans `users.password_hash`. Le compte doit déjà exister ; pour en
 * créer un, passer `--create --role admin|moderator`.
 *
 * Usage : yarn --cwd packages/admin set-password <email> [--create --role admin]
 * DATABASE_URL lue dans le `.env` de la racine (même chargeur que next.mjs).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hash } from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(here, '..', '..', '..', '.env'));

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const create = args.includes('--create');
const roleIdx = args.indexOf('--role');
const role = roleIdx === -1 ? 'admin' : args[roleIdx + 1];

if (!email || !email.includes('@')) {
  console.error(
    'Usage : yarn --cwd packages/admin set-password <email> [--create --role admin|moderator]',
  );
  process.exit(2);
}
if (!['admin', 'moderator'].includes(role)) {
  console.error(`Rôle inconnu : ${role} (admin ou moderator)`);
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL absente (ni dans .env ni dans l’environnement)');
  process.exit(2);
}

const password = await promptHidden(`Nouveau mot de passe pour ${email} : `);
if (password.length < 12) {
  console.error('Mot de passe trop court (12 caractères minimum)');
  process.exit(1);
}
const again = await promptHidden('Confirmer : ');
if (again !== password) {
  console.error('Les deux saisies diffèrent');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const passwordHash = await hash(password, 12);
const normalized = email.trim().toLowerCase();

const existing =
  await sql`select id, role from users where lower(email) = ${normalized}`;
if (existing.length === 0) {
  if (!create) {
    console.error(
      `Aucun compte ${normalized}. Ajouter --create --role admin|moderator pour le créer.`,
    );
    process.exit(1);
  }
  await sql`insert into users (email, password_hash, role) values (${normalized}, ${passwordHash}, ${role})`;
  console.log(`Compte ${normalized} créé (rôle ${role}).`);
} else {
  await sql`update users set password_hash = ${passwordHash} where id = ${existing[0].id}`;
  console.log(
    `Mot de passe de ${normalized} mis à jour (rôle ${existing[0].role}).`,
  );
}

function loadEnv(file) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const m = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!m || m[1] in process.env) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}

/**
 * Demande une ligne au clavier sans rien afficher de la frappe.
 *
 * Le flux de sortie confié à readline n'écrit jamais rien : c'est lui qui
 * porte l'écho des caractères, et le prompt est donc affiché à la main sur
 * stdout. Une version précédente coupait l'écho par un drapeau remis à faux
 * en fin de saisie ; comme `rl.close()` ne détache pas readline de stdin, la
 * première interface recevait encore la deuxième saisie et la réaffichait par
 * son flux redevenu bavard : le mot de passe de confirmation apparaissait en
 * clair. Un flux muet en permanence supprime cette fenêtre.
 *
 * stdin passe en mode « raw », où le terminal n'envoie plus SIGINT : Ctrl+C et
 * Ctrl+D sont donc traités à la main, sinon la saisie serait impossible à
 * interrompre.
 */
function promptHidden(question) {
  return new Promise((resolvePrompt) => {
    const input = process.stdin;
    if (!input.isTTY) {
      console.error('Saisie impossible : pas de terminal interactif');
      process.exit(1);
    }

    const muet = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });

    process.stdout.write(question);
    const rl = createInterface({ input, output: muet, terminal: true });

    rl.on('close', () => {
      // Ctrl+D ou entrée fermée : rien à faire sans mot de passe.
      console.error('\nSaisie interrompue');
      process.exit(1);
    });
    rl.on('SIGINT', () => {
      rl.removeAllListeners('close');
      rl.close();
      console.error('\nSaisie annulée');
      process.exit(130);
    });

    rl.question('', (answer) => {
      rl.removeAllListeners('close');
      rl.close();
      process.stdout.write('\n');
      resolvePrompt(answer);
    });
  });
}
