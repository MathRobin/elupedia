import { z } from 'zod/v4';

// ── Assemblée nationale / Sénat (Open Data AN) ──

export const IdentSchema = z.object({
  civ: z.string(),
  prenom: z.string(),
  nom: z.string(),
});

export const InfoNaissanceSchema = z.object({
  dateNais: z.string().optional().nullable(),
  villeNais: z.string().optional().nullable(),
  depNais: z.string().optional().nullable(),
});

export const EtatCivilSchema = z.object({
  ident: IdentSchema,
  infoNaissance: InfoNaissanceSchema,
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
  organes: z.object({ organeRef: z.string() }).optional().nullable(),
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
});

export type CommitteeItem = z.infer<typeof CommitteeItemSchema>;

// ── HATVP ──

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
});

export const DeclarationSchema = z.object({
  nom: z.string(),
  prenom: z.string(),
  date_depot: z.string(),
  interests: z.array(InterestItemSchema),
});

export type InterestItem = z.infer<typeof InterestItemSchema>;
export type Declaration = z.infer<typeof DeclarationSchema>;

// ── Élections (data.gouv.fr) ──

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
