/**
 * Tests de l'extracteur de liens sociaux d'annuaires de groupes (ticket #275).
 * Fixtures HTML statiques (sources/fixtures/group-directories/), aucun réseau.
 * Les sélecteurs viennent de GROUP_DIRECTORY_SOURCES : si la config change,
 * ces tests le signalent.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { GROUP_DIRECTORY_SOURCES } from '../config/group-directories.js';
import {
  extractPageSocialLinks,
  extractSocialLinks,
  normalizeSocialUrl,
} from './group-directory-social-links.js';

function fixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/group-directories/${name}`, import.meta.url),
    'utf8',
  );
}

function sourceFor(code: string) {
  const source = GROUP_DIRECTORY_SOURCES.find((s) => s.groupCode === code);
  if (!source) throw new Error(`groupe ${code} absent de la config`);
  return source;
}

describe('normalizeSocialUrl', () => {
  it('ramène twitter.com et x.com sur x.com, sans paramètres', () => {
    expect(
      normalizeSocialUrl('https://twitter.com/SomeOne?utm_source=share&s=20'),
    ).toEqual({
      platform: 'x',
      url: 'https://x.com/someone',
      handle: 'someone',
    });
  });

  it('retire le @ et le slash final sur X', () => {
    expect(normalizeSocialUrl('https://x.com/@sebchenu/')?.url).toBe(
      'https://x.com/sebchenu',
    );
  });

  it('refuse les pages X qui ne sont pas un compte', () => {
    expect(
      normalizeSocialUrl('https://twitter.com/intent/tweet?url=a'),
    ).toBeNull();
    expect(normalizeSocialUrl('https://twitter.com/search?q=a')).toBeNull();
  });

  it('classe Facebook, retire les paramètres de suivi, garde l’id des profils', () => {
    expect(
      normalizeSocialUrl('https://www.facebook.com/Chenu.Sebastien/?ref_src=x'),
    ).toEqual({
      platform: 'facebook',
      url: 'https://www.facebook.com/chenu.sebastien',
      handle: 'chenu.sebastien',
    });
    expect(
      normalizeSocialUrl(
        'https://www.facebook.com/profile.php?id=100012345&ref=x',
      ),
    ).toEqual({
      platform: 'facebook',
      url: 'https://www.facebook.com/profile.php?id=100012345',
      handle: '100012345',
    });
  });

  it('refuse les liens de partage Facebook', () => {
    expect(
      normalizeSocialUrl('http://www.facebook.com/sharer.php?s=100&p[url]=x'),
    ).toBeNull();
  });

  it('classe Instagram en minuscules, refuse les publications', () => {
    expect(
      normalizeSocialUrl('https://www.instagram.com/BorisVallaud/?hl=fr'),
    ).toEqual({
      platform: 'instagram',
      url: 'https://www.instagram.com/borisvallaud',
      handle: 'borisvallaud',
    });
    expect(
      normalizeSocialUrl('https://www.instagram.com/p/ABC123/'),
    ).toBeNull();
  });

  it('classe TikTok avec son @', () => {
    expect(normalizeSocialUrl('https://www.tiktok.com/@Some.One')).toEqual({
      platform: 'tiktok',
      url: 'https://www.tiktok.com/@some.one',
      handle: 'some.one',
    });
  });

  it('classe YouTube : @handle, /channel/ (casse conservée), /c/ et /user/', () => {
    expect(
      normalizeSocialUrl('https://www.youtube.com/@Chaine/videos?si=abc'),
    ).toEqual({
      platform: 'youtube',
      url: 'https://www.youtube.com/@chaine',
      handle: 'chaine',
    });
    expect(
      normalizeSocialUrl(
        'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      )?.url,
    ).toBe('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv');
    expect(normalizeSocialUrl('https://www.youtube.com/c/Nom')?.url).toBe(
      'https://www.youtube.com/c/nom',
    );
  });

  it('refuse les vidéos YouTube et youtu.be', () => {
    expect(
      normalizeSocialUrl('https://www.youtube.com/watch?v=abc'),
    ).toBeNull();
    expect(normalizeSocialUrl('https://youtu.be/abc')).toBeNull();
  });

  it('classe LinkedIn (profil et page) et Bluesky', () => {
    expect(
      normalizeSocialUrl('https://fr.linkedin.com/in/Jane-Doe?trk=x')?.url,
    ).toBe('https://www.linkedin.com/in/jane-doe');
    expect(normalizeSocialUrl('https://www.linkedin.com/feed/')).toBeNull();
    expect(
      normalizeSocialUrl('https://bsky.app/profile/Name.bsky.social'),
    ).toEqual({
      platform: 'bluesky',
      url: 'https://bsky.app/profile/name.bsky.social',
      handle: 'name.bsky.social',
    });
  });

  it('classe Mastodon sur une instance connue seulement', () => {
    expect(normalizeSocialUrl('https://mastodon.social/@User')).toEqual({
      platform: 'mastodon',
      url: 'https://mastodon.social/@user',
      handle: 'user',
    });
    expect(
      normalizeSocialUrl('https://unknown-instance.example/@user'),
    ).toBeNull();
  });

  it('rejette les domaines qui ressemblent à une plateforme et les liens non http(s)', () => {
    expect(normalizeSocialUrl('https://notx.com/someone')).toBeNull();
    expect(
      normalizeSocialUrl('https://twitter.com.evil.example/someone'),
    ).toBeNull();
    expect(normalizeSocialUrl('mailto:a@b.fr')).toBeNull();
    expect(normalizeSocialUrl('/relatif/chemin')).toBeNull();
    expect(normalizeSocialUrl('pas une url')).toBeNull();
  });

  it('écarte les comptes exclus (Assemblée par défaut, liste personnalisée sinon)', () => {
    expect(normalizeSocialUrl('https://twitter.com/AssembleeNat')).toBeNull();
    expect(
      normalizeSocialUrl('https://fr-fr.facebook.com/AssembleeNationale'),
    ).toBeNull();
    expect(
      normalizeSocialUrl('https://twitter.com/AssembleeNat', {
        excludedHandles: [],
      })?.url,
    ).toBe('https://x.com/assembleenat');
    expect(
      normalizeSocialUrl('https://x.com/parti_exemple', {
        excludedHandles: ['parti_exemple'],
      }),
    ).toBeNull();
  });
});

describe('extractSocialLinks (pages de liste)', () => {
  it.each([
    [
      'RN',
      'rn-list.html',
      ['M. Sébastien Chenu', 'M. Franck Allisio', 'M. Maxime Amblard'],
    ],
    [
      'EPR',
      'epr-list.html',
      ['M. Gabriel Attal', 'M. Pieyre-Alexandre Anglade'],
    ],
    ['SOC', 'soc-list.html', ['M. Boris Vallaud', 'Mme Marie-José Allemand']],
  ])(
    'extrait les noms (espaces insécables remplacés) du groupe %s',
    (code, file, expectedNames) => {
      const members = extractSocialLinks(fixture(file), sourceFor(code));
      expect(members.map((m) => m.name)).toEqual(expectedNames);
      // Les pages de liste de l'Assemblée n'ont pas de liens sociaux.
      expect(members.every((m) => m.links.length === 0)).toBe(true);
    },
  );

  it('relit les liens sociaux de chaque entrée, normalisés et dédoublonnés', () => {
    const html = `
      <ul>
        <li data-acteur-id="A1">
          <a class="nom">Élu&nbsp;Un</a>
          <a class="reseau" href="https://twitter.com/elu_un?s=20">X</a>
          <a class="reseau" href="https://x.com/Elu_Un/">X bis</a>
          <a class="reseau" href="https://www.instagram.com/elu.un/">IG</a>
          <a class="reseau" href="https://twitter.com/AssembleeNat">AN</a>
        </li>
        <li data-acteur-id="A2">
          <a class="nom">  Élue   Deux </a>
        </li>
      </ul>`;
    const members = extractSocialLinks(html, {
      listItemSelector: 'li[data-acteur-id]',
      nameSelector: 'a.nom',
      socialLinkSelector: 'a.reseau',
    });
    expect(members).toEqual([
      {
        name: 'Élu Un',
        links: [
          { platform: 'x', url: 'https://x.com/elu_un', handle: 'elu_un' },
          {
            platform: 'instagram',
            url: 'https://www.instagram.com/elu.un',
            handle: 'elu.un',
          },
        ],
      },
      { name: 'Élue Deux', links: [] },
    ]);
  });

  it('renvoie name null quand le sélecteur de nom ne trouve rien', () => {
    const members = extractSocialLinks(
      '<ul><li data-acteur-id="A3"></li></ul>',
      {
        listItemSelector: 'li',
        nameSelector: 'a.nom',
        socialLinkSelector: 'a',
      },
    );
    expect(members).toEqual([{ name: null, links: [] }]);
  });
});

describe('extractPageSocialLinks (fiches individuelles)', () => {
  it.each([
    [
      'RN',
      'rn-fiche-chenu.html',
      [
        { platform: 'x', url: 'https://x.com/sebchenu', handle: 'sebchenu' },
        {
          platform: 'facebook',
          url: 'https://www.facebook.com/chenu.sebastien',
          handle: 'chenu.sebastien',
        },
      ],
    ],
    [
      'EPR',
      'epr-fiche-attal.html',
      [
        {
          platform: 'x',
          url: 'https://x.com/gabrielattal',
          handle: 'gabrielattal',
        },
      ],
    ],
    [
      'SOC',
      'soc-fiche-vallaud.html',
      [
        {
          platform: 'x',
          url: 'https://x.com/borisvallaud',
          handle: 'borisvallaud',
        },
        {
          platform: 'instagram',
          url: 'https://www.instagram.com/borisvallaud',
          handle: 'borisvallaud',
        },
      ],
    ],
  ])(
    'ignore le menu de l’Assemblée et garde les liens du député (%s)',
    (code, file, expected) => {
      const links = extractPageSocialLinks(
        fixture(file),
        sourceFor(code).socialLinkSelector,
      );
      expect(links).toEqual(expected);
    },
  );

  it('applique la liste d’exclusion aux liens de la fiche', () => {
    const links = extractPageSocialLinks(
      fixture('rn-fiche-chenu.html'),
      sourceFor('RN').socialLinkSelector,
      { excludedHandles: ['sebchenu'] },
    );
    expect(links.map((l) => l.handle)).toEqual(['chenu.sebastien']);
  });
});
