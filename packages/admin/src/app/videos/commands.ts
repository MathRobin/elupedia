/**
 * Commandes shell applicables à un short, pour le panneau « Commandes » de la
 * page de détail : chaque entrée reprend une commande de packages/shorts avec
 * l'identifiant déjà renseigné et l'explication de son effet. `relevant`
 * signale l'étape attendue dans l'état actuel du short ; les autres restent
 * listées, pour corriger ou refaire. Toutes se lancent depuis la racine du
 * dépôt, sur la machine de rendu (celle qui porte le dossier de sortie).
 * Module client (sans accès serveur) ; tenu en cohérence avec les `--help`
 * des CLI de packages/shorts et avec packages/shorts/README.md.
 */

export interface VideoCommand {
  command: string;
  title: string;
  what: string;
  /** Étape attendue maintenant, d'après l'état du short. */
  relevant: boolean;
  /** À manier avec précaution (dépense, écrasement, publication). */
  caution?: string;
}

export interface VideoCommandGroup {
  label: string;
  commands: VideoCommand[];
}

export interface VideoState {
  status: string;
  hasScript: boolean;
  hasVoiceover: boolean;
  hasVideo: boolean;
  youtubeVideoId: string | null;
}

const P = 'yarn --cwd packages/shorts';

export function videoCommands(id: string, s: VideoState): VideoCommandGroup[] {
  const published = s.status === 'published';
  const approved = s.status === 'approved';
  const open = !published && s.status !== 'rejected';
  const needsScript = open && !s.hasScript;
  const needsVoice = open && s.hasScript && !s.hasVoiceover;
  const needsRender = open && s.hasScript && s.hasVoiceover && !s.hasVideo;
  const needsReview = s.status === 'draft' && s.hasVideo;

  return [
    {
      label: 'Tout enchaîner',
      commands: [
        {
          command: `${P} make ${id}`,
          title: 'Faire le short de bout en bout',
          what: "Décide seul des étapes utiles : génère le script s'il manque, importe la voix si les prises sont complètes (ou plus récentes que l'import), rend la vidéo si elle manque ou si le script ou la voix ont changé. S'arrête en écrivant la fiche de lecture si des prises manquent. Relançable à volonté ; ne fait rien si tout est à jour.",
          relevant: open && !needsReview,
        },
        {
          command: `${P} make ${id} --dry-run`,
          title: 'Voir ce que make ferait',
          what: 'Affiche les étapes prévues sans rien exécuter ni écrire.',
          relevant: false,
        },
        {
          command: `${P} make ${id} --silent`,
          title: 'Rendre sans attendre la voix',
          what: 'Comme make, mais rend une vidéo muette avec des sous-titres à horodatage estimé si les prises manquent. Utile pour vérifier le visuel avant d’enregistrer.',
          relevant: false,
        },
      ],
    },
    {
      label: 'Script',
      commands: [
        {
          command: `${P} script --id ${id}`,
          title: 'Générer le script',
          what: "Écrit le script (scènes, voix off, textes à l'écran) via l'API Claude à partir des seuls faits du scrutin, le valide (chiffres existants, vocabulaire, durée, débit, noms de groupes, résultat énoncé) et passe le short en brouillon. Nécessite ANTHROPIC_API_KEY.",
          relevant: needsScript,
          caution: 'Appel payant à l’API (quelques centimes).',
        },
        {
          command: `${P} script --id ${id} --force`,
          title: 'Regénérer le script',
          what: 'Remplace le script existant. La voix déjà enregistrée ne correspond plus aux textes : il faudra réenregistrer et réimporter.',
          relevant: false,
          caution: 'Écrase le script ; la voix et la vidéo sont à refaire.',
        },
        {
          command: `${P} script --id ${id} --dry-run`,
          title: 'Essayer un script sans l’enregistrer',
          what: 'Génère et affiche le script sans rien écrire en base.',
          relevant: false,
          caution: 'Appel payant à l’API malgré le dry-run.',
        },
      ],
    },
    {
      label: 'Voix off (enregistrée par vos soins)',
      commands: [
        {
          command: `${P} voiceover sheet --id ${id}`,
          title: 'Fiche de lecture',
          what: `Écrit packages/shorts/out/${id}/lecture.txt (texte à lire par scène, durée prévue, nombre de mots) et crée le dossier recordings/ où déposer une prise par scène, nommée scene-<identifiant>.wav (mp3, m4a, flac, ogg acceptés).`,
          relevant: needsVoice,
        },
        {
          command: `${P} voiceover import --id ${id}`,
          title: 'Importer les prises',
          what: 'Recadre le silence de tête et de queue, normalise le volume (-16 LUFS), horodate les mots pour les sous-titres et enregistre la voix off. Échoue clairement si une prise manque ou est vide.',
          relevant: needsVoice,
        },
        {
          command: `${P} voiceover import --id ${id} --from <dossier>`,
          title: 'Importer depuis un autre dossier',
          what: 'Même chose, en lisant les prises dans le dossier indiqué plutôt que dans recordings/.',
          relevant: false,
        },
      ],
    },
    {
      label: 'Rendu vidéo',
      commands: [
        {
          command: `${P} render --id ${id}`,
          title: 'Rendre la vidéo',
          what: `Produit packages/shorts/out/${id}/short.mp4 (1080×1920, H.264), la miniature thumbnail.png et le texte d'accompagnement description.txt, à partir du script et de la voix importée. Sans voix, rend muet avec sous-titres estimés.`,
          relevant: needsRender,
        },
        {
          command: `${P} render --id ${id} --force`,
          title: 'Rendre à nouveau',
          what: 'Refait la vidéo même si elle existe déjà (après un nouveau script, une nouvelle voix ou une retouche de la composition).',
          relevant: false,
          caution: 'Remplace short.mp4 et thumbnail.png.',
        },
        {
          command: `${P} render --id ${id} --force --draft`,
          title: 'Rendu rapide de contrôle',
          what: 'Même rendu à l’échelle 0,5 et en qualité réduite, en une fraction du temps, pour vérifier le visuel.',
          relevant: false,
          caution:
            'Remplace la vidéo par une version basse qualité : refaire un rendu normal avant publication.',
        },
      ],
    },
    {
      label: 'Revue (seul gate manuel)',
      commands: [
        {
          command: `${P} review approve ${id}`,
          title: 'Approuver',
          what: 'Passe le short en approuvé : il sera publié par le prochain passage de publish (DAG quotidien ou commande ci-dessous). Refusé sans vidéo rendue.',
          relevant: needsReview,
        },
        {
          command: `${P} review reject ${id} --note "motif"`,
          title: 'Rejeter',
          what: 'Écarte le short ; le motif est conservé dans ses notes.',
          relevant: needsReview,
        },
        {
          command: `${P} review list --status all`,
          title: 'Lister les shorts',
          what: 'Affiche tous les shorts avec leur statut, scrutin, voix off et chemin de vidéo (ce que montre cette interface).',
          relevant: false,
        },
      ],
    },
    {
      label: 'Publication YouTube',
      commands: [
        {
          command: `${P} publish --id ${id} --dry-run`,
          title: 'Vérifier avant de publier',
          what: "Affiche le titre, la visibilité et le fichier qui seraient envoyés, sans appel à YouTube. Contrôle aussi que les faits du scrutin n'ont pas changé depuis le script.",
          relevant: approved,
        },
        {
          command: `${P} publish --id ${id}`,
          title: 'Publier maintenant',
          what: 'Met la vidéo en ligne sur YouTube avec le texte d’accompagnement, enregistre l’identifiant YouTube et passe le short en publié, puis envoie la miniature. Refuse si le short n’est pas approuvé ou si les faits ont changé depuis le script. Nécessite YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et YOUTUBE_REFRESH_TOKEN.',
          relevant: approved,
          caution:
            'Publication publique par défaut (YOUTUBE_PRIVACY_STATUS ou --privacy pour unlisted/private).',
        },
        {
          command: `${P} publish --id ${id} --privacy unlisted`,
          title: 'Publier en non répertorié',
          what: 'Même publication, visible seulement avec le lien.',
          relevant: false,
        },
      ],
    },
  ];
}
