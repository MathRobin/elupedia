'use client';

/**
 * Fournisseurs de contexte côté client, montés une fois par app/layout.tsx :
 * SessionProvider (Auth.js, nécessaire à useSession dans RequireRole) et
 * MantineProvider avec le thème de ./theme.ts. Fichier séparé du layout
 * parce que ces providers sont des composants client alors que le layout
 * racine reste un composant serveur.
 */
import { MantineProvider } from '@mantine/core';
import { SessionProvider } from 'next-auth/react';
import { theme } from './theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MantineProvider theme={theme}>{children}</MantineProvider>
    </SessionProvider>
  );
}
