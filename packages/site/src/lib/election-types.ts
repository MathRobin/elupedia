export type ElectionType = 'municipale' | 'legislative' | 'senatoriale';

export type PanoramaCandidate = {
  nom: string;
  prenom: string;
  nuance: string | null;
  liste: string | null;
  sortant: boolean;
  elected: boolean | null;
  scope: string; // commune ou département
  hasProfile: boolean;
  profileSlug: string | null;
  profilePhotoUrl: string | null;
};

export type ElectionEvent = {
  type: ElectionType;
  id: string; // slug utilisé dans /elections/[type]/[id]
  label: string;
  electionDate: string;
  round: number;
  candidateCount: number;
  scopeCount: number; // nb de communes/départements concernés
};
