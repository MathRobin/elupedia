# Licences des données

Inventaire des sources de données utilisées par Elupedia et de leurs conditions de réutilisation.

## Sources actives

### data.assemblee-nationale.fr

- **Éditeur** : Assemblée nationale
- **Licence** : Licence Ouverte / Open Licence 2.0 (Etalab)
- **Obligations** :
  - Attribution obligatoire : mentionner la source (Assemblée nationale)
  - Pas de restriction sur l'usage commercial
- **URL** : https://data.assemblee-nationale.fr
- **Jeux de données utilisés** :
  - **AMO30** — Tous les acteurs (députés historiques) : ZIP/JSON
  - **AMO10** — Députés actifs, mandats actifs, organes : ZIP/JSON (adresses et contacts)
  - **Questions écrites** : ZIP/JSON (~17 800 fichiers)
  - **Questions au gouvernement** : ZIP/JSON (~1 800 fichiers)
  - **Collaborateurs parlementaires** : CSV

### HATVP

- **Éditeur** : Haute Autorité pour la Transparence de la Vie Publique
- **Licence** : Licence Ouverte / Open Licence 2.0 (Etalab)
- **Obligations** :
  - Attribution obligatoire : mentionner la HATVP comme source
  - Pas de restriction sur l'usage commercial
- **URL** : https://www.hatvp.fr/open-data/
- **Jeux de données utilisés** :
  - **declarations.xml** — Déclarations d'intérêts des élus soumis à obligation : XML streaming

### data.senat.fr

- **Éditeur** : Sénat
- **Licence** : Licence Ouverte / Open Licence 2.0 (Etalab)
- **Obligations** :
  - Attribution obligatoire : mentionner le Sénat comme source
  - Pas de restriction sur l'usage commercial
- **URL** : https://data.senat.fr
- **Jeux de données utilisés** :
  - **Sénateurs en exercice** : API JSON (identité, mandats)
  - **Scrutins publics** : API JSON (votes, résultats)
  - **Groupes politiques** : API JSON (composition, appartenances)
  - **Collaborateurs** : API JSON (collaborateurs déclarés)
  - **Adresses/contacts** : API JSON (coordonnées)
  - **Historique électoral** : API JSON (résultats par sénateur)

### Google Actualités (presse)

- **Éditeur** : Google
- **Nature** : Flux RSS public (pas une API officielle, pas de clé)
- **Licence** : Aucune licence open data — les flux RSS sont publiquement accessibles mais les articles liés restent la propriété de leurs éditeurs respectifs
- **Obligations** :
  - Élupedia ne republie pas le contenu des articles, uniquement le titre et le lien vers la source originale
  - Chaque mention renvoie vers le site de l'éditeur de presse
- **URL** : https://news.google.com/rss/
- **Données collectées** :
  - Titre de l'article, nom de la source, URL de l'article, date de publication
- **Remarque** : Cette source n'est pas institutionnelle. Les résultats de recherche peuvent contenir des faux positifs (homonymes) et ne sont pas exhaustifs.

### OpenStreetMap (cartes statiques)

- **Éditeur** : Fondation OpenStreetMap et contributeurs
- **Licence** : ODbL (Open Database License) pour les données, CC BY-SA 2.0 pour les tuiles cartographiques
- **Obligations** :
  - Attribution obligatoire : « © OpenStreetMap » affiché sur chaque carte générée
  - Partage à l'identique si redistribution de la base de données dérivée
- **URL** : https://www.openstreetmap.org
- **Utilisation** : tuiles cartographiques (`tile.openstreetmap.org`) pour générer des images PNG statiques de localisation des adresses d'élus au moment du build

### API Adresse (géocodage)

- **Éditeur** : Etalab / DINUM
- **Licence** : Licence Ouverte / Open Licence 2.0 (Etalab)
- **Obligations** :
  - Attribution obligatoire : mentionner la source
  - Pas de restriction sur l'usage commercial
- **URL** : https://api-adresse.data.gouv.fr
- **Utilisation** : géocodage des adresses de mairies et permanences en coordonnées GPS (latitude, longitude)

## Sources prévues (non encore actives)

### data.gouv.fr (résultats électoraux AN)

- **Éditeur** : Ministère de l'Intérieur (via data.gouv.fr)
- **Licence** : Licence Ouverte / Open Licence 2.0 (Etalab)
- **Obligations** :
  - Attribution obligatoire : mentionner la source
  - Pas de restriction sur l'usage commercial
- **URL** : https://www.data.gouv.fr
- **Statut** : source API à câbler

## Résumé des obligations

| Source              | Licence             | Attribution | Usage commercial | Statut    |
| ------------------- | ------------------- | ----------- | ---------------- | --------- |
| Assemblée nationale | Licence Ouverte 2.0 | Oui         | Autorisé         | ✅ active |
| HATVP               | Licence Ouverte 2.0 | Oui         | Autorisé         | ✅ active |
| Sénat               | Licence Ouverte 2.0 | Oui         | Autorisé         | ✅ active |
| Google Actualités   | RSS public          | N/A         | Titres + liens   | ✅ active |
| OpenStreetMap       | ODbL / CC BY-SA 2.0 | Oui         | Autorisé         | ✅ active |
| API Adresse         | Licence Ouverte 2.0 | Oui         | Autorisé         | ✅ active |
| data.gouv.fr        | Licence Ouverte 2.0 | Oui         | Autorisé         | ⏸ prévue  |

## Licence du code source

Le code source d'Elupedia est distribué sous licence **GNU Affero General Public License v3.0 (AGPL-3.0)**. Voir le fichier [LICENSE](../LICENSE) à la racine du dépôt.
