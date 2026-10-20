'use server';

/**
 * Actions serveur de /moderation : file des liens externes (réseaux sociaux
 * détectés par l'ingestion, `external_links.status = 'pending'`) et décision.
 * `moderateLink` écrit `external_links.status` (published, rejected ou
 * deleted : le lien n'est jamais supprimé physiquement) puis revalide
 * /moderation. Ouvert aux rôles admin et moderator
 * (`requireAuthenticatedUser`, vérifié à chaque appel).
 */
import { eq } from 'drizzle-orm';
import { createDb, externalLinks, officials } from '@elupedia/shared';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const db = createDb();

async function requireAuthenticatedUser() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator')) {
    throw new Error('Forbidden');
  }
}

export async function listPendingLinks() {
  await requireAuthenticatedUser();
  return db
    .select({
      id: externalLinks.id,
      officialId: externalLinks.officialId,
      platform: externalLinks.platform,
      url: externalLinks.url,
      source: externalLinks.source,
      capturedAt: externalLinks.capturedAt,
      officialFirstName: officials.firstName,
      officialLastName: officials.lastName,
    })
    .from(externalLinks)
    .innerJoin(officials, eq(externalLinks.officialId, officials.id))
    .where(eq(externalLinks.status, 'pending'));
}

export async function moderateLink(
  linkId: string,
  action: 'published' | 'rejected' | 'deleted',
) {
  await requireAuthenticatedUser();
  await db
    .update(externalLinks)
    .set({ status: action })
    .where(eq(externalLinks.id, linkId));
  revalidatePath('/moderation');
}
