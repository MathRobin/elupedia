import { stat, open } from 'node:fs/promises';
import { Readable } from 'node:stream';

/**
 * Client minimal YouTube Data API v3 (fetch natif, pas de SDK) : OAuth 2.0
 * (application installée, redirection loopback), upload « resumable » d'une
 * vidéo, vignette. Une vidéo verticale de moins de 3 minutes est traitée
 * comme un Short par YouTube, sans paramètre spécifique.
 */

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const THUMBNAIL_URL =
  'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';

/** Catégorie « Actualités et politique ». */
export const CATEGORY_NEWS_POLITICS = '25';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export function buildAuthUrl(client: OAuthClient, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(
  body: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(
      `OAuth Google HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function exchangeCode(
  client: OAuthClient,
  code: string,
  redirectUri: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ refreshToken: string }> {
  const t = await tokenRequest(
    {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    },
    fetchFn,
  );
  if (!t.refresh_token) {
    throw new Error(
      "Google n'a pas renvoyé de refresh_token : révoquer l'accès de l'application dans le compte Google et recommencer",
    );
  }
  return { refreshToken: t.refresh_token };
}

export async function refreshAccessToken(
  client: OAuthClient,
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const t = await tokenRequest(
    {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    fetchFn,
  );
  return t.access_token;
}

export type PrivacyStatus = 'public' | 'unlisted' | 'private';

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: PrivacyStatus;
}

export interface YoutubeUploader {
  uploadVideo(filePath: string, meta: VideoMetadata): Promise<string>;
  /** Ne lève pas : une vignette personnalisée exige un compte vérifié. */
  setThumbnail(videoId: string, filePath: string): Promise<boolean>;
}

/** Nettoie titre et description aux limites de l'API (100 / 5000 caractères, pas de < >). */
export function sanitizeMetadata(meta: VideoMetadata): VideoMetadata {
  const clean = (s: string) => s.replace(/[<>]/g, '');
  return {
    ...meta,
    title: clean(meta.title).slice(0, 100),
    description: clean(meta.description).slice(0, 5000),
    tags: meta.tags
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0 && t.length <= 30)
      .slice(0, 20),
  };
}

export function createYoutubeUploader(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): YoutubeUploader {
  const auth = { Authorization: `Bearer ${accessToken}` };
  return {
    async uploadVideo(filePath, rawMeta) {
      const meta = sanitizeMetadata(rawMeta);
      const size = (await stat(filePath)).size;
      const init = await fetchFn(UPLOAD_URL, {
        method: 'POST',
        headers: {
          ...auth,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(size),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
            categoryId: CATEGORY_NEWS_POLITICS,
            defaultLanguage: 'fr',
            defaultAudioLanguage: 'fr',
          },
          status: {
            privacyStatus: meta.privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        }),
      });
      if (!init.ok) {
        throw new Error(
          `YouTube upload init HTTP ${init.status} : ${(await init.text()).slice(0, 300)}`,
        );
      }
      const location = init.headers.get('location');
      if (!location) throw new Error('YouTube : pas d’URL de session d’upload');

      const handle = await open(filePath, 'r');
      try {
        const res = await fetchFn(location, {
          method: 'PUT',
          headers: {
            ...auth,
            'Content-Type': 'video/mp4',
            'Content-Length': String(size),
          },
          body: Readable.toWeb(handle.createReadStream()) as ReadableStream,
          // @ts-expect-error — requis par Node pour un corps en flux.
          duplex: 'half',
        });
        if (!res.ok) {
          throw new Error(
            `YouTube upload HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`,
          );
        }
        const data = (await res.json()) as { id?: string };
        if (!data.id) throw new Error('YouTube : réponse sans identifiant');
        return data.id;
      } finally {
        await handle.close();
      }
    },

    async setThumbnail(videoId, filePath) {
      const handle = await open(filePath, 'r');
      try {
        const size = (await handle.stat()).size;
        const res = await fetchFn(`${THUMBNAIL_URL}?videoId=${videoId}`, {
          method: 'POST',
          headers: {
            ...auth,
            'Content-Type': 'image/png',
            'Content-Length': String(size),
          },
          body: Readable.toWeb(handle.createReadStream()) as ReadableStream,
          // @ts-expect-error — requis par Node pour un corps en flux.
          duplex: 'half',
        });
        return res.ok;
      } finally {
        await handle.close();
      }
    },
  };
}
