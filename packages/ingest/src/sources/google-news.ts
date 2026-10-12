/**
 * Mentions presse d'un élu via le flux RSS de recherche Google Actualités.
 *
 * Source : `https://news.google.com/rss/search?q="Prénom Nom"&hl=fr&gl=FR`
 * (XML RSS 2.0, non documenté officiellement). Chaque `<item>` porte un
 * titre au format « Titre de l'article - Nom du média », un lien de
 * redirection Google, une `pubDate` RFC 2822 et une balise `<source>`.
 *
 * Extrait : une `PressMentionData` par item, titre et média séparés, date au
 * format ISO (AAAA-MM-JJ).
 *
 * Pièges :
 * - Parsing SAX non strict (balises en minuscules) ; les titres sont
 *   souvent en CDATA.
 * - Une `pubDate` illisible est remplacée par la date du jour.
 * - Les champs sont tronqués aux tailles des colonnes en base.
 * - Une erreur HTTP renvoie [] sans lever (Google limite parfois le débit).
 *
 * Appelé par run-press.ts / run-press-maires.ts via upsert/press-mentions.ts.
 */
import sax from 'sax';

export interface PressMentionData {
  officialId: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedDate: string;
}

// Tailles des colonnes en base.
const MAX_TITLE_LENGTH = 1024;
const MAX_SOURCE_NAME_LENGTH = 255;
const MAX_SOURCE_URL_LENGTH = 1024;

/** Média affiché quand le titre ne contient pas de suffixe « - Média ». */
const UNKNOWN_SOURCE_NAME = 'Inconnu';

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

/** Items du flux ayant au moins un titre et un lien. */
function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const parser = sax.parser(false, { lowercase: true });

  let inItem = false;
  let currentTag = '';
  let currentItem: RssItem = { title: '', link: '', pubDate: '', source: '' };

  parser.onopentag = (node) => {
    if (node.name === 'item') {
      inItem = true;
      currentItem = { title: '', link: '', pubDate: '', source: '' };
    }
    if (inItem) {
      currentTag = node.name;
      if (node.name === 'source') {
        // L'URL du média est en attribut ; le nom est dans le texte.
        currentItem.source = String(node.attributes.url ?? '');
      }
    }
  };

  parser.ontext = (text) => {
    if (!inItem) return;
    if (currentTag === 'title') currentItem.title += text;
    if (currentTag === 'link') currentItem.link += text;
    if (currentTag === 'pubdate') currentItem.pubDate += text;
    if (currentTag === 'source' && !currentItem.source)
      currentItem.source += text;
  };

  parser.oncdata = (cdata) => {
    if (!inItem) return;
    if (currentTag === 'title') currentItem.title += cdata;
    if (currentTag === 'source') currentItem.source += cdata;
  };

  parser.onclosetag = (name) => {
    if (name === 'item') {
      inItem = false;
      if (currentItem.title && currentItem.link) {
        items.push({ ...currentItem });
      }
    }
    if (inItem) currentTag = '';
  };

  parser.write(xml).close();
  return items;
}

/** « Titre - Média » → { cleanTitle, sourceName }. */
function extractSourceName(title: string): {
  cleanTitle: string;
  sourceName: string;
} {
  const match = title.match(/^(.*)\s+-\s+(.+)$/);
  if (match) {
    return { cleanTitle: match[1].trim(), sourceName: match[2].trim() };
  }
  return { cleanTitle: title, sourceName: UNKNOWN_SOURCE_NAME };
}

/** Date RFC 2822 → AAAA-MM-JJ ; date du jour si illisible. */
function toIsoDate(dateStr: string): string {
  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsedDate.toISOString().slice(0, 10);
}

/**
 * Recherche les articles mentionnant « Prénom Nom » (expression exacte) et
 * les renvoie rattachés à `officialId`. Renvoie [] si Google répond en erreur.
 */
export async function fetchPressMentions(
  officialId: string,
  firstName: string,
  lastName: string,
  fetchFn: typeof fetch = fetch,
): Promise<PressMentionData[]> {
  const query = encodeURIComponent(`"${firstName} ${lastName}"`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=fr&gl=FR&ceid=FR:fr`;

  const response = await fetchFn(url);
  if (!response.ok) return [];

  const xml = await response.text();
  const items = parseRss(xml);

  return items.map((item) => {
    const { cleanTitle, sourceName } = extractSourceName(item.title);
    return {
      officialId,
      title: cleanTitle.slice(0, MAX_TITLE_LENGTH),
      sourceName: sourceName.slice(0, MAX_SOURCE_NAME_LENGTH),
      sourceUrl: item.link.slice(0, MAX_SOURCE_URL_LENGTH),
      publishedDate: toIsoDate(item.pubDate),
    };
  });
}
