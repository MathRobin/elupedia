import sax from 'sax';

export interface PressMentionData {
  officialId: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedDate: string;
}

function parseRss(
  xml: string,
): { title: string; link: string; pubDate: string; source: string }[] {
  const items: {
    title: string;
    link: string;
    pubDate: string;
    source: string;
  }[] = [];
  const parser = sax.parser(false, { lowercase: true });

  let inItem = false;
  let currentTag = '';
  let currentItem = { title: '', link: '', pubDate: '', source: '' };

  parser.onopentag = (node) => {
    if (node.name === 'item') {
      inItem = true;
      currentItem = { title: '', link: '', pubDate: '', source: '' };
    }
    if (inItem) {
      currentTag = node.name;
      if (node.name === 'source') {
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

function extractSourceName(title: string): {
  cleanTitle: string;
  sourceName: string;
} {
  const match = title.match(/^(.*)\s+-\s+(.+)$/);
  if (match) {
    return { cleanTitle: match[1].trim(), sourceName: match[2].trim() };
  }
  return { cleanTitle: title, sourceName: 'Inconnu' };
}

function toIsoDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export async function fetchPressMentions(
  officialId: string,
  lastName: string,
  fetchFn: typeof fetch = fetch,
): Promise<PressMentionData[]> {
  const query = encodeURIComponent(`"${lastName}"`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=fr&gl=FR&ceid=FR:fr`;

  const response = await fetchFn(url);
  if (!response.ok) return [];

  const xml = await response.text();
  const items = parseRss(xml);

  return items.map((item) => {
    const { cleanTitle, sourceName } = extractSourceName(item.title);
    return {
      officialId,
      title: cleanTitle.slice(0, 1024),
      sourceName: sourceName.slice(0, 255),
      sourceUrl: item.link.slice(0, 1024),
      publishedDate: toIsoDate(item.pubDate),
    };
  });
}
