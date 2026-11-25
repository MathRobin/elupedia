import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildAuthUrl,
  createYoutubeUploader,
  exchangeCode,
  refreshAccessToken,
  sanitizeMetadata,
  MAX_COMMENT_LENGTH,
  YOUTUBE_SCOPES,
} from './youtube.js';
import { buildMetadata } from './publish.js';

const client = { clientId: 'cid', clientSecret: 'sec' };

describe('OAuth helpers', () => {
  it('builds an offline-consent auth URL with the upload and comment scopes', () => {
    const url = new URL(buildAuthUrl(client, 'http://127.0.0.1:4242'));
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    // force-ssl est indispensable pour commenter ; sans lui, la publication
    // marche mais le commentaire part en 403 (voir l'en-tête de youtube.ts).
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl',
    );
    expect(YOUTUBE_SCOPES).toHaveLength(2);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4242');
  });

  it('exchanges a code and requires a refresh token', async () => {
    const fetchFn = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = init?.body as URLSearchParams;
        expect(body.get('grant_type')).toBe('authorization_code');
        return Response.json({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
        });
      },
    );
    const r = await exchangeCode(
      client,
      'code',
      'http://127.0.0.1:1',
      fetchFn as unknown as typeof fetch,
    );
    expect(r.refreshToken).toBe('r');

    const noRefresh = (async () =>
      Response.json({
        access_token: 'a',
        expires_in: 1,
      })) as unknown as typeof fetch;
    await expect(exchangeCode(client, 'c', 'u', noRefresh)).rejects.toThrow(
      'refresh_token',
    );
  });

  it('refreshes an access token', async () => {
    const fetchFn = (async () =>
      Response.json({
        access_token: 'fresh',
        expires_in: 3600,
      })) as unknown as typeof fetch;
    expect(await refreshAccessToken(client, 'r', fetchFn)).toBe('fresh');
  });
});

describe('sanitizeMetadata / buildMetadata', () => {
  it('trims to API limits and strips hashes from tags', () => {
    const m = sanitizeMetadata({
      title: 'x'.repeat(120) + '<b>',
      description: 'd',
      tags: ['#Elupedia', '#', ' #Sénat ', 'y'.repeat(31)],
      privacyStatus: 'public',
    });
    expect(m.title).toHaveLength(100);
    expect(m.tags).toEqual(['Elupedia', 'Sénat']);
  });

  it('builds the description from the facts and the script', () => {
    const m = buildMetadata(
      {
        script: {
          title: 't',
          scenes: [],
          description: 'desc',
          hashtags: ['#A', '#B'],
        },
        facts: { shortId: 's', ballots: [] },
      },
      'unlisted',
    );
    expect(m.description.startsWith('desc')).toBe(true);
    expect(m.description.trimEnd().endsWith('#A #B')).toBe(true);
    expect(m.description).toContain('Sources et vérification');
    expect(m.privacyStatus).toBe('unlisted');
  });
});

describe('createYoutubeUploader', () => {
  it('runs the resumable upload flow and returns the video id', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'yt-'));
    const file = path.join(dir, 'short.mp4');
    await writeFile(file, 'video-bytes');
    const calls: {
      url: string;
      method?: string;
      headers: Record<string, string>;
    }[] = [];
    const fetchFn = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          headers: init?.headers as Record<string, string>,
        });
        if (String(url).includes('uploadType=resumable')) {
          const body = JSON.parse(String(init?.body));
          expect(body.snippet.categoryId).toBe('25');
          expect(body.status.privacyStatus).toBe('public');
          expect(body.status.containsSyntheticMedia).toBe(true);
          return new Response(null, {
            status: 200,
            headers: { location: 'https://upload.example/session' },
          });
        }
        if (String(url) === 'https://upload.example/session') {
          return Response.json({ id: 'VIDEO123' });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
    const uploader = createYoutubeUploader(
      'tok',
      fetchFn as unknown as typeof fetch,
    );
    const id = await uploader.uploadVideo(file, {
      title: 't',
      description: 'd',
      tags: ['#a'],
      privacyStatus: 'public',
    });
    expect(id).toBe('VIDEO123');
    expect(calls[0].headers['X-Upload-Content-Length']).toBe('11');
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].headers['Content-Length']).toBe('11');
    expect(calls[1].headers.Authorization).toBe('Bearer tok');
    expect(calls).toHaveLength(2);
  });

  it('fails clearly when the session init is refused', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'yt-'));
    const file = path.join(dir, 'short.mp4');
    await writeFile(file, 'v');
    const fetchFn = (async () =>
      new Response('quota', { status: 403 })) as unknown as typeof fetch;
    const uploader = createYoutubeUploader('tok', fetchFn);
    await expect(
      uploader.uploadVideo(file, {
        title: 't',
        description: 'd',
        tags: [],
        privacyStatus: 'private',
      }),
    ).rejects.toThrow('HTTP 403');
  });
});

describe('postComment', () => {
  it('posts a top-level comment on the video and returns the thread id', async () => {
    let seen: { url: string; body: unknown; auth?: string } | null = null;
    const fetchFn = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        seen = {
          url: String(url),
          body: JSON.parse(String(init?.body)),
          auth: (init?.headers as Record<string, string>).Authorization,
        };
        return Response.json({ id: 'THREAD1' });
      },
    ) as unknown as typeof fetch;
    const uploader = createYoutubeUploader('tok', fetchFn);
    const id = await uploader.postComment('VIDEO123', '  Sources : …  ');
    expect(id).toBe('THREAD1');
    expect(seen!.url).toContain('commentThreads?part=snippet');
    expect(seen!.auth).toBe('Bearer tok');
    expect(seen!.body).toEqual({
      snippet: {
        videoId: 'VIDEO123',
        topLevelComment: { snippet: { textOriginal: 'Sources : …' } },
      },
    });
  });

  it('truncates at the comment limit', async () => {
    let envoye = '';
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      envoye = JSON.parse(String(init?.body)).snippet.topLevelComment.snippet
        .textOriginal;
      return Response.json({ id: 'T' });
    }) as unknown as typeof fetch;
    const uploader = createYoutubeUploader('tok', fetchFn);
    await uploader.postComment('V', 'x'.repeat(MAX_COMMENT_LENGTH + 500));
    expect(envoye).toHaveLength(MAX_COMMENT_LENGTH);
  });

  it('refuses an empty comment without calling the API', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const uploader = createYoutubeUploader('tok', fetchFn);
    await expect(uploader.postComment('V', '   ')).rejects.toThrow(
      'commentaire vide',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('points at the missing scope on a 403', async () => {
    const fetchFn = (async () =>
      new Response(
        '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
        {
          status: 403,
        },
      )) as unknown as typeof fetch;
    const uploader = createYoutubeUploader('tok', fetchFn);
    await expect(uploader.postComment('V', 'texte')).rejects.toThrow(
      'youtube.force-ssl',
    );
  });
});
