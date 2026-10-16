/**
 * Liens vers les pages officielles d'un scrutin, construits à partir de son
 * identifiant (`ballots.an_id`) et du dossier législatif, sans appel réseau.
 * Servent à la fois aux descriptions des shorts (packages/shorts) et à
 * l'interface d'administration. Motifs d'URL vérifiés le 16/10/2026 :
 * - AN : `/dyn/{législature}/scrutins/{n}`, `/dyn/{législature}/dossiers/{ref}`
 * - Sénat : `/scrutin-public/{session}/scr{session}-{n}.html` et l'index.
 * Les scrutins du Parlement européen n'ont pas de page équivalente ici.
 */
export interface BallotSourceLink {
  label: string;
  url: string;
}

export function officialBallotSources(input: {
  anId: string | null;
  dossierRef?: string | null;
}): BallotSourceLink[] {
  const an = input.anId?.match(/^scrutin-VTANR5L(\d+)V(\d+)$/);
  if (an) {
    const [, legislature, numero] = an;
    const links: BallotSourceLink[] = [
      {
        label: `Scrutin n° ${numero}, Assemblée nationale`,
        url: `https://www.assemblee-nationale.fr/dyn/${legislature}/scrutins/${numero}`,
      },
    ];
    if (input.dossierRef) {
      links.push({
        label: 'Dossier législatif, Assemblée nationale',
        url: `https://www.assemblee-nationale.fr/dyn/${legislature}/dossiers/${input.dossierRef}`,
      });
    }
    links.push({
      label:
        'Données ouvertes des scrutins, Assemblée nationale (licence ouverte)',
      url: 'https://data.assemblee-nationale.fr/travaux-parlementaires/votes',
    });
    return links;
  }
  const senat = input.anId?.match(/^senat-scrutin-(\d{4})-(\d+)$/);
  if (senat) {
    const [, session, numero] = senat;
    return [
      {
        label: `Scrutin n° ${numero}, Sénat (session ${session})`,
        url: `https://www.senat.fr/scrutin-public/${session}/scr${session}-${numero}.html`,
      },
      {
        label: `Liste des scrutins publics du Sénat, session ${session}`,
        url: `https://www.senat.fr/scrutin-public/scr${session}.html`,
      },
    ];
  }
  return [];
}
