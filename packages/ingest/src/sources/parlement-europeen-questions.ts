const API_BASE = 'https://data.europarl.europa.eu/api/v2';

function jsonLdUrl(path: string): string {
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}format=application%2Fld%2Bjson`;
}

// Vérifié en conditions réelles (29/09/2026) sur /api/v2/controlled-vocabularies/ep-document-types :
// pas d'équivalent AN/Sénat pour les interpellations (grandes/petites), regroupées
// sous un seul type faute de mandat de les distinguer plus finement (cf. ticket M24T5).
const WORK_TYPE_TO_ACTIVITY_TYPE: Record<
  string,
  'written_question' | 'oral_question' | 'interpellation'
> = {
  QUESTION_WRITTEN: 'written_question',
  QUESTION_WRITTEN_PRIORITY: 'written_question',
  QUESTION_ORAL: 'oral_question',
  QUESTION_TIME: 'oral_question',
  QUESTION_INTERPELLATION: 'interpellation',
  INTERPELLATION_MAJOR: 'interpellation',
  INTERPELLATION_MINOR: 'interpellation',
};

// Organisations destinataires les plus fréquentes (Conseil, Commission).
// Une organisation non répertoriée laisse `addressee` à null plutôt que
// d'afficher un id technique brut (org/xxx) sur la fiche élu.
const ADDRESSEE_LABELS: Record<string, string> = {
  'org/CS': 'Conseil',
  'org/EU_COUNCIL': 'Conseil',
  'org/COM': 'Commission',
  'org/EU_COMMISSION': 'Commission',
  'org/VP/HR': 'Vice-présidente de la Commission / Haute Représentante',
};

export interface EuropeQuestionListItem {
  identifier: string;
  workType: string;
}

export interface EuropeQuestion {
  identifier: string;
  type: 'written_question' | 'oral_question' | 'interpellation';
  title: string;
  date: string;
  /** person/{europarl_id} des auteurs — plusieurs en cas de cosignature. */
  authorPersonIds: string[];
  addressee: string | null;
  responseDate: string | null;
  sourceUrl: string;
}

interface RawParticipation {
  participation_role?: string;
  had_participant_person?: string[];
  had_participant_organization?: string[];
}

interface RawQuestionDoc {
  identifier: string;
  document_date: string;
  work_type?: string;
  title_dcterms?: Record<string, string>;
  workHadParticipation?: RawParticipation[];
  inverse_answers_to?: { document_date?: string }[];
}

function stripPrefix(uri: string | undefined, prefix: string): string {
  return uri?.startsWith(prefix) ? uri.slice(prefix.length) : (uri ?? '');
}

function pickTitle(titleDcterms: Record<string, string> | undefined): string {
  if (!titleDcterms) return '';
  return (
    titleDcterms.fr ?? titleDcterms.en ?? Object.values(titleDcterms)[0] ?? ''
  );
}

function resolveAddressee(participations: RawParticipation[]): string | null {
  const addressee = participations.find(
    (p) => p.participation_role === 'def/ep-roles/ADDRESSEE',
  );
  const orgId = addressee?.had_participant_organization?.[0];
  if (!orgId) return null;
  return ADDRESSEE_LABELS[orgId] ?? null;
}

/**
 * Liste paginée (le seul mode d'accès : pas de filtre serveur par auteur —
 * vérifié le 29/09/2026, le paramètre `creator` est ignoré). Chaque élément
 * ne porte que l'identifiant : l'auteur n'est connu qu'en récupérant le
 * détail (fetchQuestionDetail).
 */
export async function fetchQuestionsListPage(
  offset: number,
  limit: number,
  fetchFn: typeof fetch = fetch,
): Promise<EuropeQuestionListItem[]> {
  const res = await fetchFn(
    jsonLdUrl(`/parliamentary-questions?offset=${offset}&limit=${limit}`),
  );
  if (!res.ok) {
    throw new Error(
      `Parlement européen /parliamentary-questions error: ${res.status} ${res.statusText}`,
    );
  }
  const json = await res.json();
  const items: { identifier: string; work_type?: string }[] = json.data ?? [];
  return items
    .filter((item) => typeof item.work_type === 'string')
    .map((item) => ({
      identifier: item.identifier,
      workType: stripPrefix(item.work_type, 'def/ep-document-types/'),
    }));
}

/**
 * Détail d'une question : auteur(s), destinataire, date de réponse si
 * disponible. Renvoie null pour un work_type qui n'est pas une question
 * (ex. un document de réponse retourné isolément par la liste) ou sans
 * auteur exploitable.
 */
export async function fetchQuestionDetail(
  identifier: string,
  fetchFn: typeof fetch = fetch,
): Promise<EuropeQuestion | null> {
  const res = await fetchFn(
    jsonLdUrl(`/parliamentary-questions/${identifier}`),
  );
  if (!res.ok) return null;

  const json = await res.json();
  const doc: RawQuestionDoc | undefined = json.data?.[0];
  if (!doc) return null;

  const rawType = stripPrefix(doc.work_type, 'def/ep-document-types/');
  const type = WORK_TYPE_TO_ACTIVITY_TYPE[rawType];
  if (!type) return null;

  const participations = doc.workHadParticipation ?? [];
  const authorPersonIds = participations
    .filter((p) => p.participation_role === 'def/ep-roles/AUTHOR')
    .flatMap((p) => p.had_participant_person ?? []);

  if (authorPersonIds.length === 0) return null;

  const answer = doc.inverse_answers_to?.[0];

  return {
    identifier: doc.identifier,
    type,
    title: pickTitle(doc.title_dcterms),
    date: doc.document_date,
    authorPersonIds,
    addressee: resolveAddressee(participations),
    responseDate: answer?.document_date ?? null,
    // Page officielle de rendu HTML du document (vérifiée en conditions
    // réelles) : le texte de la question n'est jamais en JSON structuré
    // (uniquement en pièce jointe DOCX/PDF, cf. investigation M24T1), donc
    // pas de questionText/responseText ingérés — seul ce lien est fourni,
    // même logique que M24T6 pour les déclarations d'intérêts.
    sourceUrl: `https://www.europarl.europa.eu/doceo/document/${doc.identifier}_FR.html`,
  };
}
