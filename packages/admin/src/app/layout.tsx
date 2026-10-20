/**
 * Layout racine de l'admin (composant serveur) : html/body, métadonnées,
 * script de schéma de couleurs Mantine, puis Providers (session + thème) et
 * AdminLayout (coquille header/sidebar). Toutes les pages, /login comprise,
 * s'affichent dans cette coquille ; la protection d'accès est faite en amont
 * par proxy.ts (redirection vers /login si non connecté).
 */
import type { Metadata } from 'next';
import { ColorSchemeScript } from '@mantine/core';
import '@mantine/core/styles.css';
import { Providers } from './providers';
import { AdminLayout } from '../components/AdminLayout';

export const metadata: Metadata = {
  title: 'Elupedia Admin',
  description: 'Backoffice de modération Elupedia',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <Providers>
          <AdminLayout>{children}</AdminLayout>
        </Providers>
      </body>
    </html>
  );
}
