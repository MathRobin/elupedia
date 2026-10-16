# Shorts vidéo

Production de vidéos courtes (YouTube Shorts) sur les scrutins récents de
l'Assemblée nationale et du Sénat, ton factuel et neutre. Le détail des règles
(sélection, script, validation, rendu, accessibilité) est dans
[`docs/DOMAINS.md`](../../docs/DOMAINS.md), section « Shorts vidéo ».

## Flux de travail

```
select → script → voix (toi) → rendu → revue (toi) → publication
auto     auto     manuel       auto     manuel        auto
```

1. **Sélection** (DAG `ingest-votes`, quotidien) : les scrutins récents les plus
   parlants deviennent des candidats.
2. **Script** (DAG) : le modèle écrit le script à partir des seuls faits de la
   base ; un validateur le contrôle (chiffres, ton, durée, noms, résultat).
3. **Voix** (à la main) : tu lis le script et enregistres une prise par scène.
4. **Rendu** : vidéo 1080×1920 avec sous-titres, hémicycle, barres par groupe.
5. **Revue** (à la main) : seul gate avant publication.
6. **Publication** (DAG `publish-shorts`, quotidien) : YouTube, un short par jour.

## Un short de bout en bout : `make`

```bash
yarn --cwd packages/shorts make <id>
```

Enchaîne script (si absent) → import de la voix → rendu, en sautant ce qui est
à jour. Relançable à volonté.

| Situation                             | Ce que fait `make`                               |
| ------------------------------------- | ------------------------------------------------ |
| Pas de script                         | génère le script (nécessite `ANTHROPIC_API_KEY`) |
| Prises manquantes, pas de voix        | écrit la fiche de lecture, s'arrête (code 2)     |
| Prises complètes, voix non importée   | importe la voix, puis rend                       |
| Prise réenregistrée depuis l'import   | réimporte, puis rend                             |
| Script et voix à jour, vidéo présente | ne fait rien                                     |

Options : `--rescript` (refait le script, invalide la voix), `--reimport`,
`--force` (rend même si rien n'a changé), `--silent` (muet, sous-titres
estimés), `--draft` (rendu rapide basse qualité), `--dry-run` (affiche les
étapes sans rien exécuter), `--out <dossier>`.

La revue et la publication restent des commandes à part :

```bash
yarn --cwd packages/shorts review                 # liste les shorts à relire
yarn --cwd packages/shorts review approve <id>    # ou : reject <id> --note "motif"
yarn --cwd packages/shorts publish --dry-run      # puis sans --dry-run
```

## Voir les shorts dans l'admin

`yarn --cwd packages/admin dev` puis http://localhost:3001/videos : liste
filtrable par statut, détail avec script, texte d'accompagnement, scrutin lié
et sources, miniature et vidéo (lues depuis le dossier de sortie, l'admin doit
tourner sur la machine de rendu). Lecture seule.

## Enregistrer la voix

```bash
yarn --cwd packages/shorts voiceover sheet --id <id>   # fiche de lecture
```

La fiche `out/<id>/lecture.txt` donne, par scène, l'identifiant, la durée prévue
et le texte. Enregistre **une prise par scène**, nommée `scene-<identifiant>.wav`
(`scene-s1.wav`, `scene-s2b.wav`…, mp3, m4a, aac, flac et ogg acceptés), dans
`out/<id>/recordings/`.

- Voix posée, au plus 2,6 mots par seconde.
- Marque une vraie pause à chaque point : elle sert à caler les sous-titres.
- Dis les noms de groupes comme écrits (sauf LFI-NFP et LIOT, dits par leur
  sigle), jamais SOC, HOR, GDR, EPR et autres sigles.

Puis `make <id>` (ou `voiceover import --id <id>` seul). L'import recadre le
silence de tête et de queue, normalise le volume (-16 LUFS) et horodate les mots.

## Commandes

| Commande                                            | Rôle                                            |
| --------------------------------------------------- | ----------------------------------------------- |
| `select [--dry-run]`                                | classe les scrutins récents, crée les candidats |
| `script [--id <id>] [--dry-run]`                    | génère le script d'un ou des candidats          |
| `voiceover sheet` / `voiceover import --id <id>`    | fiche de lecture / import des prises            |
| `render [--id <id>] [--force] [--silent] [--draft]` | rend la vidéo et la vignette                    |
| `make <id>`                                         | script → voix → rendu pour un short             |
| `review [list\|approve\|reject]`                    | revue humaine                                   |
| `publish [--max n] [--dry-run]`                     | publication YouTube des shorts approuvés        |
| `youtube-auth`                                      | autorisation OAuth YouTube, une seule fois      |
| `preview`                                           | Remotion Studio pour retoucher la composition   |

Chaque commande accepte `--help`.

## Configuration

Dans le `.env` à la racine (voir `.env.example`) :

| Variable                                                              | Usage                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                                                   | génération des scripts                                                       |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | publication (le dernier vient de `youtube-auth`)                             |
| `YOUTUBE_PRIVACY_STATUS`                                              | `public` (défaut), `unlisted` ou `private`                                   |
| `SHORTS_OUTPUT_DIR`                                                   | dossier des fichiers produits (défaut : `out/`, relatif à `packages/shorts`) |
| `FFMPEG_PATH`, `FFPROBE_PATH`                                         | ffmpeg à utiliser, sinon celui embarqué par Remotion                         |

## Fichiers produits

Dans `out/<id>/` (ignoré par git) : `lecture.txt`, `recordings/` (tes prises),
`scene-*.wav` (prises traitées), `photos/` (portrait de l'auteur du texte),
`short.mp4`, `thumbnail.png` et `description.txt` (texte d'accompagnement : résumé, chiffres, lien Elupedia et sources officielles, repris tel quel à la publication). Un dossier `broll/` avec des images
(`.jpg`, `.png`, `.webp`) sert de fond aux scènes de titre.

Le premier rendu télécharge un Chrome headless (une centaine de Mo).
