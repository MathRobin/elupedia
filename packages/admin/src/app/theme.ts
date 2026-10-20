/**
 * Thème Mantine de l'admin (couleur primaire, police système, rayon par
 * défaut), passé à MantineProvider dans app/providers.tsx. Seul endroit où
 * personnaliser l'apparence globale ; ne pas y mettre de logique.
 */
import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  defaultRadius: 'sm',
});
