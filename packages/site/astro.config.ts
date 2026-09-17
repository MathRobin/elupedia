import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.elupedia.fr',
  integrations: [react()],
  vite: {
    envDir: '../../',
    define: {
      'import.meta.env.DATABASE_URL': 'undefined',
    },
    plugins: [tailwindcss()],
  },
  output: 'static',
  adapter: vercel({
    // satori (used to render OG images) loads harfbuzzjs' hb.wasm at
    // runtime via fs, so Vercel's dependency tracer (@vercel/nft) misses
    // it and the function 500s with ENOENT in production.
    includeFiles: ['../../node_modules/harfbuzzjs/hb.wasm'],
  }),
});
