import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Le code partagé (@elupedia/shared, @elupedia/shorts) est écrit en TypeScript
 * avec des imports `./x.js` (convention Node16). webpack les résout vers
 * `.ts`/`.tsx` grâce à `extensionAlias` ; Turbopack, bundler par défaut de
 * Next 16, ne le fait pas pour les paquets hors de l'application (erreurs
 * « Can't resolve './db.js' »). Les scripts `dev` et `build` passent donc
 * `--webpack` explicitement.
 *
 * Hébergement Vercel (admin.elupedia.fr, packages/admin/vercel.json) : la
 * racine de traçage est celle du monorepo, pour embarquer les workspaces dans
 * les fonctions, et les DAGs `dagu-dags/*.yaml` (lus à l'exécution par la page
 * Ingestions) sont ajoutés explicitement. L'admin n'est jamais indexée.
 */
const repoRoot = path.resolve(process.cwd(), '..', '..');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@elupedia/shared',
    '@elupedia/shorts',
    '@elupedia/ingest',
  ],
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/ingestions': ['../../dagu-dags/*.yaml'],
  },
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
