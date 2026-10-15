/**
 * Schémas zod des formats d'échange entre les modules sources/ et upsert/ :
 * d'une part la forme brute des exports open data de l'AN (acteurs, organes),
 * d'autre part les formes intermédiaires normalisées (commissions, intérêts
 * HATVP, résultats électoraux) produites par les sources et consommées par
 * les upserts. Les types TypeScript exportés en sont dérivés (z.infer).
 *
 * Piège AN : l'export JSON est une conversion automatique du XML. Un élément
 * vide n'y devient pas `null` mais un objet d'attributs (`{ "@xsi:nil": "true" }`),
 * d'où les `z.union([z.string(), z.record(...)])` sur les champs optionnels,
 * et `uid` qui arrive sous la forme `{ "#text": "PA1234" }` pour les acteurs.
 */
import { z } from 'zod/v4';

// ── Assemblée nationale / Sénat (Open Data AN) ──

export const IdentSchema = z.object({
  civ: z.string(),
  prenom: z.string(),
  nom: z.string(),
});

export const InfoNaissanceSchema = z.object({
  dateNais: z
    .union([z.string(), z.record(z.string(), z.string())])
    .optional()
    .nullable(),
  villeNais: z
    .union([z.string(), z.record(z.string(), z.string())])
    .optional()
    .nullable(),
  depNais: z
    .union([z.string(), z.record(z.string(), z.string())])
    .optional()
    .nullable(),
});

export const EtatCivilSchema = z.object({
  ident: IdentSchema,
  infoNaissance: InfoNaissanceSchema,
  dateDeces: z
    .union([z.string(), z.record(z.string(), z.string())])
    .optional()
    .nullable(),
});

export const ElectionLieuSchema = z.object({
  region: z.string().optional().nullable(),
  departement: z.string().optional().nullable(),
  numDepartement: z.string().optional().nullable(),
  numCirco: z.string().optional().nullable(),
});

export const MandatSchema = z.object({
  uid: z.string(),
  legislature: z.string().optional().nullable(),
  typeOrgane: z.string(),
  dateDebut: z.string(),
  dateFin: z.string().optional().nullable(),
  organes: z
    .object({ organeRef: z.union([z.string(), z.array(z.string())]) })
    .optional()
    .nullable(),
  election: z.object({ lieu: ElectionLieuSchema }).optional().nullable(),
});

export const ActeurSchema = z.object({
  uid: z.object({ '#text': z.string() }),
  etatCivil: EtatCivilSchema,
  mandats: z.object({
    mandat: z.union([z.array(MandatSchema), MandatSchema]),
  }),
});

export const ActeurFileSchema = z.object({
  acteur: ActeurSchema,
});

export const OrganeSchema = z.object({
  uid: z.string(),
  codeType: z.string(),
  libelleAbrege: z.string().optional().nullable(),
  libelle: z.string().optional().nullable(),
});

export const OrganeFileSchema = z.object({
  organe: OrganeSchema,
});

// ── Commissions ──
// Forme normalisée commune AN + Sénat, produite par sources/an-commissions.ts
// et sources/senat-commissions.ts, consommée par upsert/committees.ts.

export const CommitteeItemSchema = z.object({
  name: z.string(),
  type: z.enum([
    'standing_committee',
    'special_committee',
    'delegation',
    'study_group',
    'friendship_group',
  ]),
  start_date: z.string(),
  end_date: z.string().optional(),
  // uid de l'organe AN (ex. PO854288), absent pour les commissions du Sénat
  an_uid: z.string().optional(),
});

export type CommitteeItem = z.infer<typeof CommitteeItemSchema>;

// ── HATVP ──
// Forme normalisée d'une déclaration d'intérêts (sources/hatvp.ts). Les
// champs `*_date` sont des chaînes ISO ; `full` conserve la rubrique brute
// pour affichage détaillé.

export const InterestItemSchema = z.object({
  category: z.enum([
    'professional_activity',
    'consulting_activity',
    'governing_body_membership',
    'voluntary_activity',
    'elected_function',
    'financial_participation',
  ]),
  type: z.string(),
  entity_name: z.string(),
  role_description: z.string().optional(),
  declared_date: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  full: z.record(z.string(), z.unknown()).optional(),
  declarant_comment: z.string().optional(),
  source_document_url: z.string().optional(),
  ownership_detail: z.string().optional(),
  annual_amount: z.string().optional(),
  amount_year: z.number().int().optional(),
  amount_is_net: z.boolean().optional(),
});

export const DeclarationSchema = z.object({
  nom: z.string(),
  prenom: z.string(),
  date_depot: z.string(),
  interests: z.array(InterestItemSchema),
  declaration_type: z.enum(['initial', 'modification']).optional(),
  source_document_url: z.string().optional(),
});

export type InterestItem = z.infer<typeof InterestItemSchema>;
export type Declaration = z.infer<typeof DeclarationSchema>;

// ── Élections (data.gouv.fr) ──
// Résultat d'un candidat identifié par son id AN (sources/datagouv-elections.ts).

export const ElectionResultSchema = z.object({
  id_an: z.string(),
  election_type: z.string(),
  election_date: z.string(),
  round: z.number().int(),
  score_percent: z.number(),
  opponent_count: z.number().int(),
});

export const ElectionsResponseSchema = z.object({
  results: z.array(ElectionResultSchema),
});

export type ElectionResult = z.infer<typeof ElectionResultSchema>;
