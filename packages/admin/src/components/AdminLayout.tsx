'use client';

/**
 * Coquille de l'admin (AppShell Mantine) : header avec titre et burger (menu
 * replié sous le point de rupture sm), navbar contenant AdminSidebar, zone
 * principale pour la page. Monté par app/layout.tsx autour de toutes les
 * pages, /login comprise. L'état ouvert/fermé du menu mobile est local.
 */
import { AppShell, Burger, Group, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AdminSidebar } from './AdminSidebar';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
            aria-label="Menu"
          />
          <Title order={3}>Elupedia Admin</Title>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AdminSidebar />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
