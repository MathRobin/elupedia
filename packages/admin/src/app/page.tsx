/**
 * Page d'accueil / de l'admin (composant serveur) : simple écran de
 * bienvenue, sans donnée ni action serveur. Accessible à tout utilisateur
 * connecté (proxy.ts redirige les anonymes vers /login) ; la navigation
 * réelle passe par la sidebar (components/AdminSidebar.tsx).
 */
import { Title, Text, Container } from '@mantine/core';

export default function Home() {
  return (
    <Container size="sm" py="xl">
      <Title order={1}>Elupedia Admin</Title>
      <Text mt="md" c="dimmed">
        Backoffice de modération — en construction.
      </Text>
    </Container>
  );
}
