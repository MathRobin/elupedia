import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress } from './geocoder.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('geocodeAddress', () => {
  it('returns coordinates for a valid address', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [2.3522, 48.8566] },
            properties: { score: 0.95, label: 'Paris' },
          },
        ],
      }),
    });

    const result = await geocodeAddress('Paris');
    expect(result).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
      score: 0.95,
      label: 'Paris',
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('Paris');
    expect(url.searchParams.get('limit')).toBe('1');
  });

  it('returns null when score is too low', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [0, 0] },
            properties: { score: 0.2, label: 'Unknown' },
          },
        ],
      }),
    });

    expect(await geocodeAddress('xyz')).toBeNull();
  });

  it('returns null when no features', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
    });

    expect(await geocodeAddress('nowhere')).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await geocodeAddress('test')).toBeNull();
  });
});
