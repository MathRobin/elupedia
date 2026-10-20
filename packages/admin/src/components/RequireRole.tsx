'use client';

/**
 * Garde d'accès côté client : n'affiche ses enfants que si le rôle de la
 * session Auth.js (useSession, injecté par le callback `session` de
 * lib/auth.ts) est exactement `role` ; Loader pendant le chargement, alerte
 * « Accès refusé » sinon. Comparaison stricte : un admin n'est pas accepté
 * là où role="moderator" est demandé. Protection d'affichage seulement : les
 * actions serveur revérifient le rôle de leur côté.
 */
import { useSession } from 'next-auth/react';
import { Alert, Container, Loader } from '@mantine/core';

interface RequireRoleProps {
  role: string;
  children: React.ReactNode;
}

export function RequireRole({ role, children }: RequireRoleProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  const userRole = (session?.user as { role?: string } | undefined)?.role;

  if (userRole !== role) {
    return (
      <Container py="xl">
        <Alert color="red" title="Accès refusé">
          Vous n&apos;avez pas les droits nécessaires pour accéder à cette page.
          Rôle requis : {role}.
        </Alert>
      </Container>
    );
  }

  return <>{children}</>;
}
