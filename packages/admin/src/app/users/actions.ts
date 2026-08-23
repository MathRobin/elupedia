'use server';

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
