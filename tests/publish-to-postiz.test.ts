import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildOfficialCaption,
  buildVoteCaption,
  uploadImage,
  createPost,
} from '../scripts/publish-to-postiz.js';
import type {
  OfficialData,
  VoteData,
} from '../scripts/generate-social-image.js';

const officialData: OfficialData = {
  firstName: 'Marie',
  lastName: 'Dupont',
  photoUrl: null,
  politicalGroup: 'Les Républicains',
  district: '3e circ.',
  department: 'Paris',
  slug: 'marie-dupont',
  mandateType: 'depute',
};

const voteData: VoteData = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: "Projet de loi relatif à l'accélération de la transition énergétique",
  date: '2026-03-15',
  forCount: 312,
  againstCount: 245,
  abstainCount: 12,
  absentCount: 8,
};

describe('buildOfficialCaption', () => {
  it('includes name and political group', () => {
    const caption = buildOfficialCaption(officialData);
    expect(caption).toContain('Marie Dupont');
    expect(caption).toContain('Les Républicains');
  });

  it('includes mandate type', () => {
    const caption = buildOfficialCaption(officialData);
    expect(caption).toContain('Député·e');
  });

  it('includes district and department', () => {
    const caption = buildOfficialCaption(officialData);
    expect(caption).toContain('3e circ.');
    expect(caption).toContain('Paris');
  });

  it('includes elupedia URL', () => {
    const caption = buildOfficialCaption(officialData);
    expect(caption).toContain('https://elupedia.fr/elus/marie-dupont');
  });

  it('handles missing political group', () => {
    const data = { ...officialData, politicalGroup: null };
    const caption = buildOfficialCaption(data);
    expect(caption).not.toContain('(null)');
    expect(caption).toContain('Marie Dupont —');
  });

  it('uses sénateur label for senateurs', () => {
    const data = { ...officialData, mandateType: 'senateur' };
    const caption = buildOfficialCaption(data);
    expect(caption).toContain('Sénateur·rice');
  });
});

describe('buildVoteCaption', () => {
  it('includes vote title', () => {
    const caption = buildVoteCaption(voteData);
    expect(caption).toContain('transition énergétique');
  });

  it('shows adopted when for > against', () => {
    const caption = buildVoteCaption(voteData);
    expect(caption).toContain('Adopté');
  });

  it('shows rejected when against > for', () => {
    const data = { ...voteData, forCount: 100, againstCount: 400 };
    const caption = buildVoteCaption(data);
    expect(caption).toContain('Rejeté');
  });

  it('includes vote counts', () => {
    const caption = buildVoteCaption(voteData);
    expect(caption).toContain('312 pour');
    expect(caption).toContain('245 contre');
    expect(caption).toContain('12 abstentions');
  });

  it('includes elupedia URL', () => {
    const caption = buildVoteCaption(voteData);
    expect(caption).toContain(
      'https://elupedia.fr/scrutins/123e4567-e89b-12d3-a456-426614174000',
    );
  });
});

describe('uploadImage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends a POST with the image and returns media id', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 'media-123', path: '/uploads/x.png' }),
        {
          status: 200,
        },
      ),
    );

    const id = await uploadImage(Buffer.from('fake-png'), 'test.png');
    expect(id).toBe('media-123');

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/media/upload');
    expect((call[1] as RequestInit).method).toBe('POST');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(uploadImage(Buffer.from('x'), 'test.png')).rejects.toThrow(
      'Postiz upload failed (401)',
    );
  });
});

describe('createPost', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends caption and media id, returns post id', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'post-456' }), { status: 200 }),
    );

    const id = await createPost('Hello world', 'media-123');
    expect(id).toBe('post-456');

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/posts');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.content).toBe('Hello world');
    expect(body.media).toEqual([{ id: 'media-123' }]);
    expect(body.publishNow).toBe(true);
  });

  it('throws on non-ok response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response('Server Error', { status: 500 }),
    );

    await expect(createPost('text', 'id')).rejects.toThrow(
      'Postiz post creation failed (500)',
    );
  });
});
