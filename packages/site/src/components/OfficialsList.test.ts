import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFiltersFromUrl } from './OfficialsList';

describe('readFiltersFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no filters when there is no window (SSR)', () => {
    expect(readFiltersFromUrl()).toEqual({ filters: {} });
  });

  it('parses a single mandate type filter from the URL', () => {
    vi.stubGlobal('window', { location: { search: '?type=senateur' } });

    const { filters } = readFiltersFromUrl();

    expect(filters.senateur).toBe(true);
    expect(filters.depute).toBe(false);
    expect(filters.maire).toBe(false);
  });

  it('parses search, department, group, sort and page together', () => {
    vi.stubGlobal('window', {
      location: {
        search: '?q=dupont&dep=75&groupe=RE&tri=department&page=3',
      },
    });

    const { filters, page } = readFiltersFromUrl();

    expect(filters.search).toBe('dupont');
    expect(filters.department).toBe('75');
    expect(filters.group).toBe('RE');
    expect(filters.sort).toBe('department');
    expect(page).toBe(3);
  });
});
