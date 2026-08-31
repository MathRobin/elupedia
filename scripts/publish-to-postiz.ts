import 'dotenv/config';
import { readFileSync } from 'node:fs';
import type { OfficialData, VoteData } from './generate-social-image.js';

const POSTIZ_URL = process.env.POSTIZ_URL ?? 'https://app.postiz.com';
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY ?? '';

export function buildOfficialCaption(data: OfficialData): string {
  const mandateLabel =
    data.mandateType === 'depute'
      ? 'Député·e'
      : data.mandateType === 'senateur'
        ? 'Sénateur·rice'
        : data.mandateType;

  const location = [data.district, data.department].filter(Boolean).join(', ');
  const group = data.politicalGroup ? ` (${data.politicalGroup})` : '';
  const url = `https://elupedia.fr/elus/${data.slug ?? ''}`;

  return (
    `Focus élu : ${data.firstName} ${data.lastName}${group} — ${mandateLabel}` +
    (location ? ` de la ${location}` : '') +
    `.\n\nRetrouvez l'intégralité de son activité et de ses votes sur Élupedia :\n${url}`
  );
}

export function buildVoteCaption(data: VoteData): string {
  const adopted = data.forCount > data.againstCount;
  const result = adopted ? 'Adopté' : 'Rejeté';
  const dateFormatted = new Date(data.date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const url = `https://elupedia.fr/scrutins/${data.id}`;

  return (
    `Scrutin du ${dateFormatted} : ${data.title}\n\n` +
    `Résultat : ${result} (${data.forCount} pour, ${data.againstCount} contre, ` +
    `${data.abstainCount} abstentions, ${data.absentCount} absents).\n\n` +
    `Détail complet sur Élupedia :\n${url}`
  );
}

export async function uploadImage(
  png: Buffer,
  filename: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([png], { type: 'image/png' }), filename);

  const res = await fetch(`${POSTIZ_URL}/api/v1/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${POSTIZ_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Postiz upload failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as { id: string; path: string };
  console.log(`Image uploaded: ${body.id}`);
  return body.id;
}

export async function createPost(
  caption: string,
  mediaId: string,
): Promise<string> {
  const res = await fetch(`${POSTIZ_URL}/api/v1/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${POSTIZ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'social',
      content: caption,
      media: [{ id: mediaId }],
      publishNow: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Postiz post creation failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as { id: string };
  console.log(`Post created: ${body.id}`);
  return body.id;
}

async function main() {
  if (!POSTIZ_API_KEY) {
    console.error('POSTIZ_API_KEY is required');
    process.exit(1);
  }

  const mode = process.argv[2];
  const imagePath = process.argv[3];
  const dataPath = process.argv[4];

  if (!mode || !imagePath || !dataPath) {
    console.error(
      'Usage: tsx scripts/publish-to-postiz.ts <official|vote> <image.png> <data.json>',
    );
    process.exit(1);
  }

  const png = readFileSync(imagePath);
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

  let caption: string;
  if (mode === 'official') {
    caption = buildOfficialCaption(data as OfficialData);
  } else if (mode === 'vote') {
    caption = buildVoteCaption(data as VoteData);
  } else {
    console.error('Mode must be "official" or "vote"');
    process.exit(1);
  }

  console.log('Caption:\n', caption, '\n');

  const mediaId = await uploadImage(png, `social-${mode}.png`);
  const postId = await createPost(caption, mediaId);

  console.log(`Published: ${POSTIZ_URL}/posts/${postId}`);
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
