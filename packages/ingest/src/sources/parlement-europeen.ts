/**
 * Eurodéputés français de la législature en cours (open data du Parlement
 * européen).
 *
 * Source : API v2 `data.europarl.europa.eu` (JSON-LD) :
 * - `/meps/show-current` : tous les eurodéputés en exercice, filtrés sur le
 *   pays de représentation FR ;
 * - `/meps/{id}` : détail d'un eurodéputé (date de naissance, liste de ses
 *   appartenances : Parlement, groupe, parti national…) ;
 * - `/corporate-bodies/{id}` : libellé d'une organisation (parti national).
 * Les réponses sont validées par des schémas Zod locaux.
 *
 * Extrait : `FrenchMep` (identité + groupe politique européen), `MepDetail`
 * (mandat de la législature courante, parti national actif), libellés
 * d'organisations.
 *
 * Pièges :
 * - La législature est figée par CURRENT_LEGISLATURE (10 = 2024-2029).
 * - Les clés JSON-LD portent parfois un préfixe (`api:political-group`).
 * - `bday` peut valoir "" : normalisé en null.
 * - Ordre des paramètres : `fetchFn` d'abord, puis l'identifiant.
 *
 * Appelé par run-europe.ts via upsert/meps.ts.
 */
import { z } from 'zod/v4';

const API_BASE = 'https://data.europarl.europa.eu/api/v2';

// Législature en cours (mandats 2024-2029). Élargir à `parliamentary-term`
// antérieurs est prévu par le ticket mais laissé à une itération ultérieure :
// cela suppose de résoudre l'historique des groupes/partis pour chaque
// législature, ce que l'API ne facilite pas (labels d'organisations à
// résoudre un par un, cf. fetchOrganizationLabel).
export const CURRENT_LEGISLATURE = 10;
const CURRENT_LEGISLATURE_ORG = `org/ep-${CURRENT_LEGISLATURE}`;

const COUNTRY_FRANCE = 'FR';
const ROLE_MEMBER_PARLIAMENT = 'def/ep-roles/MEMBER_PARLIAMENT';
const CLASSIFICATION_NATIONAL_PARTY =
  'def/ep-entities/NATIONAL_POLITICAL_GROUP';

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
  /** Identifiant numérique EP (`identifier`), sans le préfixe `person/`. */
  id: string;
  familyName: string;
  givenName: string;
  politicalGroup: string | null;
}

/** Eurodéputés français en exercice. Lève sur erreur HTTP. */
export async function fetchCurrentFrenchMeps(
  fetchFn: typeof fetch = fetch,
): Promise<FrenchMep[]> {
  const response = await fetchFn(jsonLdUrl('/meps/show-current'));
  if (!response.ok) {
    throw new Error(
      `Parlement européen /meps/show-current error: ${response.status}`,
    );
  }
  const json = await response.json();
  const parsed = MepListSchema.parse(json);

  return parsed.data
    .filter((mep) => mep['api:country-of-representation'] === COUNTRY_FRANCE)
    .map((mep) => ({
      id: mep.identifier,
      familyName: mep.familyName,
      givenName: mep.givenName,
      politicalGroup: mep['api:political-group'] ?? null,
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

/**
 * Détail d'un eurodéputé : date de naissance, mandat de la législature en
 * cours et parti national sans date de fin. Lève sur erreur HTTP ou réponse
 * vide.
 */
export async function fetchMepDetail(
  fetchFn: typeof fetch = fetch,
  id: string,
): Promise<MepDetail> {
  const response = await fetchFn(jsonLdUrl(`/meps/${id}`));
  if (!response.ok) {
    throw new Error(`Parlement européen /meps/${id} error: ${response.status}`);
  }
  const json = await response.json();
  const parsed = MepDetailResponseSchema.parse(json);
  const mep = parsed.data[0]!;

  const parliamentaryMandate = mep.hasMembership.find(
    (membership) =>
      membership.role === ROLE_MEMBER_PARLIAMENT &&
      membership.organization === CURRENT_LEGISLATURE_ORG,
  );

  const nationalParty = mep.hasMembership.find(
    (membership) =>
      membership.membershipClassification === CLASSIFICATION_NATIONAL_PARTY &&
      !membership.memberDuring?.endDate,
  );

  return {
    id: mep.identifier,
    // L'API renvoie parfois "" plutôt que d'omettre le champ : normalisé en
    // null dès la source pour ne jamais insérer une chaîne vide dans une
    // colonne `date` (échec en base sinon).
    birthDate: mep.bday || null,
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

/**
 * Résout le libellé d'une organisation (ex. parti national) à partir de son
 * id numérique ("org/6727" -> "6727"). Renvoie null sur erreur HTTP ou
 * réponse inattendue (ne lève pas). Mise en cache côté appelant recommandée :
 * plusieurs élus partagent le même parti.
 */
export async function fetchOrganizationLabel(
  fetchFn: typeof fetch = fetch,
  orgId: string,
): Promise<string | null> {
  const numericId = orgId.replace(/^org\//, '');
  const response = await fetchFn(jsonLdUrl(`/corporate-bodies/${numericId}`));
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = OrganizationResponseSchema.safeParse(json);
  return parsed.success ? parsed.data.data[0]!.label : null;
}
