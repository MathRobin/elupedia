import { z } from 'zod/v4';

const API_BASE = 'https://data.europarl.europa.eu/api/v2';

// Législature en cours (mandats 2024-2029). Élargir à `parliamentary-term`
// antérieurs est prévu par le ticket mais laissé à une itération ultérieure :
// cela suppose de résoudre l'historique des groupes/partis pour chaque
// législature, ce que l'API ne facilite pas (labels d'organisations à
// résoudre un par un, cf. fetchOrganizationLabel).
export const CURRENT_LEGISLATURE = 10;
const CURRENT_LEGISLATURE_ORG = `org/ep-${CURRENT_LEGISLATURE}`;

function jsonLdUrl(path: string): string {
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}format=application%2Fld%2Bjson`;
}

const MepListItemSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  familyName: z.string(),
  givenName: z.string(),
  'api:country-of-representation': z.string(),
  'api:political-group': z.string().optional(),
});

const MepListSchema = z.object({
  data: z.array(MepListItemSchema),
});

export interface FrenchMep {
  id: string;
  familyName: string;
  givenName: string;
  politicalGroup: string | null;
}

export async function fetchCurrentFrenchMeps(
  fetchFn: typeof fetch = fetch,
): Promise<FrenchMep[]> {
  const res = await fetchFn(jsonLdUrl('/meps/show-current'));
  if (!res.ok) {
    throw new Error(
      `Parlement européen /meps/show-current error: ${res.status}`,
    );
  }
  const json = await res.json();
  const parsed = MepListSchema.parse(json);

  return parsed.data
    .filter((m) => m['api:country-of-representation'] === 'FR')
    .map((m) => ({
      id: m.identifier,
      familyName: m.familyName,
      givenName: m.givenName,
      politicalGroup: m['api:political-group'] ?? null,
    }));
}

const PeriodSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const MembershipSchema = z.object({
  organization: z.string().optional(),
  role: z.string().optional(),
  membershipClassification: z.string().optional(),
  memberDuring: PeriodSchema.optional(),
});

const MepDetailSchema = z.object({
  identifier: z.string(),
  bday: z.string().optional(),
  hasMembership: z.array(MembershipSchema).default([]),
});

const MepDetailResponseSchema = z.object({
  data: z.array(MepDetailSchema).min(1),
});

export interface MepDetail {
  id: string;
  birthDate: string | null;
  /** Mandat parlementaire pour la législature en cours, s'il existe. */
  currentParliamentaryMandate: {
    startDate: string;
    endDate: string | null;
  } | null;
  /** Organisation du parti national actuellement actif (membershipClassification NATIONAL_POLITICAL_GROUP), à résoudre via fetchOrganizationLabel. */
  currentNationalPartyOrgId: string | null;
  currentNationalPartyStartDate: string | null;
}

export async function fetchMepDetail(
  fetchFn: typeof fetch = fetch,
  id: string,
): Promise<MepDetail> {
  const res = await fetchFn(jsonLdUrl(`/meps/${id}`));
  if (!res.ok) {
    throw new Error(`Parlement européen /meps/${id} error: ${res.status}`);
  }
  const json = await res.json();
  const parsed = MepDetailResponseSchema.parse(json);
  const mep = parsed.data[0]!;

  const parliamentaryMandate = mep.hasMembership.find(
    (m) =>
      m.role === 'def/ep-roles/MEMBER_PARLIAMENT' &&
      m.organization === CURRENT_LEGISLATURE_ORG,
  );

  const nationalParty = mep.hasMembership.find(
    (m) =>
      m.membershipClassification ===
        'def/ep-entities/NATIONAL_POLITICAL_GROUP' && !m.memberDuring?.endDate,
  );

  return {
    id: mep.identifier,
    birthDate: mep.bday ?? null,
    currentParliamentaryMandate: parliamentaryMandate?.memberDuring?.startDate
      ? {
          startDate: parliamentaryMandate.memberDuring.startDate,
          endDate: parliamentaryMandate.memberDuring.endDate ?? null,
        }
      : null,
    currentNationalPartyOrgId: nationalParty?.organization ?? null,
    currentNationalPartyStartDate:
      nationalParty?.memberDuring?.startDate ?? null,
  };
}

const OrganizationSchema = z.object({
  id: z.string(),
  label: z.string(),
});

const OrganizationResponseSchema = z.object({
  data: z.array(OrganizationSchema).min(1),
});

/** Résout le libellé d'une organisation (ex. parti national) à partir de son id numérique ("org/6727" -> "6727"). Mise en cache côté appelant recommandée : plusieurs élus partagent le même parti. */
export async function fetchOrganizationLabel(
  fetchFn: typeof fetch = fetch,
  orgId: string,
): Promise<string | null> {
  const numericId = orgId.replace(/^org\//, '');
  const res = await fetchFn(jsonLdUrl(`/corporate-bodies/${numericId}`));
  if (!res.ok) return null;
  const json = await res.json();
  const parsed = OrganizationResponseSchema.safeParse(json);
  return parsed.success ? parsed.data.data[0]!.label : null;
}
