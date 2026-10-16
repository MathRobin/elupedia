import type { NextConfig } from 'next';

/**
 * Le code partagé (@elupedia/shared, @elupedia/shorts) est écrit en TypeScript
 * avec des imports `./x.js` (convention Node16). webpack les résout vers
 * `.ts`/`.tsx` grâce à `extensionAlias` ; Turbopack, bundler par défaut de
 * Next 16, ne le fait pas pour les paquets hors de l'application (erreurs
 * « Can't resolve './db.js' »). Les scripts `dev` et `build` passent donc
 * `--webpack` explicitement.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@elupedia/shared', '@elupedia/shorts'],
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
};

export default nextConfig;
