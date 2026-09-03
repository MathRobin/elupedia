'use client';

import { useEffect, useState } from 'react';
import { Badge, NavLink } from '@mantine/core';
import { usePathname } from 'next/navigation';
import { countDuplicates } from '@/app/elus/doublons/actions';

export function AdminSidebar() {
  const pathname = usePathname();
  const [dupCount, setDupCount] = useState<number | null>(null);

  useEffect(() => {
    countDuplicates()
      .then(setDupCount)
      .catch(() => {});
  }, []);

  return (
    <nav aria-label="Navigation admin">
      <NavLink label="Élus" defaultOpened>
        <NavLink
          label="Doublons"
          href="/elus/doublons"
          component="a"
          active={pathname === '/elus/doublons'}
          rightSection={
            dupCount != null && dupCount > 0 ? (
              <Badge size="sm" variant="filled" color="red" circle>
                {dupCount}
              </Badge>
            ) : undefined
          }
        />
      </NavLink>
      <NavLink label="Modération" defaultOpened>
        <NavLink
          label="Queue de modération"
          href="/moderation"
          component="a"
          active={pathname === '/moderation'}
        />
      </NavLink>
      <NavLink label="Utilisateurs" defaultOpened>
        <NavLink
          label="Gestion des comptes"
          href="/users"
          component="a"
          active={pathname === '/users'}
        />
      </NavLink>
    </nav>
  );
}
