'use client';

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
