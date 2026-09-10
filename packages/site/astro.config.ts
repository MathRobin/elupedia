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
  adapter: vercel(),
});
