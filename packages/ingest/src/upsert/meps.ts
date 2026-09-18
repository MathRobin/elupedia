import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, affiliations } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { FrenchMep, MepDetail } from '../sources/parlement-europeen.js';
import { CURRENT_LEGISLATURE } from '../sources/parlement-europeen.js';
import { writeProvenance } from './provenance.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Parlement européen - Open Data API';
const LEGAL_BASIS = 'Licence CC BY 4.0 - data.europarl.europa.eu';

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Normalise un nom pour le matching : minuscules, sans accents, espaces/tirets uniformisés. Ne suffit jamais seul (homonymes) — toujours combiné à la date de naissance. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

export interface MepUpsertInput {
  mep: FrenchMep;
  detail: MepDetail;
  nationalPartyLabel: string | null;
}

export interface MepUpsertResult {
  officialId: string;
  created: boolean;
}

/**
 * Rattache un eurodéputé à un `official` existant (député/sénateur ayant aussi
 * un mandat européen) via nom normalisé + date de naissance exacte, ou en crée
 * un nouveau. Le nom seul ne suffit pas (homonymes, particules, changements de
 * nom) : la date de naissance est obligatoire pour un rattachement — sans elle
 * (bday absent côté API), un nouvel `official` est créé plutôt que de risquer
 * un mauvais rattachement. Taux d'erreur mesuré sur l'échantillon des 81
 * eurodéputés français actuels : voir commentaire du ticket M24T3.
 */
export async function upsertMep(
  db: NeonHttpDatabase,
  input: MepUpsertInput,
): Promise<MepUpsertResult> {
  const { mep, detail, nationalPartyLabel } = input;

  const existingByEuroparlId = await db
    .select()
    .from(officials)
    .where(eq(officials.europarlId, mep.id))
    .limit(1);

  let officialId: string;
  let created = false;

  if (existingByEuroparlId.length > 0) {
    officialId = existingByEuroparlId[0].id;
    await db
      .update(officials)
      .set({
        birthDate: detail.birthDate ?? existingByEuroparlId[0].birthDate,
        updatedAt: new Date(),
      })
      .where(eq(officials.id, officialId));
  } else {
    const candidates = detail.birthDate
      ? await db
          .select()
          .from(officials)
          .where(
            and(
              eq(officials.birthDate, detail.birthDate),
              isNull(officials.europarlId),
            ),
          )
      : [];

    const match = candidates.find(
      (c) =>
        normalizeName(c.lastName) === normalizeName(mep.familyName) &&
        normalizeName(c.firstName) === normalizeName(mep.givenName),
    );

    if (match) {
      officialId = match.id;
      await db
        .update(officials)
        .set({ europarlId: mep.id, updatedAt: new Date() })
        .where(eq(officials.id, officialId));
    } else {
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: mep.givenName,
          lastName: mep.familyName,
          europarlId: mep.id,
          birthDate: detail.birthDate,
          slug: slugify(mep.givenName, mep.familyName),
        })
        .returning();
      officialId = inserted!.id;
      created = true;
    }
  }

  if (detail.currentParliamentaryMandate) {
    const { startDate, endDate } = detail.currentParliamentaryMandate;
    const existingMandate = await db
      .select({ id: mandates.id })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, 'eurodepute'),
          eq(mandates.startDate, startDate),
        ),
      )
      .limit(1);

    if (existingMandate.length === 0) {
      await db.insert(mandates).values({
        officialId,
        type: 'eurodepute',
        startDate,
        endDate,
        politicalGroup: mep.politicalGroup,
        legislature: CURRENT_LEGISLATURE,
      });
    } else {
      await db
        .update(mandates)
        .set({
          endDate,
          politicalGroup: mep.politicalGroup,
          legislature: CURRENT_LEGISLATURE,
          updatedAt: new Date(),
        })
        .where(eq(mandates.id, existingMandate[0].id));
    }
  }

  if (mep.politicalGroup) {
    await upsertAffiliation(db, {
      officialId,
      kind: 'european_group',
      partyOrGroup: mep.politicalGroup,
      startDate:
        detail.currentParliamentaryMandate?.startDate ??
        new Date().toISOString().split('T')[0],
    });
  }

  if (nationalPartyLabel && detail.currentNationalPartyStartDate) {
    await upsertAffiliation(db, {
      officialId,
      kind: 'national_party',
      partyOrGroup: nationalPartyLabel,
      startDate: detail.currentNationalPartyStartDate,
    });
  }

  await writeProvenance(db, {
    sourceTable: 'officials',
    sourceRecordId: `europarl:${mep.id}`,
    sourceName: SOURCE_NAME,
    sourceUrl: `https://www.europarl.europa.eu/meps/fr/${mep.id}`,
    legalBasis: LEGAL_BASIS,
    rawData: { mep, detail, nationalPartyLabel },
  });

  return { officialId, created };
}

async function upsertAffiliation(
  db: NeonHttpDatabase,
  opts: {
    officialId: string;
    kind: 'european_group' | 'national_party';
    partyOrGroup: string;
    startDate: string;
  },
): Promise<void> {
  const current = await db
    .select({ id: affiliations.id, partyOrGroup: affiliations.partyOrGroup })
    .from(affiliations)
    .where(
      and(
        eq(affiliations.officialId, opts.officialId),
        eq(affiliations.kind, opts.kind),
        isNull(affiliations.endDate),
      ),
    );

  const active = current.find((a) => a.partyOrGroup === opts.partyOrGroup);
  if (active) return;

  const today = new Date().toISOString().split('T')[0];
  for (const aff of current) {
    await db
      .update(affiliations)
      .set({ endDate: today, updatedAt: new Date() })
      .where(eq(affiliations.id, aff.id));
  }

  await db.insert(affiliations).values({
    officialId: opts.officialId,
    kind: opts.kind,
    partyOrGroup: opts.partyOrGroup,
    startDate: opts.startDate,
  });
}

export interface MepUpsertSummary {
  created: number;
  linked: number;
  errors: number;
}

export async function upsertMeps(
  db: NeonHttpDatabase,
  inputs: MepUpsertInput[],
): Promise<MepUpsertSummary> {
  const summary: MepUpsertSummary = { created: 0, linked: 0, errors: 0 };

  for (const input of inputs) {
    try {
      const result = await upsertMep(db, input);
      if (result.created) summary.created++;
      else summary.linked++;
    } catch (error) {
      logger.error(
        `MEP ${input.mep.id} (${input.mep.givenName} ${input.mep.familyName}): ${error}`,
      );
      summary.errors++;
    }
  }

  return summary;
}
