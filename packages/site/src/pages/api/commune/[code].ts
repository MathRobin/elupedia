/**
 * API Commune : `GET /api/commune/{code INSEE}` → liste JSON des responsables
 * politiques en exercice de la commune, avec l'URL de leur fiche Elupedia.
 * Documentée sur `/docs/commune-api` (dont `tests/commune-api.test.js`
 * vérifie des chaînes exactes de ce fichier).
 *
 * Deux sources fusionnées :
 * 1. les mandats en cours rattachés à la commune (`commune_code`) ou dont
 *    elle est la commune parente (`parent_commune_code` : communes déléguées
 *    d'une commune nouvelle) ;
 * 2. le ou les députés en exercice ayant été candidats à la dernière
 *    législative tenue dans la commune — c'est le seul lien commune ↔
 *    circonscription dont on dispose.
 *
 * Réponse : tableau `{ url, firstName, lastName, mandateType, politicalGroup }`,
 * éventuellement vide, cache CDN 24 h. Un code invalide (≠ 5 chiffres)
 * redirige vers la doc en 302. Pas d'en-tête CORS.
 */
import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.js';
import {
  officials,
  mandates,
  legislativeElections,
  legislativeCandidates,
} from '@elupedia/shared';
import { eq, or, and, isNull, isNotNull, desc, inArray } from 'drizzle-orm';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { code } = params;

  if (!code || !/^\d{5}$/.test(code)) {
    return Response.redirect('https://www.elupedia.fr/docs/commune-api', 302);
  }

  const db = getDb();

  // DISTINCT ON (officials.id) : un élu cumulant plusieurs mandats dans la
  // commune (maire + conseiller communautaire…) n'apparaît qu'une fois ; le
  // mandat retenu dépend de l'ordre de la base, non spécifié.
  const communeRows = await db
    .selectDistinctOn([officials.id], {
      slug: officials.slug,
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      mandateType: mandates.type,
      politicalGroup: mandates.politicalGroup,
    })
    .from(mandates)
    .innerJoin(officials, eq(mandates.officialId, officials.id))
    .where(
      and(
        or(
          eq(mandates.communeCode, code),
          eq(mandates.parentCommuneCode, code),
        ),
        isNull(mandates.endDate),
      ),
    );

  const [lastElection] = await db
    .select({ id: legislativeElections.id })
    .from(legislativeElections)
    .where(eq(legislativeElections.communeCode, code))
    .orderBy(desc(legislativeElections.electionDate))
    .limit(1);

  let deputeRows: typeof communeRows = [];

  if (lastElection) {
    const candidateOfficialIds = await db
      .select({ officialId: legislativeCandidates.officialId })
      .from(legislativeCandidates)
      .where(
        and(
          eq(legislativeCandidates.electionId, lastElection.id),
          isNotNull(legislativeCandidates.officialId),
        ),
      );

    const ids = candidateOfficialIds
      .map((candidate) => candidate.officialId)
      .filter((id): id is string => id !== null);

    // Parmi les candidats, seuls ceux qui ont aujourd'hui un mandat de député
    // sont retenus : un candidat battu n'a pas ce mandat.
    if (ids.length > 0) {
      deputeRows = await db
        .selectDistinctOn([officials.id], {
          slug: officials.slug,
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
          mandateType: mandates.type,
          politicalGroup: mandates.politicalGroup,
        })
        .from(mandates)
        .innerJoin(officials, eq(mandates.officialId, officials.id))
        .where(
          and(
            inArray(mandates.officialId, ids),
            eq(mandates.type, 'depute'),
            isNull(mandates.endDate),
          ),
        );
    }
  }

  // Fusion en dédoublonnant par élu : un député qui est aussi conseiller
  // municipal de la commune garde la ligne (et le mandat) de la commune.
  const seenIds = new Set(communeRows.map((row) => row.id));
  const allRows = [...communeRows];
  for (const deputeRow of deputeRows) {
    if (!seenIds.has(deputeRow.id)) {
      allRows.push(deputeRow);
      seenIds.add(deputeRow.id);
    }
  }

  const baseUrl = 'https://www.elupedia.fr';

  const result = allRows.map((row) => ({
    // Les fiches sans slug restent accessibles par UUID.
    url: `${baseUrl}/elus/${row.slug ?? row.id}`,
    firstName: row.firstName,
    lastName: row.lastName,
    mandateType: row.mandateType,
    politicalGroup: row.politicalGroup,
  }));

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
