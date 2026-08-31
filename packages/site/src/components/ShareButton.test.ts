import { describe, it, expect } from 'vitest';
import { buildShareUrl } from './ShareButton';

describe('buildShareUrl', () => {
  const url = 'https://elupedia.fr/elus/jean-dupont';
  const title = 'Jean Dupont — Député';

  it('generates an email mailto link', () => {
    const result = buildShareUrl('email', url, title);
    expect(result).toContain('mailto:?subject=');
    expect(result).toContain(encodeURIComponent(title));
    expect(result).toContain(encodeURIComponent(url));
  });

  it('generates a Facebook share link', () => {
    const result = buildShareUrl('facebook', url, title);
    expect(result).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    );
  });

  it('generates an X/Twitter intent link', () => {
    const result = buildShareUrl('x', url, title);
    expect(result).toContain('https://x.com/intent/tweet?');
    expect(result).toContain(`url=${encodeURIComponent(url)}`);
    expect(result).toContain(`text=${encodeURIComponent(title)}`);
  });

  it('handles special characters in title', () => {
    const specialTitle = 'Élu avec des accents & symboles <>';
    const result = buildShareUrl('x', url, specialTitle);
    expect(result).toContain(encodeURIComponent(specialTitle));
  });

  it('returns # for unknown platforms', () => {
    expect(buildShareUrl('unknown', url, title)).toBe('#');
  });
});
