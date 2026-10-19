/** Tests de external-link-url.ts : forme canonique et clé de comparaison. */
import { describe, it, expect } from 'vitest';
import {
  normalizeExternalLinkUrl,
  externalLinkComparisonKey,
} from './external-link-url.js';

describe('normalizeExternalLinkUrl', () => {
  it('strips trailing slashes, including on the root', () => {
    expect(normalizeExternalLinkUrl('https://www.cuzy.fr/')).toBe(
      'https://www.cuzy.fr',
    );
    expect(normalizeExternalLinkUrl('https://www.instagram.com/compte/')).toBe(
      'https://www.instagram.com/compte',
    );
    expect(normalizeExternalLinkUrl('https://site.fr/page//')).toBe(
      'https://site.fr/page',
    );
  });
  it('lowercases scheme and host, keeps path case and query, trims', () => {
    expect(
      normalizeExternalLinkUrl(
        '  HTTPS://WWW.Instagram.com/ArthurDelaporte/?hl=fr ',
      ),
    ).toBe('https://www.instagram.com/ArthurDelaporte?hl=fr');
  });
  it('leaves non-URL strings trimmed', () => {
    expect(normalizeExternalLinkUrl(' pas une url ')).toBe('pas une url');
    expect(normalizeExternalLinkUrl('mailto:x@y.fr')).toBe('mailto:x@y.fr');
  });
});

describe('externalLinkComparisonKey', () => {
  it('ignores scheme, www and trailing slash', () => {
    const key = externalLinkComparisonKey('https://www.meaulne.fr/');
    expect(externalLinkComparisonKey('http://meaulne.fr')).toBe(key);
    expect(externalLinkComparisonKey('HTTP://www.MEAULNE.fr/')).toBe(key);
  });
});
