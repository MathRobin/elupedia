import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  site: 'https://www.elupedia.fr',
  integrations: [react(), sitemap()],
  vite: {
    envDir: '../../',
    define: {
      'import.meta.env.DATABASE_URL': 'undefined',
    },
    plugins: [tailwindcss()],
  },
  output: 'hybrid',
  adapter: vercel(),
});
