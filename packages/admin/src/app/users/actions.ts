'use server';

/**
 * Actions serveur de /users : comptes de l'admin (table `users`). Écritures :
 * `updateUserRole` modifie `users.role`, `deleteUser` supprime la ligne,
 * `inviteUser` insère un compte (email + rôle) sans mot de passe : celui-ci
 * est posé ensuite avec `yarn --cwd packages/admin set-password <email>`.
 * Rôles acceptés : admin et moderator. Réservé au rôle admin
 * (`requireAdmin`, vérifié à chaque appel) ; chaque écriture revalide /users.
 */
import { eq } from 'drizzle-orm';
import { createDb, users } from '@elupedia/shared';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const db = createDb();

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== 'admin') throw new Error('Forbidden');
}

export async function listUsers() {
  await requireAdmin();
  return db.select().from(users);
}

export async function updateUserRole(userId: string, role: string) {
  await requireAdmin();
  if (role !== 'admin' && role !== 'moderator') {
    throw new Error('Invalid role');
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath('/users');
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath('/users');
}

export async function inviteUser(email: string, role: string) {
  await requireAdmin();
  if (role !== 'admin' && role !== 'moderator') {
    throw new Error('Invalid role');
  }
  await db.insert(users).values({ email, role });
  revalidatePath('/users');
}
