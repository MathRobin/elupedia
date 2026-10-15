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
} from './youtube.js';
import { buildMetadata } from './publish.js';

const client = { clientId: 'cid', clientSecret: 'sec' };

describe('OAuth helpers', () => {
  it('builds an offline-consent auth URL with the upload scope', () => {
    const url = new URL(buildAuthUrl(client, 'http://127.0.0.1:4242'));
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/youtube.upload',
    );
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

  it('appends hashtags to the description', () => {
    const m = buildMetadata(
      { title: 't', scenes: [], description: 'desc', hashtags: ['#A', '#B'] },
      'unlisted',
    );
    expect(m.description).toBe('desc\n\n#A #B');
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
          return new Response(null, {
            status: 200,
            headers: { location: 'https://upload.example/session' },
          });
        }
        if (String(url) === 'https://upload.example/session') {
          return Response.json({ id: 'VIDEO123' });
        }
        if (String(url).includes('thumbnails/set')) {
          return new Response(null, { status: 403 });
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
    expect(await uploader.setThumbnail('VIDEO123', file)).toBe(false);
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
